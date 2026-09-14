/** Reserved marker for the first Signing Sprint workflow release. */
export const migration065 = {
  version: 65,
  name: "signing-sprint-workflow-marker",
  sql: `
    CREATE INDEX IF NOT EXISTS signing_sprint_candidates_task_idx
      ON signing_sprint_candidates(task, created_at DESC);
  `,
} as const;
