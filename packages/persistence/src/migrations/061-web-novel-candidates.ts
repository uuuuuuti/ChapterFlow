/** Durable candidate sets for AI assisted workbench profile/brief edits. */
export const migration061 = {
  version: 61,
  name: "web-novel-candidates",
  sql: `
    CREATE TABLE web_novel_candidate_sets (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
      step_id TEXT NOT NULL REFERENCES run_steps(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('profile','brief')),
      outline_node_id TEXT REFERENCES outline_nodes(id) ON DELETE SET NULL,
      instruction TEXT NOT NULL,
      summary TEXT NOT NULL,
      source_profile_version INTEGER,
      source_brief_version INTEGER,
      source_document_id TEXT,
      source_document_version_id TEXT,
      source_outline_updated_at TEXT,
      base_fingerprint TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('candidate','partially_applied','applied','rejected')),
      created_at TEXT NOT NULL,
      decided_at TEXT
    ) STRICT;

    CREATE INDEX web_novel_candidate_sets_project_idx
      ON web_novel_candidate_sets(project_id, kind, created_at DESC);

    CREATE TABLE web_novel_candidate_items (
      id TEXT PRIMARY KEY,
      set_id TEXT NOT NULL REFERENCES web_novel_candidate_sets(id) ON DELETE CASCADE,
      operation TEXT NOT NULL CHECK (operation = 'update'),
      title TEXT NOT NULL,
      rationale TEXT NOT NULL,
      impact_json TEXT NOT NULL CHECK (json_valid(impact_json)),
      before_json TEXT CHECK (before_json IS NULL OR json_valid(before_json)),
      after_json TEXT NOT NULL CHECK (json_valid(after_json)),
      evidence_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(evidence_json)),
      requires_locked_confirmation INTEGER NOT NULL DEFAULT 0 CHECK (requires_locked_confirmation IN (0,1)),
      decision_action TEXT CHECK (decision_action IS NULL OR decision_action IN ('apply','reject')),
      decision_result_json TEXT CHECK (decision_result_json IS NULL OR json_valid(decision_result_json)),
      decided_at TEXT,
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE INDEX web_novel_candidate_items_set_idx
      ON web_novel_candidate_items(set_id, created_at, id);
  `,
} as const;
