/** Versioned, provenance-first official knowledge for the Signing Sprint. */
export const migration064 = {
  version: 64,
  name: "official-knowledge",
  sql: `
    CREATE TABLE official_sources (
      id TEXT PRIMARY KEY,
      source_key TEXT NOT NULL,
      platform TEXT NOT NULL DEFAULT 'fanqienovel'
        CHECK (platform = 'fanqienovel'),
      url TEXT NOT NULL,
      title TEXT NOT NULL,
      source_type TEXT NOT NULL CHECK (
        source_type IN ('platform_rule','official_course','help','signing','governance','tag_guide')
      ),
      published_at TEXT,
      retrieved_at TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'CANDIDATE' CHECK (
        status IN ('ACTIVE','CANDIDATE','OUTDATED','SUPERSEDED','DISABLED','FETCH_FAILED')
      ),
      applicable_stages_json TEXT NOT NULL DEFAULT '[]'
        CHECK (json_valid(applicable_stages_json)),
      applicable_genres_json TEXT NOT NULL DEFAULT '[]'
        CHECK (json_valid(applicable_genres_json)),
      authority_type TEXT NOT NULL CHECK (
        authority_type IN ('OFFICIAL_RULE','OFFICIAL_GUIDANCE','OFFICIAL_TUTORIAL')
      ),
      summary TEXT NOT NULL,
      source_version TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(source_key, source_version)
    ) STRICT;

    CREATE INDEX official_sources_status_idx
      ON official_sources(status, source_type, updated_at DESC);
    CREATE INDEX official_sources_key_idx
      ON official_sources(source_key, retrieved_at DESC);

    CREATE TABLE knowledge_cards (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      principle TEXT NOT NULL,
      why TEXT NOT NULL,
      applicable_stage TEXT NOT NULL,
      applicable_genres_json TEXT NOT NULL DEFAULT '[]'
        CHECK (json_valid(applicable_genres_json)),
      signals_json TEXT NOT NULL DEFAULT '[]'
        CHECK (json_valid(signals_json)),
      anti_patterns_json TEXT NOT NULL DEFAULT '[]'
        CHECK (json_valid(anti_patterns_json)),
      suggestions_json TEXT NOT NULL DEFAULT '[]'
        CHECK (json_valid(suggestions_json)),
      severity TEXT NOT NULL CHECK (severity IN ('info','suggestion','warning')),
      source_refs_json TEXT NOT NULL CHECK (json_valid(source_refs_json)),
      confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
      status TEXT NOT NULL DEFAULT 'CANDIDATE'
        CHECK (status IN ('ACTIVE','CANDIDATE','DISABLED')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE INDEX knowledge_cards_stage_idx
      ON knowledge_cards(status, applicable_stage, updated_at DESC);

    CREATE TABLE signing_sprint_workflows (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active','paused','completed')),
      current_step TEXT NOT NULL DEFAULT 'direction'
        CHECK (current_step IN ('direction','positioning','story_engine','packaging','opening','writing','readiness')),
      completed_steps_json TEXT NOT NULL DEFAULT '[]'
        CHECK (json_valid(completed_steps_json)),
      state_json TEXT NOT NULL CHECK (json_valid(state_json)),
      selected_strategy_id TEXT,
      knowledge_refs_json TEXT NOT NULL DEFAULT '[]'
        CHECK (json_valid(knowledge_refs_json)),
      version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE INDEX signing_sprint_workflows_status_idx
      ON signing_sprint_workflows(status, updated_at DESC);

    CREATE TABLE signing_sprint_candidates (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL REFERENCES signing_sprint_workflows(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      task TEXT NOT NULL CHECK (
        task IN ('BrainstormBookDirection','RefineBookPositioning','EvaluatePositioning',
          'GenerateBookPackaging','EvaluateBookPackaging','GenerateOpeningBlueprint',
          'EvaluateOpening','GenerateChapterFromIntent','SigningReadinessReview')
      ),
      status TEXT NOT NULL DEFAULT 'candidate'
        CHECK (status IN ('candidate','accepted','rejected')),
      payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
      rationale TEXT NOT NULL,
      provenance_json TEXT NOT NULL CHECK (json_valid(provenance_json)),
      base_workflow_version INTEGER NOT NULL CHECK (base_workflow_version >= 0),
      created_at TEXT NOT NULL,
      decided_at TEXT
    ) STRICT;

    CREATE INDEX signing_sprint_candidates_project_idx
      ON signing_sprint_candidates(project_id, task, created_at DESC);
    CREATE INDEX signing_sprint_candidates_workflow_idx
      ON signing_sprint_candidates(workflow_id, status, created_at DESC);
  `,
} as const;
