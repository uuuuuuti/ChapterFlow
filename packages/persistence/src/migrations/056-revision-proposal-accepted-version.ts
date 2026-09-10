export const migration056 = {
  version: 56,
  name: "056-revision-proposal-accepted-version",
  sql: `
    ALTER TABLE revision_proposals
      ADD COLUMN accepted_document_version_id TEXT
      REFERENCES document_versions(id) ON DELETE SET NULL;

    CREATE INDEX revision_proposals_accepted_version_idx
      ON revision_proposals(accepted_document_version_id);
  `,
} as const;
