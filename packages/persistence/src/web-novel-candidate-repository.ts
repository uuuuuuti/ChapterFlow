import type {
  WebNovelCandidateEvidence,
  WebNovelCandidateItem,
  WebNovelCandidateKind,
  WebNovelCandidateSet,
} from "@narralume/domain";

import type { NarrativeDatabase } from "./database.js";
import { PersistenceNotFoundError } from "./project-repository.js";

export interface WebNovelCandidateSetDetail {
  set: WebNovelCandidateSet;
  items: WebNovelCandidateItem[];
}

export class SqliteWebNovelCandidateRepository {
  constructor(private readonly database: NarrativeDatabase) {}

  stageCandidateSet(input: {
    id: string;
    projectId: string;
    runId: string;
    stepId: string;
    kind: WebNovelCandidateKind;
    outlineNodeId: string | null;
    instruction: string;
    summary: string;
    sourceProfileVersion: number | null;
    sourceBriefVersion: number | null;
    sourceDocumentId: string | null;
    sourceDocumentVersionId: string | null;
    sourceOutlineUpdatedAt: string | null;
    baseFingerprint: string;
    items: readonly {
      id: string;
      title: string;
      rationale: string;
      impact: readonly string[];
      before: Readonly<Record<string, unknown>> | null;
      after: Readonly<Record<string, unknown>>;
      evidence: readonly WebNovelCandidateEvidence[];
      requiresLockedConfirmation: boolean;
    }[];
    now: string;
  }): WebNovelCandidateSetDetail {
    return this.database.transaction(() => {
      const existing = this.get(input.id);
      if (existing) return existing;
      this.database.raw
        .prepare(
          `INSERT INTO web_novel_candidate_sets(
            id, project_id, run_id, step_id, kind, outline_node_id, instruction,
            summary, source_profile_version, source_brief_version, source_document_id,
            source_document_version_id, source_outline_updated_at, base_fingerprint,
            status, created_at, decided_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'candidate', ?, NULL)`,
        )
        .run(
          input.id,
          input.projectId,
          input.runId,
          input.stepId,
          input.kind,
          input.outlineNodeId,
          input.instruction,
          input.summary,
          input.sourceProfileVersion,
          input.sourceBriefVersion,
          input.sourceDocumentId,
          input.sourceDocumentVersionId,
          input.sourceOutlineUpdatedAt,
          input.baseFingerprint,
          input.now,
        );
      const insert = this.database.raw.prepare(
        `INSERT INTO web_novel_candidate_items(
          id, set_id, operation, title, rationale, impact_json, before_json,
          after_json, evidence_json, requires_locked_confirmation,
          decision_action, decision_result_json, decided_at, created_at
        ) VALUES (?, ?, 'update', ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?)`,
      );
      for (const item of input.items) {
        insert.run(
          item.id,
          input.id,
          item.title,
          item.rationale,
          JSON.stringify(item.impact),
          item.before === null ? null : JSON.stringify(item.before),
          JSON.stringify(item.after),
          JSON.stringify(item.evidence),
          item.requiresLockedConfirmation ? 1 : 0,
          input.now,
        );
      }
      return this.require(input.id);
    });
  }

  list(
    projectId: string,
    kind?: WebNovelCandidateKind,
  ): WebNovelCandidateSetDetail[] {
    const rows = this.database.raw
      .prepare(
        `SELECT * FROM web_novel_candidate_sets
         WHERE project_id = ? AND (? IS NULL OR kind = ?)
         ORDER BY created_at DESC, id DESC`,
      )
      .all(projectId, kind ?? null, kind ?? null) as unknown as SetRow[];
    return rows.map((row) => this.mapDetail(row));
  }

  get(id: string): WebNovelCandidateSetDetail | null {
    const row = this.database.raw
      .prepare("SELECT * FROM web_novel_candidate_sets WHERE id = ?")
      .get(id) as SetRow | undefined;
    return row ? this.mapDetail(row) : null;
  }

  require(id: string): WebNovelCandidateSetDetail {
    const detail = this.get(id);
    if (!detail)
      throw new PersistenceNotFoundError("web_novel_candidate_set", id);
    return detail;
  }

  decideItem(input: {
    setId: string;
    itemId: string;
    action: "apply" | "reject";
    result: Readonly<Record<string, unknown>> | null;
    now: string;
  }): WebNovelCandidateSetDetail {
    return this.database.transaction(() => {
      const detail = this.require(input.setId);
      const item = detail.items.find(
        (candidate) => candidate.id === input.itemId,
      );
      if (!item)
        throw new PersistenceNotFoundError(
          "web_novel_candidate_item",
          input.itemId,
        );
      if (item.decision) return detail;
      this.database.raw
        .prepare(
          `UPDATE web_novel_candidate_items
           SET decision_action = ?, decision_result_json = ?, decided_at = ?
           WHERE id = ? AND set_id = ? AND decision_action IS NULL`,
        )
        .run(
          input.action,
          input.result === null ? null : JSON.stringify(input.result),
          input.now,
          input.itemId,
          input.setId,
        );
      this.refreshStatus(input.setId, input.now);
      return this.require(input.setId);
    });
  }

  private refreshStatus(setId: string, now: string): void {
    const counts = this.database.raw
      .prepare(
        `SELECT COUNT(*) AS total,
          SUM(CASE WHEN decision_action IS NULL THEN 1 ELSE 0 END) AS pending,
          SUM(CASE WHEN decision_action = 'apply' THEN 1 ELSE 0 END) AS applied
         FROM web_novel_candidate_items WHERE set_id = ?`,
      )
      .get(setId) as { total: number; pending: number; applied: number };
    const status =
      counts.pending > 0
        ? counts.applied > 0
          ? "partially_applied"
          : "candidate"
        : counts.applied > 0
          ? "applied"
          : "rejected";
    this.database.raw
      .prepare(
        "UPDATE web_novel_candidate_sets SET status = ?, decided_at = ? WHERE id = ?",
      )
      .run(status, now, setId);
  }

  private mapDetail(row: SetRow): WebNovelCandidateSetDetail {
    const items = this.database.raw
      .prepare(
        "SELECT * FROM web_novel_candidate_items WHERE set_id = ? ORDER BY created_at, id",
      )
      .all(row.id) as unknown as ItemRow[];
    return { set: mapSet(row), items: items.map(mapItem) };
  }
}

interface SetRow {
  id: string;
  project_id: string;
  run_id: string;
  step_id: string;
  kind: WebNovelCandidateKind;
  outline_node_id: string | null;
  instruction: string;
  summary: string;
  source_profile_version: number | null;
  source_brief_version: number | null;
  source_document_id: string | null;
  source_document_version_id: string | null;
  source_outline_updated_at: string | null;
  base_fingerprint: string;
  status: WebNovelCandidateSet["status"];
  created_at: string;
  decided_at: string | null;
}

interface ItemRow {
  id: string;
  set_id: string;
  operation: "update";
  title: string;
  rationale: string;
  impact_json: string;
  before_json: string | null;
  after_json: string;
  evidence_json: string;
  requires_locked_confirmation: number;
  decision_action: "apply" | "reject" | null;
  decision_result_json: string | null;
  decided_at: string | null;
  created_at: string;
}

function mapSet(row: SetRow): WebNovelCandidateSet {
  return {
    id: row.id,
    projectId: row.project_id,
    runId: row.run_id,
    stepId: row.step_id,
    kind: row.kind,
    outlineNodeId: row.outline_node_id,
    instruction: row.instruction,
    summary: row.summary,
    sourceProfileVersion: row.source_profile_version,
    sourceBriefVersion: row.source_brief_version,
    sourceDocumentId: row.source_document_id,
    sourceDocumentVersionId: row.source_document_version_id,
    sourceOutlineUpdatedAt: row.source_outline_updated_at,
    baseFingerprint: row.base_fingerprint,
    currentFingerprint: row.base_fingerprint,
    stale: false,
    status: row.status,
    items: [],
    createdAt: row.created_at,
    decidedAt: row.decided_at,
  };
}

function mapItem(row: ItemRow): WebNovelCandidateItem {
  return {
    id: row.id,
    operation: row.operation,
    title: row.title,
    rationale: row.rationale,
    impact: parseArray(row.impact_json).filter(
      (value): value is string => typeof value === "string",
    ),
    before: row.before_json ? parseObject(row.before_json) : null,
    after: parseObject(row.after_json),
    evidence: parseArray(row.evidence_json) as WebNovelCandidateEvidence[],
    requiresLockedConfirmation: row.requires_locked_confirmation === 1,
    decision: row.decision_action
      ? {
          action: row.decision_action,
          result: row.decision_result_json
            ? parseObject(row.decision_result_json)
            : null,
          decidedAt: row.decided_at ?? "",
        }
      : null,
  };
}

function parseObject(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(value);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}

function parseArray(value: string): unknown[] {
  const parsed: unknown = JSON.parse(value);
  return Array.isArray(parsed) ? parsed : [];
}
