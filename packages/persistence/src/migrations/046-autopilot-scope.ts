export const migration046 = {
  version: 46,
  name: "autopilot-scope",
  sql: `
    ALTER TABLE autopilot_sessions
      ADD COLUMN start_outline_node_id TEXT REFERENCES outline_nodes(id) ON DELETE SET NULL;
    ALTER TABLE autopilot_sessions
      ADD COLUMN end_outline_node_id TEXT REFERENCES outline_nodes(id) ON DELETE SET NULL;
  `,
} as const;
