export const migration042 = {
  version: 42,
  name: "web-novel-planning",
  legacyRepairs: [
    {
      checksum:
        "4829251376091b045358c44ff7646b00ae6a106ce9a48c04447e5c8f97993657",
      sql: "-- Existing databases already contain the equivalent planning tables; refresh the migration checksum.",
    },
  ],
  sql: `
    CREATE TABLE creative_presets (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      genre TEXT,
      audience TEXT,
      promise TEXT,
      pacing TEXT NOT NULL CHECK (pacing IN ('slow','steady','fast','cliffhanger')),
      target_words_per_chapter INTEGER NOT NULL CHECK (target_words_per_chapter > 0),
      update_cadence TEXT,
      boundaries_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(boundaries_json)),
      check_rules_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(check_rules_json)),
      default_template TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
      version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(project_id, name)
    ) STRICT;

    CREATE INDEX creative_presets_scope_idx
      ON creative_presets(project_id, status, updated_at DESC);

    INSERT INTO creative_presets(
      id, project_id, name, genre, audience, promise, pacing,
      target_words_per_chapter, update_cadence, boundaries_json,
      check_rules_json, default_template, status, version, created_at, updated_at
    ) VALUES
      (
        'preset-web-novel-fast', NULL, '快节奏升级', '都市/玄幻',
        '喜欢明确回报与持续升级的追更读者',
        '每章推进一个可感知的目标，并留下下一章的问题', 'fast', 3000,
        '日更', '["不靠重复误会拖延冲突"]',
        '["章内有明确冲突", "章尾保留待解问题", "回报不能脱离前文依据"]',
        NULL, 'active', 0, '2026-09-08T00:00:00.000Z', '2026-09-08T00:00:00.000Z'
      ),
      (
        'preset-web-novel-mystery', NULL, '线索悬疑', '都市悬疑/推理',
        '喜欢线索公平、反转有依据的读者',
        '每章新增线索或重新解释旧线索，读者能回看验证', 'steady', 3200,
        '日更', '["不靠信息隐瞒制造无依据反转"]',
        '["线索有来源", "反转可回溯", "章尾有新的悬念"]',
        NULL, 'active', 0, '2026-09-08T00:00:00.000Z', '2026-09-08T00:00:00.000Z'
      );

    CREATE TABLE book_profiles (
      project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
      preset_id TEXT REFERENCES creative_presets(id) ON DELETE SET NULL,
      genre TEXT,
      audience TEXT,
      promise TEXT,
      tone TEXT,
      ending_direction TEXT,
      pov TEXT,
      update_cadence TEXT,
      target_words_per_chapter INTEGER CHECK (target_words_per_chapter IS NULL OR target_words_per_chapter > 0),
      boundaries_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(boundaries_json)),
      world_rules_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(world_rules_json)),
      arc_notes_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(arc_notes_json)),
      version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE chapter_briefs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      outline_node_id TEXT NOT NULL REFERENCES outline_nodes(id) ON DELETE CASCADE,
      goal TEXT,
      conflict TEXT,
      payoff TEXT,
      hook TEXT,
      character_ids_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(character_ids_json)),
      foreshadow_ids_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(foreshadow_ids_json)),
      timeline_ids_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(timeline_ids_json)),
      target_words INTEGER CHECK (target_words IS NULL OR target_words > 0),
      pacing TEXT NOT NULL DEFAULT 'steady' CHECK (pacing IN ('slow','steady','fast','cliffhanger')),
      version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(project_id, outline_node_id)
    ) STRICT;

    CREATE INDEX chapter_briefs_project_idx
      ON chapter_briefs(project_id, updated_at DESC);
  `,
} as const;
