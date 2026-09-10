export const migration049 = {
  version: 49,
  name: "book-profile-history",
  sql: `
    CREATE TABLE book_profile_history (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      profile_version INTEGER NOT NULL CHECK (profile_version >= 0),
      snapshot_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE INDEX book_profile_history_project_created_idx
      ON book_profile_history(project_id, created_at DESC, profile_version DESC);
  `,
} as const;
