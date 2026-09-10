export const migration057 = {
  version: 57,
  name: "057-chapter-brief-history",
  sql: `
    CREATE TABLE chapter_brief_history (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      outline_node_id TEXT NOT NULL REFERENCES outline_nodes(id) ON DELETE CASCADE,
      brief_version INTEGER NOT NULL CHECK (brief_version >= 0),
      snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json)),
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE INDEX chapter_brief_history_scope_idx
      ON chapter_brief_history(project_id, outline_node_id, created_at DESC, id DESC);
  `,
} as const;
