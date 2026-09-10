import { randomUuid, sha256Hex } from "@narralume/domain";
import { PersistenceNotFoundError } from "./project-repository.js";
import type { NarrativeDatabase } from "./database.js";

export interface PlatformMetricInput {
  platform: string;
  chapter: string;
  date: string;
  words: number;
  views: number | null;
  likes: number | null;
  comments: number | null;
  source: "csv";
}

export interface PlatformMetricRecord extends PlatformMetricInput {
  id: string;
  projectId: string;
  updatedAt: string;
}

export interface PlatformMetricImportAudit {
  id: string;
  projectId: string;
  sourceHash: string;
  sourceRows: number;
  duplicateRows: number;
  addedCount: number;
  replacedCount: number;
  status: "active" | "rolled_back";
  createdAt: string;
  rolledBackAt: string | null;
}

export interface PlatformMetricReport {
  projectId: string;
  source: "csv";
  sourceLabel: string;
  dateSemantics: "source_calendar_date";
  timezone: string;
  metricDefinitions: {
    words: string;
    views: string;
    likes: string;
    comments: string;
  };
  recordCount: number;
  viewSampleCount: number;
  likesSampleCount: number;
  commentsSampleCount: number;
  minimumRecommendedSamples: number;
  sampleSufficient: boolean;
  sampleNote: string;
  dateFrom: string | null;
  dateTo: string | null;
  recordedDays: number;
  missingDays: number;
  importCount: number;
  latestImportAt: string | null;
  latestSourceHash: string | null;
  generatedAt: string;
}

interface PlatformMetricImportChange {
  key: { platform: string; chapter: string; date: string };
  before: PlatformMetricRecord | null;
  after: PlatformMetricRecord;
}

interface PlatformMetricImportAuditStored extends PlatformMetricImportAudit {
  changes: PlatformMetricImportChange[];
}

export class SqlitePlatformMetricsRepository {
  constructor(private readonly database: NarrativeDatabase) {}

  list(projectId: string): PlatformMetricRecord[] {
    const rows = this.database.raw
      .prepare(
        `SELECT * FROM platform_metrics
         WHERE project_id = ?
         ORDER BY published_date DESC, platform, chapter`,
      )
      .all(projectId) as unknown as PlatformMetricRow[];
    return rows.map(mapMetric);
  }

  listAudits(projectId: string, limit = 50): PlatformMetricImportAudit[] {
    const rows = this.database.raw
      .prepare(
        `SELECT id, project_id, source_hash, source_rows, duplicate_rows,
                added_count, replaced_count, status, created_at, rolled_back_at
         FROM platform_metric_imports
         WHERE project_id = ?
         ORDER BY created_at DESC, id DESC
         LIMIT ?`,
      )
      .all(
        projectId,
        Math.max(1, Math.min(200, Math.floor(limit))),
      ) as unknown as PlatformMetricImportAuditRow[];
    return rows.map(mapAudit);
  }

  report(projectId: string, generatedAt: string): PlatformMetricReport {
    const records = this.list(projectId);
    const audits = this.listAudits(projectId, 200);
    const dates = [...new Set(records.map((record) => record.date))].sort();
    const dateFrom = dates[0] ?? null;
    const dateTo = dates.at(-1) ?? null;
    const recordedDays = dates.length;
    const spanDays =
      dateFrom && dateTo
        ? Math.max(
            1,
            Math.round(
              (Date.parse(`${dateTo}T00:00:00Z`) -
                Date.parse(`${dateFrom}T00:00:00Z`)) /
                86_400_000,
            ) + 1,
          )
        : 0;
    const missingDays = Math.max(0, spanDays - recordedDays);
    const minimumRecommendedSamples = 3;
    const viewSampleCount = records.filter(
      (record) => record.views !== null,
    ).length;
    const likesSampleCount = records.filter(
      (record) => record.likes !== null,
    ).length;
    const commentsSampleCount = records.filter(
      (record) => record.comments !== null,
    ).length;
    const sampleSufficient = viewSampleCount >= minimumRecommendedSamples;
    const latest = audits[0] ?? null;
    return {
      projectId,
      source: "csv",
      sourceLabel: "作者手工导入的平台 CSV（服务端保存）",
      dateSemantics: "source_calendar_date",
      timezone: "源文件日期；不进行时区换算",
      metricDefinitions: {
        words: "导入时记录的正文总字数",
        views: "平台阅读量；缺失值不按 0 计入趋势",
        likes: "平台点赞数；缺失值不按 0 计入趋势",
        comments: "平台评论数；缺失值不按 0 计入趋势",
      },
      recordCount: records.length,
      viewSampleCount,
      likesSampleCount,
      commentsSampleCount,
      minimumRecommendedSamples,
      sampleSufficient,
      sampleNote: sampleSufficient
        ? `已有 ${viewSampleCount} 条带阅读量记录，达到至少 ${minimumRecommendedSamples} 条的复盘建议样本量。`
        : `目前只有 ${viewSampleCount} 条带阅读量记录，少于建议的 ${minimumRecommendedSamples} 条；趋势结论仅供参考。`,
      dateFrom,
      dateTo,
      recordedDays,
      missingDays,
      importCount: audits.length,
      latestImportAt: latest?.createdAt ?? null,
      latestSourceHash: latest?.sourceHash ?? null,
      generatedAt,
    };
  }

  upsert(
    projectId: string,
    records: readonly PlatformMetricInput[],
    updatedAt: string,
    options: { sourceRows?: number } = {},
  ): {
    records: PlatformMetricRecord[];
    added: number;
    replaced: number;
    sourceRows: number;
    duplicateRows: number;
    importId: string;
    sourceHash: string;
  } {
    return this.database.transaction(() => {
      let added = 0;
      let replaced = 0;
      const changes: PlatformMetricImportChange[] = [];
      const normalized = records.map((record) => ({
        platform: record.platform.trim(),
        chapter: record.chapter.trim(),
        date: record.date,
        words: record.words,
        views: record.views,
        likes: record.likes,
        comments: record.comments,
        source: record.source,
      }));
      const sourceHash = sha256Hex(JSON.stringify(normalized));
      // Keep one deterministic change per business key even if a caller sends
      // raw duplicate rows. The analytics parser applies the same rule in the
      // browser, but the API must enforce it for imports from other clients.
      const uniqueByKey = new Map<string, (typeof normalized)[number]>();
      for (const record of normalized) {
        uniqueByKey.set(metricKey(record), record);
      }
      const uniqueRecords = [...uniqueByKey.values()];
      const sourceRows = Math.max(
        normalized.length,
        Math.floor(options.sourceRows ?? normalized.length),
      );
      const duplicateRows = Math.max(0, sourceRows - uniqueRecords.length);
      for (const record of uniqueRecords) {
        const before = this.getByKey(
          projectId,
          record.platform,
          record.chapter,
          record.date,
        );
        if (before) {
          this.database.raw
            .prepare(
              `UPDATE platform_metrics SET words = ?, views = ?, likes = ?, comments = ?, source = ?, updated_at = ?
               WHERE id = ? AND project_id = ?`,
            )
            .run(
              record.words,
              record.views,
              record.likes,
              record.comments,
              record.source,
              updatedAt,
              before.id,
              projectId,
            );
          replaced += 1;
        } else {
          this.database.raw
            .prepare(
              `INSERT INTO platform_metrics(
                id, project_id, platform, chapter, published_date, words,
                views, likes, comments, source, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(
              randomUuid(),
              projectId,
              record.platform,
              record.chapter,
              record.date,
              record.words,
              record.views,
              record.likes,
              record.comments,
              record.source,
              updatedAt,
            );
          added += 1;
        }
        const after = this.getByKey(
          projectId,
          record.platform,
          record.chapter,
          record.date,
        );
        if (!after)
          throw new Error("platform metric write did not produce a row");
        changes.push({
          key: {
            platform: record.platform,
            chapter: record.chapter,
            date: record.date,
          },
          before,
          after,
        });
      }
      const importId = randomUuid();
      this.database.raw
        .prepare(
          `INSERT INTO platform_metric_imports(
            id, project_id, source_hash, source_rows, duplicate_rows, added_count, replaced_count,
            changes_json, status, created_at, rolled_back_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, NULL)`,
        )
        .run(
          importId,
          projectId,
          sourceHash,
          sourceRows,
          duplicateRows,
          added,
          replaced,
          JSON.stringify(changes),
          updatedAt,
        );
      return {
        records: this.list(projectId),
        added,
        replaced,
        sourceRows,
        duplicateRows,
        importId,
        sourceHash,
      };
    });
  }

  rollback(
    projectId: string,
    importId: string,
    now: string,
  ): PlatformMetricImportAudit {
    return this.database.transaction(() => {
      const audit = this.getAudit(projectId, importId);
      if (!audit)
        throw new PersistenceNotFoundError("platform_metric_import", importId);
      if (audit.status === "rolled_back") return audit;
      for (const change of [...audit.changes].reverse()) {
        const current = this.getByKey(
          projectId,
          change.key.platform,
          change.key.chapter,
          change.key.date,
        );
        if (!current || !sameMetric(current, change.after)) {
          throw new Error("platform metric import rollback conflict");
        }
        if (change.before) {
          this.database.raw
            .prepare(
              `UPDATE platform_metrics SET words = ?, views = ?, likes = ?, comments = ?, source = ?, updated_at = ?
               WHERE id = ? AND project_id = ?`,
            )
            .run(
              change.before.words,
              change.before.views,
              change.before.likes,
              change.before.comments,
              change.before.source,
              change.before.updatedAt,
              current.id,
              projectId,
            );
        } else {
          this.database.raw
            .prepare(
              "DELETE FROM platform_metrics WHERE id = ? AND project_id = ?",
            )
            .run(current.id, projectId);
        }
      }
      this.database.raw
        .prepare(
          "UPDATE platform_metric_imports SET status = 'rolled_back', rolled_back_at = ? WHERE id = ? AND project_id = ?",
        )
        .run(now, importId, projectId);
      return this.getAudit(projectId, importId)!;
    });
  }

  private getByKey(
    projectId: string,
    platform: string,
    chapter: string,
    date: string,
  ): PlatformMetricRecord | null {
    const row = this.database.raw
      .prepare(
        `SELECT * FROM platform_metrics
         WHERE project_id = ? AND platform = ? COLLATE NOCASE
           AND chapter = ? COLLATE NOCASE AND published_date = ?`,
      )
      .get(projectId, platform, chapter, date) as PlatformMetricRow | undefined;
    return row ? mapMetric(row) : null;
  }

  private getAudit(
    projectId: string,
    importId: string,
  ): PlatformMetricImportAuditStored | null {
    const row = this.database.raw
      .prepare(
        "SELECT * FROM platform_metric_imports WHERE project_id = ? AND id = ?",
      )
      .get(projectId, importId) as PlatformMetricImportRow | undefined;
    if (!row) return null;
    return {
      ...mapAudit(row),
      changes: parseChanges(row.changes_json),
    };
  }
}

interface PlatformMetricRow {
  id: string;
  project_id: string;
  platform: string;
  chapter: string;
  published_date: string;
  words: number;
  views: number | null;
  likes: number | null;
  comments: number | null;
  source: "csv";
  updated_at: string;
}

interface PlatformMetricImportAuditRow {
  id: string;
  project_id: string;
  source_hash: string;
  source_rows: number;
  duplicate_rows: number;
  added_count: number;
  replaced_count: number;
  changes_json?: string;
  status: "active" | "rolled_back";
  created_at: string;
  rolled_back_at: string | null;
}

interface PlatformMetricImportRow extends PlatformMetricImportAuditRow {
  changes_json: string;
}

function mapMetric(row: PlatformMetricRow): PlatformMetricRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    platform: row.platform,
    chapter: row.chapter,
    date: row.published_date,
    words: row.words,
    views: row.views,
    likes: row.likes,
    comments: row.comments,
    source: row.source,
    updatedAt: row.updated_at,
  };
}

function mapAudit(
  row: PlatformMetricImportAuditRow,
): PlatformMetricImportAudit {
  return {
    id: row.id,
    projectId: row.project_id,
    sourceHash: row.source_hash,
    sourceRows: row.source_rows,
    duplicateRows: row.duplicate_rows,
    addedCount: row.added_count,
    replacedCount: row.replaced_count,
    status: row.status,
    createdAt: row.created_at,
    rolledBackAt: row.rolled_back_at,
  };
}

function metricKey(
  record: Pick<PlatformMetricInput, "platform" | "chapter" | "date">,
): string {
  return `${record.platform.trim().toLocaleLowerCase()}\u0000${record.chapter.trim().toLocaleLowerCase()}\u0000${record.date}`;
}

function parseChanges(value: string): PlatformMetricImportChange[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isChange);
  } catch {
    return [];
  }
}

function isChange(value: unknown): value is PlatformMetricImportChange {
  if (!value || typeof value !== "object") return false;
  const change = value as Partial<PlatformMetricImportChange>;
  return Boolean(
    change.key &&
    change.after &&
    typeof change.key === "object" &&
    typeof change.after === "object",
  );
}

function sameMetric(
  left: PlatformMetricRecord,
  right: PlatformMetricRecord,
): boolean {
  return (
    left.platform === right.platform &&
    left.chapter === right.chapter &&
    left.date === right.date &&
    left.words === right.words &&
    left.views === right.views &&
    left.likes === right.likes &&
    left.comments === right.comments &&
    left.source === right.source &&
    left.updatedAt === right.updatedAt
  );
}
