/** Keep every platform-metric import explainable and reversible.  The change
 * snapshot is deliberately stored with the audit row so a later rollback can
 * restore only the values written by that import and refuse to overwrite a
 * newer edit. */
export const migration053 = {
  version: 53,
  name: "platform-metric-import-audit",
  sql: `
    CREATE TABLE platform_metric_imports (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      source_hash TEXT NOT NULL CHECK (length(source_hash) = 64),
      source_rows INTEGER NOT NULL CHECK (source_rows >= 0),
      added_count INTEGER NOT NULL CHECK (added_count >= 0),
      replaced_count INTEGER NOT NULL CHECK (replaced_count >= 0),
      changes_json TEXT NOT NULL CHECK (json_valid(changes_json)),
      status TEXT NOT NULL CHECK (status IN ('active','rolled_back')),
      created_at TEXT NOT NULL,
      rolled_back_at TEXT
    ) STRICT;

    CREATE INDEX platform_metric_imports_project_created_idx
      ON platform_metric_imports(project_id, created_at DESC);
  `,
} as const;
