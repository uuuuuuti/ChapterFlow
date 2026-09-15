/** Add the AI-generated story-engine task to the persisted candidate contract. */
export const migration066 = {
  version: 66,
  name: "signing-sprint-story-engine-task",
  sql: `
    ALTER TABLE signing_sprint_candidates
      RENAME TO signing_sprint_candidates_legacy;

    DROP INDEX IF EXISTS signing_sprint_candidates_project_idx;
    DROP INDEX IF EXISTS signing_sprint_candidates_workflow_idx;
    DROP INDEX IF EXISTS signing_sprint_candidates_task_idx;

    CREATE TABLE signing_sprint_candidates (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL REFERENCES signing_sprint_workflows(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      task TEXT NOT NULL CHECK (
        task IN ('BrainstormBookDirection','RefineBookPositioning','GenerateStoryEngine','EvaluatePositioning',
          'GenerateBookPackaging','EvaluateBookPackaging','GenerateOpeningBlueprint',
          'EvaluateOpening','GenerateChapterFromIntent','SigningReadinessReview')
      ),
      status TEXT NOT NULL DEFAULT 'candidate'
        CHECK (status IN ('candidate','accepted','rejected')),
      payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
      rationale TEXT NOT NULL,
      provenance_json TEXT NOT NULL CHECK (json_valid(provenance_json)),
      base_workflow_version INTEGER NOT NULL CHECK (base_workflow_version >= 0),
      created_at TEXT NOT NULL,
      decided_at TEXT
    ) STRICT;

    INSERT INTO signing_sprint_candidates(
      id, workflow_id, project_id, task, status, payload_json, rationale,
      provenance_json, base_workflow_version, created_at, decided_at
    )
    SELECT
      id, workflow_id, project_id, task, status, payload_json, rationale,
      provenance_json, base_workflow_version, created_at, decided_at
    FROM signing_sprint_candidates_legacy;

    DROP TABLE signing_sprint_candidates_legacy;

    CREATE INDEX signing_sprint_candidates_project_idx
      ON signing_sprint_candidates(project_id, task, created_at DESC);
    CREATE INDEX signing_sprint_candidates_workflow_idx
      ON signing_sprint_candidates(workflow_id, status, created_at DESC);
    CREATE INDEX signing_sprint_candidates_task_idx
      ON signing_sprint_candidates(task, created_at DESC);
  `,
} as const;
