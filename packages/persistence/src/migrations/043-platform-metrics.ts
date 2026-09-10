export const migration043 = {
  version: 43,
  name: "platform-metrics",
  sql: `
    CREATE TABLE platform_metrics (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      platform TEXT NOT NULL,
      chapter TEXT NOT NULL,
      published_date TEXT NOT NULL CHECK (published_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
      words INTEGER NOT NULL CHECK (words >= 0),
      views INTEGER CHECK (views IS NULL OR views >= 0),
      likes INTEGER CHECK (likes IS NULL OR likes >= 0),
      comments INTEGER CHECK (comments IS NULL OR comments >= 0),
      source TEXT NOT NULL CHECK (source = 'csv'),
      updated_at TEXT NOT NULL,
      UNIQUE(project_id, platform, chapter, published_date)
    ) STRICT;

    CREATE INDEX platform_metrics_project_date_idx
      ON platform_metrics(project_id, published_date DESC, platform, chapter);
  `,
} as const;
