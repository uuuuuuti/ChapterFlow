/**
 * Keep each chapter plan tied to the manuscript version it was written
 * against. Existing briefs remain valid as historical notes; a nullable
 * binding lets chapters without a saved manuscript version continue to load.
 */
export const migration052 = {
  version: 52,
  name: "chapter-brief-document-binding",
  sql: `
    ALTER TABLE chapter_briefs
      ADD COLUMN document_version_id TEXT REFERENCES document_versions(id) ON DELETE SET NULL;

    CREATE INDEX chapter_briefs_document_version_idx
      ON chapter_briefs(document_version_id);
  `,
} as const;
