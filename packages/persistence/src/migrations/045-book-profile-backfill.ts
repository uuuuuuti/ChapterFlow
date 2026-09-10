export const migration045 = {
  version: 45,
  name: "book-profile-backfill",
  sql: `
    INSERT INTO book_profiles(
      project_id, preset_id, genre, audience, promise, tone, ending_direction,
      pov, update_cadence, target_words_per_chapter, boundaries_json,
      world_rules_json, arc_notes_json, version, updated_at
    )
    SELECT
      projects.id, NULL, NULL, NULL, projects.premise, NULL, NULL,
      NULL, NULL, NULL, '[]', '[]', '[]', 0, projects.updated_at
    FROM projects
    WHERE NOT EXISTS (
      SELECT 1 FROM book_profiles WHERE book_profiles.project_id = projects.id
    );
  `,
} as const;
