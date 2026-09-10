export const migration055 = {
  version: 55,
  name: "055-opening-check-audits",
  sql: `
    CREATE TABLE opening_check_audits (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      report_id TEXT REFERENCES opening_check_reports(id) ON DELETE SET NULL,
      issue_id TEXT,
      proposal_id TEXT REFERENCES revision_proposals(id) ON DELETE SET NULL,
      run_id TEXT REFERENCES runs(id) ON DELETE SET NULL,
      event_type TEXT NOT NULL CHECK (event_type IN ('report_generated','issue_decided','candidate_decided')),
      action TEXT NOT NULL,
      before_json TEXT CHECK (before_json IS NULL OR json_valid(before_json)),
      after_json TEXT CHECK (after_json IS NULL OR json_valid(after_json)),
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE INDEX opening_check_audits_project_idx
      ON opening_check_audits(project_id, created_at DESC, id DESC);

    CREATE INDEX opening_check_audits_report_idx
      ON opening_check_audits(report_id, created_at DESC);

    CREATE INDEX opening_check_audits_issue_idx
      ON opening_check_audits(project_id, issue_id, created_at DESC);
  `,
} as const;
