/** Allow a foundation candidate to represent one complete, comparable plan.
 * Existing intent/compass/entity rows are copied byte-for-byte. Rebuilding
 * this small table keeps the CHECK constraint honest on SQLite installations
 * that cannot ALTER a CHECK expression in place. */
export const migration051 = {
  version: 51,
  name: "foundation-plans",
  foreignKeysOff: true,
  sql: `
    CREATE TABLE foundation_candidates_new (
      id TEXT PRIMARY KEY,
      set_id TEXT NOT NULL REFERENCES foundation_candidate_sets(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('intent','compass','entity','plan')),
      label TEXT NOT NULL,
      payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
      edited_payload_json TEXT CHECK (edited_payload_json IS NULL OR json_valid(edited_payload_json)),
      status TEXT NOT NULL CHECK (status IN ('pending','adopted','discarded')),
      adopted_ref_type TEXT,
      adopted_ref_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    INSERT INTO foundation_candidates_new(
      id, set_id, project_id, kind, label, payload_json, edited_payload_json,
      status, adopted_ref_type, adopted_ref_id, created_at, updated_at
    )
    SELECT
      id, set_id, project_id, kind, label, payload_json, edited_payload_json,
      status, adopted_ref_type, adopted_ref_id, created_at, updated_at
    FROM foundation_candidates;

    DROP TABLE foundation_candidates;
    ALTER TABLE foundation_candidates_new RENAME TO foundation_candidates;

    CREATE INDEX foundation_candidates_set_idx
      ON foundation_candidates(set_id, status, kind, created_at);
  `,
} as const;
