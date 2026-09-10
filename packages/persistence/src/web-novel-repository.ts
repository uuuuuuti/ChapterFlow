import type {
  BookProfile,
  BookProfileHistory,
  BookProfileSnapshot,
  ChapterBrief,
  ChapterBriefHistory,
  ChapterBriefSnapshot,
  CreativePacing,
  CreativePreset,
  CreativePresetHistory,
  CreativePresetSnapshot,
  CreativePresetStatus,
  NovelCheckIssueState,
  NovelCheckIssueStatus,
  OpeningCheckAuditEventType,
  OpeningCheckAuditRecord,
  OpeningCheckReportRecord,
} from "@narralume/domain";
import { randomUuid } from "@narralume/domain";
import { PersistenceNotFoundError } from "./project-repository.js";
import { CreativePersistenceError } from "./creative-repository.js";
import type { NarrativeDatabase } from "./database.js";

export interface CreativePresetInput {
  id: string;
  projectId: string | null;
  name: string;
  genre: string | null;
  audience: string | null;
  promise: string | null;
  pacing: CreativePacing;
  targetWordsPerChapter: number;
  updateCadence: string | null;
  boundaries: string[];
  checkRules: string[];
  defaultTemplate: string | null;
  status?: CreativePresetStatus;
  now: string;
}

export class SqliteWebNovelRepository {
  constructor(private readonly database: NarrativeDatabase) {}

  listPresets(projectId?: string | null): CreativePreset[] {
    const rows = projectId
      ? this.database.raw
          .prepare(
            `SELECT * FROM creative_presets
             WHERE project_id IS NULL OR project_id = ?
             ORDER BY project_id IS NOT NULL, updated_at DESC, name`,
          )
          .all(projectId)
      : this.database.raw
          .prepare(
            "SELECT * FROM creative_presets WHERE project_id IS NULL ORDER BY updated_at DESC, name",
          )
          .all();
    return (rows as unknown as CreativePresetRow[]).map(mapPreset);
  }

  getPreset(id: string): CreativePreset | null {
    const row = this.database.raw
      .prepare("SELECT * FROM creative_presets WHERE id = ?")
      .get(id) as CreativePresetRow | undefined;
    return row ? mapPreset(row) : null;
  }

  listPresetHistory(presetId: string, limit = 30): CreativePresetHistory[] {
    const boundedLimit = Math.max(1, Math.min(Math.floor(limit), 100));
    const rows = this.database.raw
      .prepare(
        `SELECT id, preset_id, preset_version, snapshot_json, created_at
         FROM creative_preset_history
         WHERE preset_id = ?
         ORDER BY created_at DESC, preset_version DESC, id DESC
         LIMIT ?`,
      )
      .all(presetId, boundedLimit) as unknown as CreativePresetHistoryRow[];
    return rows.map(mapCreativePresetHistory);
  }

  getPresetHistory(
    presetId: string,
    historyId: string,
  ): CreativePresetHistory | null {
    const row = this.database.raw
      .prepare(
        `SELECT id, preset_id, preset_version, snapshot_json, created_at
         FROM creative_preset_history
         WHERE preset_id = ? AND id = ?`,
      )
      .get(presetId, historyId) as CreativePresetHistoryRow | undefined;
    return row ? mapCreativePresetHistory(row) : null;
  }

  requirePreset(id: string): CreativePreset {
    const preset = this.getPreset(id);
    if (!preset) throw new PersistenceNotFoundError("creative_preset", id);
    return preset;
  }

  insertPreset(input: CreativePresetInput): CreativePreset {
    return this.database.transaction(() => {
      try {
        this.database.raw
          .prepare(
            `INSERT INTO creative_presets(
              id, project_id, name, genre, audience, promise, pacing,
              target_words_per_chapter, update_cadence, boundaries_json,
              check_rules_json, default_template, status, version, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
          )
          .run(
            input.id,
            input.projectId,
            input.name,
            input.genre,
            input.audience,
            input.promise,
            input.pacing,
            input.targetWordsPerChapter,
            input.updateCadence,
            JSON.stringify(input.boundaries),
            JSON.stringify(input.checkRules),
            input.defaultTemplate,
            input.status ?? "active",
            input.now,
            input.now,
          );
      } catch (error) {
        if (isUniqueConstraint(error)) {
          throw new CreativePersistenceError(
            "creative_preset.name_conflict",
            "A preset with this name already exists in this scope",
          );
        }
        throw error;
      }
      return this.requirePreset(input.id);
    });
  }

  updatePreset(
    id: string,
    input: Omit<CreativePresetInput, "id" | "projectId" | "now"> & {
      expectedVersion: number;
      now: string;
    },
  ): CreativePreset {
    return this.database.transaction(() => {
      const current = this.requirePreset(id);
      if (current.version !== input.expectedVersion) {
        throw new CreativePersistenceError(
          "creative_preset.version_conflict",
          "The preset was updated elsewhere; refresh and try again",
          {
            expectedVersion: input.expectedVersion,
            currentPreset: current,
          },
        );
      }
      try {
        this.database.raw
          .prepare(
            `INSERT INTO creative_preset_history(
              id, preset_id, preset_version, snapshot_json, created_at
            ) VALUES (?, ?, ?, ?, ?)`,
          )
          .run(
            randomUuid(),
            id,
            current.version,
            JSON.stringify(creativePresetSnapshot(current)),
            input.now,
          );
        const result = this.database.raw
          .prepare(
            `UPDATE creative_presets SET name = ?, genre = ?, audience = ?, promise = ?,
              pacing = ?, target_words_per_chapter = ?, update_cadence = ?,
              boundaries_json = ?, check_rules_json = ?, default_template = ?,
              status = ?, updated_at = ?, version = version + 1
             WHERE id = ? AND version = ?`,
          )
          .run(
            input.name,
            input.genre,
            input.audience,
            input.promise,
            input.pacing,
            input.targetWordsPerChapter,
            input.updateCadence,
            JSON.stringify(input.boundaries),
            JSON.stringify(input.checkRules),
            input.defaultTemplate,
            input.status ?? current.status,
            input.now,
            id,
            input.expectedVersion,
          );
        if (result.changes !== 1) throw new Error("version conflict");
      } catch (error) {
        if (isUniqueConstraint(error)) {
          throw new CreativePersistenceError(
            "creative_preset.name_conflict",
            "A preset with this name already exists in this scope",
          );
        }
        if (error instanceof Error && error.message === "version conflict") {
          throw new CreativePersistenceError(
            "creative_preset.version_conflict",
            "The preset was updated elsewhere; refresh and try again",
            {
              expectedVersion: input.expectedVersion,
              currentPreset: this.requirePreset(id),
            },
          );
        }
        throw error;
      }
      return this.requirePreset(id);
    });
  }

  restorePresetHistory(
    presetId: string,
    historyId: string,
    expectedVersion: number,
    now: string,
  ): CreativePreset {
    return this.database.transaction(() => {
      const history = this.getPresetHistory(presetId, historyId);
      if (!history) {
        throw new PersistenceNotFoundError(
          "creative_preset_history",
          historyId,
        );
      }
      return this.updatePreset(presetId, {
        ...history.snapshot,
        expectedVersion,
        now,
      });
    });
  }

  getBookProfile(projectId: string): BookProfile | null {
    const row = this.database.raw
      .prepare("SELECT * FROM book_profiles WHERE project_id = ?")
      .get(projectId) as BookProfileRow | undefined;
    return row ? mapBookProfile(row) : null;
  }

  listBookProfileHistory(projectId: string, limit = 30): BookProfileHistory[] {
    const boundedLimit = Math.max(1, Math.min(Math.floor(limit), 100));
    const rows = this.database.raw
      .prepare(
        `SELECT id, project_id, profile_version, snapshot_json, created_at
         FROM book_profile_history
         WHERE project_id = ?
         ORDER BY created_at DESC, profile_version DESC
         LIMIT ?`,
      )
      .all(projectId, boundedLimit) as unknown as BookProfileHistoryRow[];
    return rows.map(mapBookProfileHistory);
  }

  getBookProfileHistory(
    projectId: string,
    historyId: string,
  ): BookProfileHistory | null {
    const row = this.database.raw
      .prepare(
        `SELECT id, project_id, profile_version, snapshot_json, created_at
         FROM book_profile_history
         WHERE project_id = ? AND id = ?`,
      )
      .get(projectId, historyId) as BookProfileHistoryRow | undefined;
    return row ? mapBookProfileHistory(row) : null;
  }

  ensureBookProfile(
    projectId: string,
    now: string,
    overrides: Partial<BookProfileSnapshot> = {},
  ): BookProfile {
    const current = this.getBookProfile(projectId);
    if (current) return current;
    return this.upsertBookProfile(projectId, {
      presetId: overrides.presetId ?? null,
      genre: overrides.genre ?? null,
      audience: overrides.audience ?? null,
      promise: overrides.promise ?? null,
      tone: overrides.tone ?? null,
      endingDirection: overrides.endingDirection ?? null,
      pov: overrides.pov ?? null,
      updateCadence: overrides.updateCadence ?? null,
      targetWordsPerChapter: overrides.targetWordsPerChapter ?? null,
      boundaries: overrides.boundaries ?? [],
      worldRules: overrides.worldRules ?? [],
      arcNotes: overrides.arcNotes ?? [],
      expectedVersion: null,
      now,
    });
  }

  upsertBookProfile(
    projectId: string,
    input: Omit<BookProfile, "projectId" | "version" | "updatedAt"> & {
      expectedVersion: number | null;
      now: string;
    },
  ): BookProfile {
    return this.database.transaction(() => {
      const current = this.getBookProfile(projectId);
      if (current && current.version !== input.expectedVersion) {
        throw new CreativePersistenceError(
          "book_profile.version_conflict",
          "The book profile was updated elsewhere; refresh and try again",
          {
            expectedVersion: input.expectedVersion,
            currentProfile: current,
          },
        );
      }
      if (!current && input.expectedVersion !== null) {
        throw new CreativePersistenceError(
          "book_profile.version_conflict",
          "The book profile was created elsewhere; refresh and try again",
          {
            expectedVersion: input.expectedVersion,
            currentProfile: null,
          },
        );
      }
      if (current) {
        this.database.raw
          .prepare(
            `INSERT INTO book_profile_history(
              id, project_id, profile_version, snapshot_json, created_at
            ) VALUES (?, ?, ?, ?, ?)`,
          )
          .run(
            randomUuid(),
            projectId,
            current.version,
            JSON.stringify(bookProfileSnapshot(current)),
            input.now,
          );
        const result = this.database.raw
          .prepare(
            `UPDATE book_profiles SET preset_id = ?, genre = ?, audience = ?, promise = ?,
              tone = ?, ending_direction = ?, pov = ?, update_cadence = ?,
              target_words_per_chapter = ?, boundaries_json = ?, world_rules_json = ?,
              arc_notes_json = ?, version = version + 1, updated_at = ?
             WHERE project_id = ? AND version = ?`,
          )
          .run(
            input.presetId,
            input.genre,
            input.audience,
            input.promise,
            input.tone,
            input.endingDirection,
            input.pov,
            input.updateCadence,
            input.targetWordsPerChapter,
            JSON.stringify(input.boundaries),
            JSON.stringify(input.worldRules),
            JSON.stringify(input.arcNotes),
            input.now,
            projectId,
            input.expectedVersion,
          );
        if (result.changes !== 1) {
          throw new CreativePersistenceError(
            "book_profile.version_conflict",
            "The book profile was updated elsewhere; refresh and try again",
            {
              expectedVersion: input.expectedVersion,
              currentProfile: this.getBookProfile(projectId),
            },
          );
        }
      } else {
        this.database.raw
          .prepare(
            `INSERT INTO book_profiles(
              project_id, preset_id, genre, audience, promise, tone, ending_direction,
              pov, update_cadence, target_words_per_chapter, boundaries_json,
              world_rules_json, arc_notes_json, version, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
          )
          .run(
            projectId,
            input.presetId,
            input.genre,
            input.audience,
            input.promise,
            input.tone,
            input.endingDirection,
            input.pov,
            input.updateCadence,
            input.targetWordsPerChapter,
            JSON.stringify(input.boundaries),
            JSON.stringify(input.worldRules),
            JSON.stringify(input.arcNotes),
            input.now,
          );
      }
      return this.getBookProfile(projectId)!;
    });
  }

  getChapterBrief(
    projectId: string,
    outlineNodeId: string,
  ): ChapterBrief | null {
    const row = this.database.raw
      .prepare(
        "SELECT * FROM chapter_briefs WHERE project_id = ? AND outline_node_id = ?",
      )
      .get(projectId, outlineNodeId) as ChapterBriefRow | undefined;
    return row ? mapChapterBrief(row) : null;
  }

  listChapterBriefs(projectId: string): ChapterBrief[] {
    const rows = this.database.raw
      .prepare(
        `SELECT * FROM chapter_briefs
         WHERE project_id = ?
         ORDER BY updated_at DESC, outline_node_id`,
      )
      .all(projectId) as unknown as ChapterBriefRow[];
    return rows.map(mapChapterBrief);
  }

  listChapterBriefHistory(
    projectId: string,
    outlineNodeId: string,
    limit = 30,
  ): ChapterBriefHistory[] {
    const boundedLimit = Math.max(1, Math.min(Math.floor(limit), 100));
    const rows = this.database.raw
      .prepare(
        `SELECT id, project_id, outline_node_id, brief_version, snapshot_json, created_at
         FROM chapter_brief_history
         WHERE project_id = ? AND outline_node_id = ?
         ORDER BY created_at DESC, brief_version DESC, id DESC
         LIMIT ?`,
      )
      .all(
        projectId,
        outlineNodeId,
        boundedLimit,
      ) as unknown as ChapterBriefHistoryRow[];
    return rows.map(mapChapterBriefHistory);
  }

  getChapterBriefHistory(
    projectId: string,
    outlineNodeId: string,
    historyId: string,
  ): ChapterBriefHistory | null {
    const row = this.database.raw
      .prepare(
        `SELECT id, project_id, outline_node_id, brief_version, snapshot_json, created_at
         FROM chapter_brief_history
         WHERE project_id = ? AND outline_node_id = ? AND id = ?`,
      )
      .get(projectId, outlineNodeId, historyId) as
      ChapterBriefHistoryRow | undefined;
    return row ? mapChapterBriefHistory(row) : null;
  }

  upsertChapterBrief(
    projectId: string,
    outlineNodeId: string,
    input: Omit<
      ChapterBrief,
      | "id"
      | "projectId"
      | "outlineNodeId"
      | "documentVersionId"
      | "version"
      | "createdAt"
      | "updatedAt"
    > & {
      expectedVersion: number | null;
      now: string;
    },
  ): ChapterBrief {
    return this.database.transaction(() => {
      const documentVersionId = this.getCurrentDocumentVersionId(
        projectId,
        outlineNodeId,
      );
      const current = this.getChapterBrief(projectId, outlineNodeId);
      if (current && current.version !== input.expectedVersion) {
        throw new CreativePersistenceError(
          "chapter_brief.version_conflict",
          "The chapter brief was updated elsewhere; refresh and try again",
          {
            expectedVersion: input.expectedVersion,
            currentBrief: current,
          },
        );
      }
      if (!current && input.expectedVersion !== null) {
        throw new CreativePersistenceError(
          "chapter_brief.version_conflict",
          "The chapter brief was created elsewhere; refresh and try again",
          {
            expectedVersion: input.expectedVersion,
            currentBrief: null,
          },
        );
      }
      if (current) {
        this.database.raw
          .prepare(
            `INSERT INTO chapter_brief_history(
              id, project_id, outline_node_id, brief_version, snapshot_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .run(
            randomUuid(),
            projectId,
            outlineNodeId,
            current.version,
            JSON.stringify(chapterBriefSnapshot(current)),
            input.now,
          );
        const result = this.database.raw
          .prepare(
            `UPDATE chapter_briefs SET document_version_id = ?, goal = ?, conflict = ?, payoff = ?, hook = ?,
              character_ids_json = ?, foreshadow_ids_json = ?, timeline_ids_json = ?,
              target_words = ?, pacing = ?, version = version + 1, updated_at = ?
             WHERE project_id = ? AND outline_node_id = ? AND version = ?`,
          )
          .run(
            documentVersionId,
            input.goal,
            input.conflict,
            input.payoff,
            input.hook,
            JSON.stringify(input.characterIds),
            JSON.stringify(input.foreshadowIds),
            JSON.stringify(input.timelineIds),
            input.targetWords,
            input.pacing,
            input.now,
            projectId,
            outlineNodeId,
            input.expectedVersion,
          );
        if (result.changes !== 1) {
          throw new CreativePersistenceError(
            "chapter_brief.version_conflict",
            "The chapter brief was updated elsewhere; refresh and try again",
            {
              expectedVersion: input.expectedVersion,
              currentBrief: this.getChapterBrief(projectId, outlineNodeId),
            },
          );
        }
      } else {
        this.database.raw
          .prepare(
            `INSERT INTO chapter_briefs(
              id, project_id, outline_node_id, document_version_id, goal, conflict, payoff, hook,
              character_ids_json, foreshadow_ids_json, timeline_ids_json,
              target_words, pacing, version, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
          )
          .run(
            randomUuid(),
            projectId,
            outlineNodeId,
            documentVersionId,
            input.goal,
            input.conflict,
            input.payoff,
            input.hook,
            JSON.stringify(input.characterIds),
            JSON.stringify(input.foreshadowIds),
            JSON.stringify(input.timelineIds),
            input.targetWords,
            input.pacing,
            input.now,
            input.now,
          );
      }
      return this.getChapterBrief(projectId, outlineNodeId)!;
    });
  }

  restoreChapterBriefHistory(
    projectId: string,
    outlineNodeId: string,
    historyId: string,
    expectedVersion: number,
    now: string,
  ): ChapterBrief {
    return this.database.transaction(() => {
      const history = this.getChapterBriefHistory(
        projectId,
        outlineNodeId,
        historyId,
      );
      if (!history) {
        throw new PersistenceNotFoundError("chapter_brief_history", historyId);
      }
      return this.upsertChapterBrief(projectId, outlineNodeId, {
        ...history.snapshot,
        expectedVersion,
        now,
      });
    });
  }

  /**
   * Resolve the chapter's current manuscript version at write time. The
   * client does not get to claim a stale version as the brief's basis.
   */
  private getCurrentDocumentVersionId(
    projectId: string,
    outlineNodeId: string,
  ): string | null {
    const row = this.database.raw
      .prepare(
        `SELECT current_version_id
         FROM documents
         WHERE project_id = ? AND outline_node_id = ?
         ORDER BY updated_at DESC
         LIMIT 1`,
      )
      .get(projectId, outlineNodeId) as
      { current_version_id: string | null } | undefined;
    return row?.current_version_id ?? null;
  }

  listOpeningCheckIssueStates(projectId: string): NovelCheckIssueState[] {
    const rows = this.database.raw
      .prepare(
        `SELECT project_id, issue_id, status, note, updated_at
         FROM opening_check_issue_states
         WHERE project_id = ?
         ORDER BY updated_at DESC`,
      )
      .all(projectId) as unknown as OpeningCheckIssueStateRow[];
    return rows.map(mapOpeningCheckIssueState);
  }

  insertOpeningCheckReport(
    projectId: string,
    report: Record<string, unknown>,
    now: string,
  ): OpeningCheckReportRecord {
    const id =
      typeof report.id === "string" && report.id ? report.id : randomUuid();
    const scope = report.scope === "opening-three" ? "opening-three" : null;
    const generatedAt =
      typeof report.generatedAt === "string" && report.generatedAt
        ? report.generatedAt
        : now;
    if (!scope) throw new Error("opening check report scope is invalid");
    const persisted = { ...report, id, projectId, scope, generatedAt };
    this.database.raw
      .prepare(
        `INSERT INTO opening_check_reports(
          id, project_id, scope, generated_at, report_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(id, projectId, scope, generatedAt, JSON.stringify(persisted), now);
    return {
      id,
      projectId,
      scope,
      generatedAt,
      report: persisted,
      createdAt: now,
    };
  }

  listOpeningCheckReports(
    projectId: string,
    limit = 30,
  ): OpeningCheckReportRecord[] {
    const boundedLimit = Math.max(1, Math.min(Math.floor(limit), 100));
    const rows = this.database.raw
      .prepare(
        `SELECT id, project_id, scope, generated_at, report_json, created_at
         FROM opening_check_reports
         WHERE project_id = ?
         ORDER BY generated_at DESC, id DESC
         LIMIT ?`,
      )
      .all(projectId, boundedLimit) as unknown as OpeningCheckReportRow[];
    return rows.map(mapOpeningCheckReport);
  }

  insertOpeningCheckAudit(input: {
    id?: string;
    projectId: string;
    reportId?: string | null;
    issueId?: string | null;
    proposalId?: string | null;
    runId?: string | null;
    eventType: OpeningCheckAuditEventType;
    action: string;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    createdAt: string;
  }): OpeningCheckAuditRecord {
    const record: OpeningCheckAuditRecord = {
      id: input.id ?? randomUuid(),
      projectId: input.projectId,
      reportId: input.reportId ?? null,
      issueId: input.issueId ?? null,
      proposalId: input.proposalId ?? null,
      runId: input.runId ?? null,
      eventType: input.eventType,
      action: input.action,
      before: input.before ?? null,
      after: input.after ?? null,
      createdAt: input.createdAt,
    };
    this.database.raw
      .prepare(
        `INSERT INTO opening_check_audits(
          id, project_id, report_id, issue_id, proposal_id, run_id,
          event_type, action, before_json, after_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.id,
        record.projectId,
        record.reportId,
        record.issueId,
        record.proposalId,
        record.runId,
        record.eventType,
        record.action,
        record.before === null ? null : JSON.stringify(record.before),
        record.after === null ? null : JSON.stringify(record.after),
        record.createdAt,
      );
    return record;
  }

  listOpeningCheckAudits(
    projectId: string,
    limit = 100,
  ): OpeningCheckAuditRecord[] {
    const boundedLimit = Math.max(1, Math.min(Math.floor(limit), 500));
    const rows = this.database.raw
      .prepare(
        `SELECT id, project_id, report_id, issue_id, proposal_id, run_id,
                event_type, action, before_json, after_json, created_at
         FROM opening_check_audits
         WHERE project_id = ?
         ORDER BY created_at DESC, id DESC
         LIMIT ?`,
      )
      .all(projectId, boundedLimit) as unknown as OpeningCheckAuditRow[];
    return rows.map(mapOpeningCheckAudit);
  }

  getOpeningCheckOrigin(
    projectId: string,
    runId: string,
  ): { reportId: string | null; issueId: string | null } | null {
    const row = this.database.raw
      .prepare(
        `SELECT
           json_extract(policy_json, '$.origin.checkReportId') AS report_id,
           json_extract(policy_json, '$.origin.checkIssueId') AS issue_id
         FROM runs
         WHERE project_id = ? AND id = ?`,
      )
      .get(projectId, runId) as
      { report_id: string | null; issue_id: string | null } | undefined;
    if (!row || (!row.report_id && !row.issue_id)) return null;
    return {
      reportId: typeof row.report_id === "string" ? row.report_id : null,
      issueId: typeof row.issue_id === "string" ? row.issue_id : null,
    };
  }

  updateOpeningCheckIssueState(
    projectId: string,
    issueId: string,
    input: {
      status: NovelCheckIssueStatus;
      note: string | null;
      expectedStatus: NovelCheckIssueStatus;
      reportId?: string | null;
      now: string;
    },
  ): NovelCheckIssueState {
    return this.database.transaction(() => {
      const current = this.database.raw
        .prepare(
          `SELECT project_id, issue_id, status, note, updated_at
           FROM opening_check_issue_states
           WHERE project_id = ? AND issue_id = ?`,
        )
        .get(projectId, issueId) as OpeningCheckIssueStateRow | undefined;
      const currentStatus = current?.status ?? "open";
      if (currentStatus !== input.expectedStatus) {
        throw new CreativePersistenceError(
          "opening_check_issue.version_conflict",
          "The opening check issue was updated elsewhere; refresh and try again",
        );
      }
      this.database.raw
        .prepare(
          `INSERT INTO opening_check_issue_states(project_id, issue_id, status, note, updated_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(project_id, issue_id) DO UPDATE SET
             status = excluded.status,
             note = excluded.note,
             updated_at = excluded.updated_at`,
        )
        .run(projectId, issueId, input.status, input.note, input.now);
      const next = this.database.raw
        .prepare(
          `SELECT project_id, issue_id, status, note, updated_at
           FROM opening_check_issue_states
           WHERE project_id = ? AND issue_id = ?`,
        )
        .get(projectId, issueId) as OpeningCheckIssueStateRow | undefined;
      if (!next) {
        throw new Error("opening check issue state was not persisted");
      }
      this.insertOpeningCheckAudit({
        projectId,
        reportId: input.reportId ?? null,
        issueId,
        eventType: "issue_decided",
        action: input.status,
        before: { status: currentStatus },
        after: { status: next.status, note: next.note },
        createdAt: input.now,
      });
      return mapOpeningCheckIssueState(next);
    });
  }
}

interface CreativePresetRow {
  id: string;
  project_id: string | null;
  name: string;
  genre: string | null;
  audience: string | null;
  promise: string | null;
  pacing: CreativePacing;
  target_words_per_chapter: number;
  update_cadence: string | null;
  boundaries_json: string;
  check_rules_json: string;
  default_template: string | null;
  status: CreativePresetStatus;
  version: number;
  created_at: string;
  updated_at: string;
}

interface CreativePresetHistoryRow {
  id: string;
  preset_id: string;
  preset_version: number;
  snapshot_json: string;
  created_at: string;
}

interface BookProfileRow {
  project_id: string;
  preset_id: string | null;
  genre: string | null;
  audience: string | null;
  promise: string | null;
  tone: string | null;
  ending_direction: string | null;
  pov: string | null;
  update_cadence: string | null;
  target_words_per_chapter: number | null;
  boundaries_json: string;
  world_rules_json: string;
  arc_notes_json: string;
  version: number;
  updated_at: string;
}

interface BookProfileHistoryRow {
  id: string;
  project_id: string;
  profile_version: number;
  snapshot_json: string;
  created_at: string;
}

interface ChapterBriefRow {
  id: string;
  project_id: string;
  outline_node_id: string;
  document_version_id: string | null;
  goal: string | null;
  conflict: string | null;
  payoff: string | null;
  hook: string | null;
  character_ids_json: string;
  foreshadow_ids_json: string;
  timeline_ids_json: string;
  target_words: number | null;
  pacing: CreativePacing;
  version: number;
  created_at: string;
  updated_at: string;
}

interface ChapterBriefHistoryRow {
  id: string;
  project_id: string;
  outline_node_id: string;
  brief_version: number;
  snapshot_json: string;
  created_at: string;
}

interface OpeningCheckIssueStateRow {
  project_id: string;
  issue_id: string;
  status: NovelCheckIssueStatus;
  note: string | null;
  updated_at: string;
}

interface OpeningCheckReportRow {
  id: string;
  project_id: string;
  scope: "opening-three";
  generated_at: string;
  report_json: string;
  created_at: string;
}

interface OpeningCheckAuditRow {
  id: string;
  project_id: string;
  report_id: string | null;
  issue_id: string | null;
  proposal_id: string | null;
  run_id: string | null;
  event_type: OpeningCheckAuditEventType;
  action: string;
  before_json: string | null;
  after_json: string | null;
  created_at: string;
}

function jsonList(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string")
      : [];
  } catch {
    return [];
  }
}

function mapPreset(row: CreativePresetRow): CreativePreset {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    genre: row.genre,
    audience: row.audience,
    promise: row.promise,
    pacing: row.pacing,
    targetWordsPerChapter: row.target_words_per_chapter,
    updateCadence: row.update_cadence,
    boundaries: jsonList(row.boundaries_json),
    checkRules: jsonList(row.check_rules_json),
    defaultTemplate: row.default_template,
    status: row.status,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function creativePresetSnapshot(
  preset: CreativePreset,
): CreativePresetSnapshot {
  return {
    name: preset.name,
    genre: preset.genre,
    audience: preset.audience,
    promise: preset.promise,
    pacing: preset.pacing,
    targetWordsPerChapter: preset.targetWordsPerChapter,
    updateCadence: preset.updateCadence,
    boundaries: preset.boundaries,
    checkRules: preset.checkRules,
    defaultTemplate: preset.defaultTemplate,
    status: preset.status,
  };
}

function mapCreativePresetHistory(
  row: CreativePresetHistoryRow,
): CreativePresetHistory {
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.snapshot_json);
  } catch {
    throw new Error(
      `creative preset history ${row.id} has invalid snapshot JSON`,
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`creative preset history ${row.id} has invalid snapshot`);
  }
  const snapshot = parsed as Record<string, unknown>;
  const pacing = snapshot.pacing;
  if (
    typeof snapshot.name !== "string" ||
    !["slow", "steady", "fast", "cliffhanger"].includes(String(pacing))
  ) {
    throw new Error(`creative preset history ${row.id} has invalid fields`);
  }
  return {
    id: row.id,
    presetId: row.preset_id,
    presetVersion: row.preset_version,
    snapshot: {
      name: snapshot.name,
      genre: typeof snapshot.genre === "string" ? snapshot.genre : null,
      audience:
        typeof snapshot.audience === "string" ? snapshot.audience : null,
      promise: typeof snapshot.promise === "string" ? snapshot.promise : null,
      pacing: pacing as CreativePacing,
      targetWordsPerChapter:
        typeof snapshot.targetWordsPerChapter === "number"
          ? Math.max(1, Math.floor(snapshot.targetWordsPerChapter))
          : 2_500,
      updateCadence:
        typeof snapshot.updateCadence === "string"
          ? snapshot.updateCadence
          : null,
      boundaries: jsonListValue(snapshot.boundaries),
      checkRules: jsonListValue(snapshot.checkRules),
      defaultTemplate:
        typeof snapshot.defaultTemplate === "string"
          ? snapshot.defaultTemplate
          : null,
      status: snapshot.status === "archived" ? "archived" : "active",
    },
    createdAt: row.created_at,
  };
}

function mapBookProfile(row: BookProfileRow): BookProfile {
  return {
    projectId: row.project_id,
    presetId: row.preset_id,
    genre: row.genre,
    audience: row.audience,
    promise: row.promise,
    tone: row.tone,
    endingDirection: row.ending_direction,
    pov: row.pov,
    updateCadence: row.update_cadence,
    targetWordsPerChapter: row.target_words_per_chapter,
    boundaries: jsonList(row.boundaries_json),
    worldRules: jsonList(row.world_rules_json),
    arcNotes: jsonList(row.arc_notes_json),
    version: row.version,
    updatedAt: row.updated_at,
  };
}

function bookProfileSnapshot(profile: BookProfile): BookProfileSnapshot {
  return {
    presetId: profile.presetId,
    genre: profile.genre,
    audience: profile.audience,
    promise: profile.promise,
    tone: profile.tone,
    endingDirection: profile.endingDirection,
    pov: profile.pov,
    updateCadence: profile.updateCadence,
    targetWordsPerChapter: profile.targetWordsPerChapter,
    boundaries: profile.boundaries,
    worldRules: profile.worldRules,
    arcNotes: profile.arcNotes,
  };
}

function mapBookProfileHistory(row: BookProfileHistoryRow): BookProfileHistory {
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.snapshot_json);
  } catch {
    throw new Error(`book profile history ${row.id} has invalid snapshot JSON`);
  }
  return {
    id: row.id,
    projectId: row.project_id,
    profileVersion: row.profile_version,
    snapshot: parseBookProfileSnapshot(parsed, row.id),
    createdAt: row.created_at,
  };
}

function parseBookProfileSnapshot(
  value: unknown,
  historyId: string,
): BookProfileSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`book profile history ${historyId} has invalid snapshot`);
  }
  const snapshot = value as Record<string, unknown>;
  const text = (key: string): string | null => {
    const item = snapshot[key];
    return item === null || typeof item === "string" ? item : null;
  };
  const targetWordsPerChapter = snapshot.targetWordsPerChapter;
  return {
    presetId: text("presetId"),
    genre: text("genre"),
    audience: text("audience"),
    promise: text("promise"),
    tone: text("tone"),
    endingDirection: text("endingDirection"),
    pov: text("pov"),
    updateCadence: text("updateCadence"),
    targetWordsPerChapter:
      targetWordsPerChapter === null ||
      (typeof targetWordsPerChapter === "number" &&
        Number.isInteger(targetWordsPerChapter))
        ? targetWordsPerChapter
        : null,
    boundaries: jsonListValue(snapshot.boundaries),
    worldRules: jsonListValue(snapshot.worldRules),
    arcNotes: jsonListValue(snapshot.arcNotes),
  };
}

function jsonListValue(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function mapChapterBrief(row: ChapterBriefRow): ChapterBrief {
  return {
    id: row.id,
    projectId: row.project_id,
    outlineNodeId: row.outline_node_id,
    documentVersionId: row.document_version_id,
    goal: row.goal,
    conflict: row.conflict,
    payoff: row.payoff,
    hook: row.hook,
    characterIds: jsonList(row.character_ids_json),
    foreshadowIds: jsonList(row.foreshadow_ids_json),
    timelineIds: jsonList(row.timeline_ids_json),
    targetWords: row.target_words,
    pacing: row.pacing,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function chapterBriefSnapshot(brief: ChapterBrief): ChapterBriefSnapshot {
  return {
    goal: brief.goal,
    conflict: brief.conflict,
    payoff: brief.payoff,
    hook: brief.hook,
    characterIds: brief.characterIds,
    foreshadowIds: brief.foreshadowIds,
    timelineIds: brief.timelineIds,
    targetWords: brief.targetWords,
    pacing: brief.pacing,
  };
}

function mapChapterBriefHistory(
  row: ChapterBriefHistoryRow,
): ChapterBriefHistory {
  let snapshot: ChapterBriefSnapshot;
  try {
    const parsed: unknown = JSON.parse(row.snapshot_json);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("snapshot is not an object");
    }
    const value = parsed as Record<string, unknown>;
    snapshot = {
      goal: typeof value.goal === "string" ? value.goal : null,
      conflict: typeof value.conflict === "string" ? value.conflict : null,
      payoff: typeof value.payoff === "string" ? value.payoff : null,
      hook: typeof value.hook === "string" ? value.hook : null,
      characterIds: jsonListValue(value.characterIds),
      foreshadowIds: jsonListValue(value.foreshadowIds),
      timelineIds: jsonListValue(value.timelineIds),
      targetWords:
        typeof value.targetWords === "number" &&
        Number.isFinite(value.targetWords)
          ? value.targetWords
          : null,
      pacing:
        value.pacing === "slow" ||
        value.pacing === "steady" ||
        value.pacing === "fast" ||
        value.pacing === "cliffhanger"
          ? value.pacing
          : "steady",
    };
  } catch {
    throw new Error(
      `chapter brief history ${row.id} has invalid snapshot JSON`,
    );
  }
  return {
    id: row.id,
    projectId: row.project_id,
    outlineNodeId: row.outline_node_id,
    briefVersion: row.brief_version,
    snapshot,
    createdAt: row.created_at,
  };
}

function mapOpeningCheckIssueState(
  row: OpeningCheckIssueStateRow,
): NovelCheckIssueState {
  return {
    projectId: row.project_id,
    issueId: row.issue_id,
    status: row.status,
    note: row.note,
    updatedAt: row.updated_at,
  };
}

function mapOpeningCheckReport(
  row: OpeningCheckReportRow,
): OpeningCheckReportRecord {
  let report: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(row.report_json);
    report =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
  } catch {
    throw new Error(`opening check report ${row.id} has invalid report JSON`);
  }
  return {
    id: row.id,
    projectId: row.project_id,
    scope: row.scope,
    generatedAt: row.generated_at,
    report: {
      ...report,
      id: row.id,
      projectId: row.project_id,
      scope: row.scope,
      generatedAt: row.generated_at,
    },
    createdAt: row.created_at,
  };
}

function mapOpeningCheckAudit(
  row: OpeningCheckAuditRow,
): OpeningCheckAuditRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    reportId: row.report_id,
    issueId: row.issue_id,
    proposalId: row.proposal_id,
    runId: row.run_id,
    eventType: row.event_type,
    action: row.action,
    before: parseJsonRecord(row.before_json),
    after: parseJsonRecord(row.after_json),
    createdAt: row.created_at,
  };
}

function parseJsonRecord(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function isUniqueConstraint(error: unknown): boolean {
  return (
    error instanceof Error && /unique constraint failed/u.test(error.message)
  );
}
