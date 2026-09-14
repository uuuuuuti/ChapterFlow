import { createProject, transitionProjectPhase } from "@narralume/domain";
import { NodeNarrativeDatabase } from "../src/node.js";
import { afterEach, describe, expect, it } from "vitest";

import {
  MigrationError,
  SqliteProjectRepository,
  SqliteDocumentRepository,
  SqliteWebNovelRepository,
} from "../src/index.js";
import { migration001 } from "../src/migrations/001-foundation.js";
import { migration002 } from "../src/migrations/002-story-kernel.js";
import { migration003 } from "../src/migrations/003-harness.js";
import { migration004 } from "../src/migrations/004-autopilot.js";
import { migration005 } from "../src/migrations/005-cocreate-studio.js";
import { migration006 } from "../src/migrations/006-delivery.js";
import { migration007 } from "../src/migrations/007-editing-safety.js";
import { migration008 } from "../src/migrations/008-canon-fact-withdrawals.js";
import { migration009 } from "../src/migrations/009-review-workspace.js";
import { migration010 } from "../src/migrations/010-run-streams.js";
import { migration011 } from "../src/migrations/011-long-novel-intelligence.js";
import { migration012 } from "../src/migrations/012-product-lifecycle.js";
import { migration013 } from "../src/migrations/013-resilient-import-analysis.js";
import { migration014 } from "../src/migrations/014-data-safety.js";
import { migration015 } from "../src/migrations/015-llm-call-interruption.js";
import { migration016 } from "../src/migrations/016-providers-models-assignments.js";
import { migration017 } from "../src/migrations/017-profile-fk-to-models.js";
import { migration018 } from "../src/migrations/018-run-observability.js";
import { migration019 } from "../src/migrations/019-physical-call-reservations.js";
import { migration020 } from "../src/migrations/020-model-runtime-convergence.js";
import { migration021 } from "../src/migrations/021-cross-chapter-settlement.js";
import { migration022 } from "../src/migrations/022-project-foundation-requests.js";
import { migration023 } from "../src/migrations/023-chapter-document-identity.js";
import { migration041 } from "../src/migrations/041-review-author-decisions.js";

const MIGRATIONS_UP_TO_023 = [
  migration001,
  migration002,
  migration003,
  migration004,
  migration005,
  migration006,
  migration007,
  migration008,
  migration009,
  migration010,
  migration011,
  migration012,
  migration013,
  migration014,
  migration015,
  migration016,
  migration017,
  migration018,
  migration019,
  migration020,
  migration021,
  migration022,
  migration023,
];
const MUTATED_MIGRATION_023_CHECKSUM =
  "87b6b3a74f72bc6d9739689c35c388a7def69badc4c4439d3fb8d0e2a8d43472";

const databases: NodeNarrativeDatabase[] = [];

afterEach(() => {
  while (databases.length > 0) databases.pop()?.close();
});

function database(): NodeNarrativeDatabase {
  const value = new NodeNarrativeDatabase();
  value.migrate();
  databases.push(value);
  return value;
}

describe("NodeNarrativeDatabase", () => {
  it("applies the B1 migrations idempotently and enforces checksums", () => {
    const db = database();
    expect(db.currentMigration()).toBe(63);
    expect(db.migrate()).toBe(63);
    expect(
      db.raw
        .prepare("SELECT checksum FROM schema_migrations WHERE version = 23")
        .get(),
    ).toEqual({
      checksum:
        "b1f666c4425d817f593b39ca166e595fde19b8f67c11d066bfaf2d5e9fd2da66",
    });
    expect(() =>
      db.migrate([{ version: 20, name: "changed", sql: "SELECT 1;" }]),
    ).toThrow(MigrationError);
  });

  it("backfills author-decision flags for existing blocked review issues", () => {
    const db = new NodeNarrativeDatabase();
    databases.push(db);
    db.raw.exec(`
      CREATE TABLE review_issues (id TEXT PRIMARY KEY) STRICT;
      CREATE TABLE review_reports (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        step_id TEXT NOT NULL,
        verdict TEXT NOT NULL
      ) STRICT;
      CREATE TABLE run_steps (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        output_artifact_json TEXT
      ) STRICT;
      INSERT INTO review_issues(id) VALUES ('decision-issue'), ('ordinary-issue');
      INSERT INTO review_reports(id, run_id, step_id, verdict)
      VALUES ('report-1', 'run-1', 'review-1', 'block');
      INSERT INTO run_steps(id, run_id, output_artifact_json)
      VALUES (
        'review-1',
        'run-1',
        '{"issues":[{"id":"decision-issue","requiresAuthorDecision":true},{"id":"ordinary-issue","requiresAuthorDecision":false}]}'
      );
    `);

    expect(db.migrate([migration041])).toBe(41);
    expect(
      db.raw
        .prepare(
          "SELECT id, requires_author_decision FROM review_issues ORDER BY id",
        )
        .all(),
    ).toEqual([
      { id: "decision-issue", requires_author_decision: 1 },
      { id: "ordinary-issue", requires_author_decision: 0 },
    ]);
  });

  it("installs project write guards while preserving run cleanup updates", () => {
    const db = database();
    const triggers = db.raw
      .prepare(
        `SELECT name
         FROM sqlite_master
         WHERE type = 'trigger' AND name LIKE '%-project-write-guard-%'`,
      )
      .all() as { name: string }[];
    const names = new Set(triggers.map((trigger) => trigger.name));

    expect(names).toContain("timeline-events-project-write-guard-insert");
    expect(names).toContain("document-versions-project-write-guard-update");
    expect(names).toContain("runs-project-write-guard-insert");
    expect(names).not.toContain("runs-project-write-guard-update");
  });

  it("upgrades the originally applied migration 23 without rewriting its checksum", () => {
    const db = new NodeNarrativeDatabase();
    databases.push(db);
    expect(db.migrate(MIGRATIONS_UP_TO_023)).toBe(23);
    const project = createProject({
      id: "migration-24-project",
      title: "迁移样本",
      premise: "旧正文检索段应由下一版迁移清理。",
      now: "2026-08-12T00:00:00.000Z",
    });
    new SqliteProjectRepository(db).insert(project);
    db.raw
      .prepare(
        `INSERT INTO text_segments(
          id, project_id, source_type, source_id, title, content, authority,
          metadata_json, created_at, updated_at
        ) VALUES (?, ?, 'document_version', ?, ?, ?, 'confirmed', '{}', ?, ?)`,
      )
      .run(
        "legacy-document-version",
        project.id,
        "legacy-version",
        "旧版本",
        "应被清理",
        project.createdAt,
        project.createdAt,
      );

    expect(db.migrate()).toBe(63);
    expect(
      db.raw
        .prepare(
          "SELECT COUNT(*) AS count FROM text_segments WHERE source_type = 'document_version'",
        )
        .get(),
    ).toEqual({ count: 0 });
  });

  it("repairs databases that applied the briefly mutated migration 23", () => {
    const db = new NodeNarrativeDatabase();
    databases.push(db);
    expect(db.migrate(MIGRATIONS_UP_TO_023)).toBe(23);
    db.raw
      .prepare("UPDATE schema_migrations SET checksum = ? WHERE version = 23")
      .run(MUTATED_MIGRATION_023_CHECKSUM);

    expect(db.migrate()).toBe(63);
    expect(
      db.raw
        .prepare("SELECT checksum FROM schema_migrations WHERE version = 23")
        .get(),
    ).toEqual({
      checksum:
        "b1f666c4425d817f593b39ca166e595fde19b8f67c11d066bfaf2d5e9fd2da66",
    });
  });

  it("converges the schema without legacy model selection tables or columns", () => {
    const db = database();
    const tables = db.raw
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'table' AND name IN (
           'model_profiles', 'model_routing_rules', 'run_model_snapshots',
           'model_assignment_snapshots'
         ) ORDER BY name`,
      )
      .all() as unknown as { name: string }[];
    expect(tables.map((row) => row.name)).toEqual([
      "model_assignment_snapshots",
    ]);
    const runColumns = db.raw
      .prepare("PRAGMA table_info(runs)")
      .all() as unknown as {
      name: string;
    }[];
    expect(runColumns.map((row) => row.name)).not.toContain("profile_id");
    const callColumns = db.raw
      .prepare("PRAGMA table_info(llm_calls)")
      .all() as unknown as { name: string }[];
    expect(callColumns.map((row) => row.name)).toContain("model_id");
    expect(callColumns.map((row) => row.name)).not.toContain("profile_id");
  });

  it("rolls back outer and nested transactions", () => {
    const db = database();
    expect(() =>
      db.transaction(() => {
        db.raw.exec("CREATE TABLE rollback_probe(id TEXT PRIMARY KEY) STRICT;");
        db.transaction(() => {
          db.raw.prepare("INSERT INTO rollback_probe(id) VALUES (?)").run("x");
        });
        throw new Error("rollback");
      }),
    ).toThrow("rollback");
    expect(
      db.raw
        .prepare(
          "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='rollback_probe'",
        )
        .get(),
    ).toEqual({ count: 0 });
  });

  it("rolls back an invalid foreign-keys-off migration before recording its version", () => {
    const db = new NodeNarrativeDatabase();
    databases.push(db);
    const foundation = {
      version: 1,
      name: "foreign-key-foundation",
      sql: `
        CREATE TABLE parent(id TEXT PRIMARY KEY) STRICT;
        CREATE TABLE child(
          id TEXT PRIMARY KEY,
          parent_id TEXT NOT NULL REFERENCES parent(id)
        ) STRICT;
        INSERT INTO parent(id) VALUES ('parent-1');
        INSERT INTO child(id, parent_id) VALUES ('child-1', 'parent-1');
      `,
    };
    const invalidRebuild = {
      version: 2,
      name: "invalid-parent-rebuild",
      foreignKeysOff: true,
      sql: `
        DROP TABLE parent;
        CREATE TABLE parent(id TEXT PRIMARY KEY) STRICT;
      `,
    };

    expect(db.migrate([foundation])).toBe(1);
    expect(() => db.migrate([foundation, invalidRebuild])).toThrow(
      /broke 1 foreign key references/,
    );

    expect(db.currentMigration()).toBe(1);
    expect(db.raw.prepare("SELECT * FROM parent").all()).toEqual([
      { id: "parent-1" },
    ]);
    expect(db.raw.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(db.raw.prepare("PRAGMA foreign_keys").get()).toEqual({
      foreign_keys: 1,
    });
  });
});

describe("repositories", () => {
  it("round-trips projects and validates phase updates in the domain", () => {
    const db = database();
    const projects = new SqliteProjectRepository(db);
    const created = createProject({
      id: "p-1",
      title: "潮汐灯塔",
      premise: "灯灭时，港口会遗忘一个人。",
      now: "2026-08-10T00:00:00.000Z",
    });
    projects.insert(created);
    expect(projects.get("p-1")).toEqual(created);
    projects.update(
      transitionProjectPhase(created, "foundation", "2026-08-10T00:01:00.000Z"),
    );
    expect(projects.get("p-1")?.phase).toBe("foundation");
  });

  it("persists versioned web-novel presets, book profiles, and chapter briefs", () => {
    const db = database();
    const projects = new SqliteProjectRepository(db);
    projects.insert(
      createProject({
        id: "p-web-novel",
        title: "潮汐灯塔",
        now: "2026-08-10T00:00:00.000Z",
      }),
    );
    db.raw
      .prepare(
        `INSERT INTO outline_nodes(
          id, project_id, parent_id, kind, path, depth, ordinal, title,
          summary, goal, conflict, outcome, pov_entity_id, story_time, status,
          metadata_json, created_at, updated_at
        ) VALUES (?, ?, NULL, 'chapter', ?, 0, 0, ?, NULL, NULL, NULL, NULL, NULL, NULL, 'planned', '{}', ?, ?)`,
      )
      .run(
        "outline-chapter-1",
        "p-web-novel",
        "1",
        "第一章",
        "2026-08-10T00:00:00.000Z",
        "2026-08-10T00:00:00.000Z",
      );

    const repository = new SqliteWebNovelRepository(db);
    const documents = new SqliteDocumentRepository(db);
    documents.insert({
      id: "document-chapter-1",
      projectId: "p-web-novel",
      kind: "chapter",
      title: "第一章",
      outlineNodeId: "outline-chapter-1",
      currentVersionId: null,
      archivedAt: null,
      createdAt: "2026-08-10T00:00:00.000Z",
      updatedAt: "2026-08-10T00:00:00.000Z",
    });
    const firstVersion = documents.appendVersion(
      "p-web-novel",
      "document-chapter-1",
      {
        id: "document-version-1",
        content: "第一版正文",
        source: "manual",
        expectedCurrentVersionId: null,
        now: "2026-08-10T00:01:30.000Z",
      },
    );
    const preset = repository.insertPreset({
      id: "preset-fast",
      projectId: null,
      name: "快节奏悬疑",
      genre: "都市悬疑",
      audience: "追更读者",
      promise: "每章都有新线索",
      pacing: "fast",
      targetWordsPerChapter: 3000,
      updateCadence: "日更",
      boundaries: ["不靠误会拖延"],
      checkRules: ["章尾必须留下问题"],
      defaultTemplate: null,
      now: "2026-08-10T00:00:00.000Z",
    });
    expect(repository.listPresets("p-web-novel")).toContainEqual(preset);

    const profile = repository.upsertBookProfile("p-web-novel", {
      presetId: preset.id,
      genre: preset.genre,
      audience: preset.audience,
      promise: preset.promise,
      tone: "克制",
      endingDirection: null,
      pov: "第三人称",
      updateCadence: preset.updateCadence,
      targetWordsPerChapter: preset.targetWordsPerChapter,
      boundaries: preset.boundaries,
      worldRules: ["潮汐会带走记忆"],
      arcNotes: [],
      expectedVersion: null,
      now: "2026-08-10T00:01:00.000Z",
    });
    expect(profile.version).toBe(0);
    expect(repository.getBookProfile("p-web-novel")?.worldRules).toEqual([
      "潮汐会带走记忆",
    ]);

    const brief = repository.upsertChapterBrief(
      "p-web-novel",
      "outline-chapter-1",
      {
        goal: "让主角发现第一条线索",
        conflict: "证人拒绝开口",
        payoff: "拿到一张旧船票",
        hook: "船票上的日期尚未到来",
        characterIds: [],
        foreshadowIds: [],
        timelineIds: [],
        targetWords: 3000,
        pacing: "fast",
        expectedVersion: null,
        now: "2026-08-10T00:02:00.000Z",
      },
    );
    expect(brief.outlineNodeId).toBe("outline-chapter-1");
    expect(brief.documentVersionId).toBe(firstVersion.id);
    const secondVersion = documents.appendVersion(
      "p-web-novel",
      "document-chapter-1",
      {
        id: "document-version-2",
        content: "第二版正文",
        source: "manual",
        expectedCurrentVersionId: firstVersion.id,
        now: "2026-08-10T00:02:30.000Z",
      },
    );
    const updatedBrief = repository.upsertChapterBrief(
      "p-web-novel",
      "outline-chapter-1",
      {
        ...brief,
        expectedVersion: 0,
        now: "2026-08-10T00:03:00.000Z",
      },
    );
    expect(updatedBrief.documentVersionId).toBe(secondVersion.id);
    expect(() =>
      repository.upsertChapterBrief("p-web-novel", "outline-chapter-1", {
        ...brief,
        expectedVersion: 0,
        now: "2026-08-10T00:04:00.000Z",
      }),
    ).toThrow(/updated elsewhere/u);
  });
});
