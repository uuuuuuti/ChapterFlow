/** Bind generated story-change candidates to the manuscript version that
 * produced their evidence. Existing change sets remain readable and are
 * treated as unbound because older runs did not persist this lineage. */
export const migration059 = {
  version: 59,
  name: "059-canon-change-set-source-version",
  sql: `
    ALTER TABLE canon_change_sets
      ADD COLUMN source_document_id TEXT
      REFERENCES documents(id) ON DELETE SET NULL;

    ALTER TABLE canon_change_sets
      ADD COLUMN source_document_version_id TEXT
      REFERENCES document_versions(id) ON DELETE SET NULL;

    CREATE INDEX canon_change_sets_source_version_idx
      ON canon_change_sets(source_document_id, source_document_version_id);
  `,
} as const;
