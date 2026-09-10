/**
 * Persisted outline structure operations make bulk moves and copies reversible
 * after a refresh or process restart. The JSON snapshots deliberately keep
 * the operation payload independent from outline foreign keys: a deleted
 * source node must not make the operation log unreadable.
 */
export const migration050 = {
  version: 50,
  name: "outline-operations",
  sql: `
    CREATE TABLE outline_operations (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      operation TEXT NOT NULL CHECK (operation IN ('batch_move','copy')),
      before_json TEXT NOT NULL,
      after_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      undone_at TEXT
    ) STRICT;

    CREATE INDEX outline_operations_project_created_idx
      ON outline_operations(project_id, created_at DESC);
  `,
} as const;
