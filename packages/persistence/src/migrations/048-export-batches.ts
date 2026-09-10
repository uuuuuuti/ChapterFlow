export const migration048 = {
  version: 48,
  name: "export-batches",
  sql: `
    CREATE TABLE export_batches (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      format TEXT NOT NULL CHECK (format IN ('markdown','text','docx','epub','narrative-bundle')),
      version_mode TEXT NOT NULL CHECK (version_mode IN ('current','history')),
      include_annotations INTEGER NOT NULL CHECK (include_annotations IN (0,1)),
      include_runs INTEGER NOT NULL CHECK (include_runs IN (0,1)),
      from_outline_node_id TEXT REFERENCES outline_nodes(id) ON DELETE SET NULL,
      to_outline_node_id TEXT REFERENCES outline_nodes(id) ON DELETE SET NULL,
      filename TEXT NOT NULL,
      byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
      content_hash TEXT NOT NULL CHECK (length(content_hash) = 64),
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE INDEX export_batches_project_created_idx
      ON export_batches(project_id, created_at DESC);

    ALTER TABLE publish_records
      ADD COLUMN export_batch_id TEXT REFERENCES export_batches(id) ON DELETE SET NULL;

    CREATE INDEX publish_records_export_batch_idx
      ON publish_records(export_batch_id);
  `,
} as const;
