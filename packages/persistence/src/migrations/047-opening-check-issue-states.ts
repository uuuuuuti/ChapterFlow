export const migration047 = {
  version: 47,
  name: "opening-check-issue-states",
  sql: `
    CREATE TABLE opening_check_issue_states (
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      issue_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('open', 'ignored', 'resolved')),
      note TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (project_id, issue_id)
    ) STRICT;

    CREATE INDEX opening_check_issue_states_project_idx
      ON opening_check_issue_states(project_id, status, updated_at DESC);
  `,
} as const;
