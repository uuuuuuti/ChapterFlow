export const migration044 = {
  version: 44,
  name: "publish-records",
  sql: `
    CREATE TABLE publish_records (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      platform TEXT NOT NULL,
      chapter TEXT NOT NULL,
      published_at TEXT NOT NULL CHECK (published_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
      url TEXT,
      status TEXT NOT NULL CHECK (status IN ('published','scheduled','draft')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE INDEX publish_records_project_date_idx
      ON publish_records(project_id, published_at DESC, created_at DESC);
  `,
} as const;
