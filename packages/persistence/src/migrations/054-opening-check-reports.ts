/**
 * Persist every opening-three check result so a later author decision can be
 * traced back to the exact report and manuscript versions that produced it.
 * The JSON payload is intentionally forward-compatible: newer report fields
 * can be restored by older clients as opaque history until their UI catches up.
 */
export const migration054 = {
  version: 54,
  name: "opening-check-reports",
  sql: `
    CREATE TABLE opening_check_reports (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      scope TEXT NOT NULL CHECK (scope = 'opening-three'),
      generated_at TEXT NOT NULL,
      report_json TEXT NOT NULL CHECK (json_valid(report_json)),
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE INDEX opening_check_reports_project_idx
      ON opening_check_reports(project_id, generated_at DESC, id DESC);
  `,
} as const;
