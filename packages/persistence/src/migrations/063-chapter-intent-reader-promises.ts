/**
 * Chapter Intent fields and the first-class Reader Promise lifecycle.
 *
 * The chapter_briefs table is deliberately extended in place: old clients and
 * old bundles still address it as a ChapterBrief, while new clients can use
 * the ChapterIntent product name and the richer fields below.
 */
export const migration063 = {
  version: 63,
  name: "chapter-intent-reader-promises",
  sql: `
    ALTER TABLE chapter_briefs ADD COLUMN purpose TEXT NOT NULL DEFAULT 'progress'
      CHECK (purpose IN ('setup','progress','conflict','reveal','payoff','turning_point','relationship','worldbuilding','transition','climax'));
    ALTER TABLE chapter_briefs ADD COLUMN secondary_purposes_json TEXT NOT NULL DEFAULT '[]'
      CHECK (json_valid(secondary_purposes_json));
    ALTER TABLE chapter_briefs ADD COLUMN reader_expectation TEXT;
    ALTER TABLE chapter_briefs ADD COLUMN emotion_target TEXT;
    ALTER TABLE chapter_briefs ADD COLUMN emotion_curve_json TEXT NOT NULL DEFAULT '[]'
      CHECK (json_valid(emotion_curve_json));
    ALTER TABLE chapter_briefs ADD COLUMN reader_promise_operations_json TEXT NOT NULL DEFAULT '[]'
      CHECK (json_valid(reader_promise_operations_json));
    ALTER TABLE chapter_briefs ADD COLUMN payoff_strength INTEGER NOT NULL DEFAULT 0
      CHECK (payoff_strength BETWEEN 0 AND 5);
    ALTER TABLE chapter_briefs ADD COLUMN hook_type TEXT;
    ALTER TABLE chapter_briefs ADD COLUMN hook_strength INTEGER NOT NULL DEFAULT 0
      CHECK (hook_strength BETWEEN 0 AND 5);
    ALTER TABLE chapter_briefs ADD COLUMN information_gain INTEGER NOT NULL DEFAULT 0
      CHECK (information_gain BETWEEN 0 AND 5);
    ALTER TABLE chapter_briefs ADD COLUMN ending_pull INTEGER NOT NULL DEFAULT 0
      CHECK (ending_pull BETWEEN 0 AND 5);
    ALTER TABLE chapter_briefs ADD COLUMN scene_structure_json TEXT NOT NULL DEFAULT '[]'
      CHECK (json_valid(scene_structure_json));

    CREATE TABLE reader_promises (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open','paid_off','abandoned')),
      opened_chapter_id TEXT REFERENCES outline_nodes(id) ON DELETE SET NULL,
      opened_chapter_index INTEGER NOT NULL CHECK (opened_chapter_index > 0),
      target_chapter_id TEXT REFERENCES outline_nodes(id) ON DELETE SET NULL,
      paid_off_chapter_id TEXT REFERENCES outline_nodes(id) ON DELETE SET NULL,
      last_advanced_chapter_id TEXT REFERENCES outline_nodes(id) ON DELETE SET NULL,
      last_advanced_chapter_index INTEGER CHECK (
        last_advanced_chapter_index IS NULL OR last_advanced_chapter_index > 0
      ),
      advance_count INTEGER NOT NULL DEFAULT 0 CHECK (advance_count >= 0),
      version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE INDEX reader_promises_project_status_idx
      ON reader_promises(project_id, status, opened_chapter_index, updated_at DESC);

    CREATE TABLE reader_promise_events (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      promise_id TEXT NOT NULL REFERENCES reader_promises(id) ON DELETE CASCADE,
      action TEXT NOT NULL CHECK (action IN ('OPEN','ADVANCE','PAYOFF')),
      chapter_id TEXT REFERENCES outline_nodes(id) ON DELETE SET NULL,
      chapter_index INTEGER NOT NULL CHECK (chapter_index > 0),
      note TEXT,
      source TEXT NOT NULL DEFAULT 'author'
        CHECK (source IN ('author','ai','settlement','restore')),
      created_at TEXT NOT NULL,
      UNIQUE(promise_id, action, chapter_id)
    ) STRICT;

    CREATE INDEX reader_promise_events_project_idx
      ON reader_promise_events(project_id, chapter_index, created_at);
    CREATE INDEX reader_promise_events_promise_idx
      ON reader_promise_events(promise_id, chapter_index, created_at);
  `,
} as const;
