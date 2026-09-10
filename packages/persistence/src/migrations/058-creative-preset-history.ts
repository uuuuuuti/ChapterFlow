export const migration058 = {
  version: 58,
  name: "058-creative-preset-history",
  sql: `
    CREATE TABLE creative_preset_history (
      id TEXT PRIMARY KEY,
      preset_id TEXT NOT NULL REFERENCES creative_presets(id) ON DELETE CASCADE,
      preset_version INTEGER NOT NULL CHECK (preset_version >= 0),
      snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json)),
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE INDEX creative_preset_history_scope_idx
      ON creative_preset_history(preset_id, created_at DESC, id DESC);
  `,
} as const;
