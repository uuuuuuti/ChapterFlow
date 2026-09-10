/** Keep an auditable record for every valid export attempt, including failures. */
export const migration062 = {
  version: 62,
  name: "export-batch-outcomes",
  sql: `
    ALTER TABLE export_batches
      ADD COLUMN status TEXT NOT NULL DEFAULT 'completed';
    ALTER TABLE export_batches
      ADD COLUMN error_code TEXT;
    ALTER TABLE export_batches
      ADD COLUMN error_message TEXT;
    ALTER TABLE export_batches
      ADD COLUMN retry_of_batch_id TEXT;

    CREATE INDEX export_batches_project_status_idx
      ON export_batches(project_id, status, created_at DESC);
  `,
} as const;
