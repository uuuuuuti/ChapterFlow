import {
  createProject,
  type KnowledgeCard,
  type OfficialSource,
} from "@narralume/domain";
import { afterEach, describe, expect, it } from "vitest";

import { NodeNarrativeDatabase } from "../src/node.js";
import {
  SqliteOfficialKnowledgeRepository,
  SqliteProjectRepository,
  SqliteSigningSprintRepository,
  SigningSprintPersistenceError,
} from "../src/index.js";

const now = "2026-09-15T00:00:00.000Z";
let database: NodeNarrativeDatabase;

afterEach(() => database?.close());

function setup(): void {
  database = new NodeNarrativeDatabase();
  database.migrate();
  new SqliteProjectRepository(database).insert(
    createProject({ id: "project-1", title: "潮汐灯塔", now }),
  );
}

describe("Signing Sprint persistence", () => {
  it("creates an idempotent workflow and protects accepted state with a version", () => {
    setup();
    const repository = new SqliteSigningSprintRepository(database);
    const workflow = repository.ensure("project-1", now);
    expect(workflow.version).toBe(0);
    expect(repository.ensure("project-1", now).id).toBe(workflow.id);

    const updated = repository.update(workflow.id, {
      expectedVersion: 0,
      currentStep: "positioning",
      completedSteps: ["direction"],
      state: {
        direction: {
          premise: "一个普通人被迫查清一场停电事故。",
          genre: "都市悬疑",
          audience: "喜欢快节奏解谜的读者",
          coreEmotion: "紧张",
          protagonistSeed: null,
          hook: null,
          differentiation: [],
        },
      },
      now,
    });
    expect(updated.version).toBe(1);
    expect(updated.state.direction?.genre).toBe("都市悬疑");
    expect(() =>
      repository.update(workflow.id, {
        expectedVersion: 0,
        currentStep: "story_engine",
        now,
      }),
    ).toThrow(SigningSprintPersistenceError);
  });

  it("keeps official source versions and knowledge cards separately addressable", () => {
    setup();
    const repository = new SqliteOfficialKnowledgeRepository(database);
    const source: OfficialSource = {
      id: "source-1",
      sourceKey: "fanqienovel.test",
      platform: "fanqienovel",
      url: "https://fanqienovel.com/writer/zone/notice",
      title: "官方公告索引",
      sourceType: "governance",
      publishedAt: null,
      retrievedAt: now,
      contentHash: "hash-v1",
      status: "ACTIVE",
      applicableStages: ["readiness"],
      applicableGenres: [],
      authorityType: "OFFICIAL_RULE",
      summary: "用于测试的官方来源。",
      sourceVersion: "v1",
      createdAt: now,
      updatedAt: now,
    };
    expect(repository.insertSource(source)).toEqual(source);
    expect(repository.insertSource(source)).toEqual(source);
    const card: KnowledgeCard = {
      id: "card-1",
      title: "以当前页面为准",
      principle: "规则发生变化时回到官方页面确认。",
      why: "避免把历史信息当成当前要求。",
      applicableStage: "readiness",
      applicableGenres: [],
      signals: ["来源版本"],
      antiPatterns: ["复制未经确认的旧规则"],
      suggestions: ["检查来源状态"],
      severity: "warning",
      sourceRefs: [
        {
          sourceId: source.id,
          sourceKey: source.sourceKey,
          sourceVersion: source.sourceVersion,
          title: source.title,
          url: source.url,
        },
      ],
      confidence: 0.9,
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    };
    expect(repository.insertCard(card)).toEqual(card);
    expect(repository.retrieve("readiness", null)).toHaveLength(1);
    expect(repository.requireCard("card-1").sourceRefs[0]?.sourceVersion).toBe(
      "v1",
    );
  });

  it("supersedes old source versions and filters knowledge by genre before limiting", () => {
    setup();
    const repository = new SqliteOfficialKnowledgeRepository(database);
    const v1 = source({
      id: "source-version-1",
      sourceKey: "fanqienovel.versioned",
      sourceVersion: "v1",
      status: "ACTIVE",
      retrievedAt: now,
    });
    const v2 = source({
      id: "source-version-2",
      sourceKey: "fanqienovel.versioned",
      sourceVersion: "v2",
      status: "CANDIDATE",
      retrievedAt: "2026-09-15T00:00:01.000Z",
    });
    repository.insertSource(v1);
    repository.insertSource(v2);
    repository.insertCard(card("card-version-1", v1, []));
    expect(repository.retrieve("readiness", null)).toHaveLength(1);

    repository.activateSource(v2.id, "2026-09-15T00:00:02.000Z");
    expect(repository.getSource(v1.id)?.status).toBe("SUPERSEDED");
    expect(repository.getSource(v2.id)?.status).toBe("ACTIVE");
    expect(repository.retrieve("readiness", null)).toHaveLength(0);

    repository.insertCard(card("card-version-2", v2, []));
    expect(repository.retrieve("readiness", null)).toEqual([
      expect.objectContaining({ id: "card-version-2" }),
    ]);
    repository.disableSource(v2.id, "2026-09-15T00:00:03.000Z");
    expect(repository.retrieve("readiness", null)).toHaveLength(0);
    expect(() => repository.requireCard("missing-card")).toThrow();
  });

  it("returns only source-backed cards and applies genre filters before the limit", () => {
    setup();
    const repository = new SqliteOfficialKnowledgeRepository(database);
    const official = source({
      id: "source-genre",
      sourceKey: "fanqienovel.genre-filter",
      sourceVersion: "v1",
      status: "ACTIVE",
    });
    repository.insertSource(official);
    repository.insertCard(
      card("card-female", official, ["女频"], "2026-09-15T00:00:03.000Z"),
    );
    repository.insertCard(
      card("card-male", official, ["男频"], "2026-09-15T00:00:02.000Z"),
    );
    repository.insertCard({
      ...card("card-missing-source", official, [], "2026-09-15T00:00:01.000Z"),
      sourceRefs: [
        {
          ...card("card-missing-source", official, []).sourceRefs[0]!,
          sourceId: "source-does-not-exist",
        },
      ],
    });

    expect(
      repository.listCards({
        stage: "readiness",
        genre: "男频",
        status: "ACTIVE",
        limit: 1,
      }),
    ).toEqual([expect.objectContaining({ id: "card-male" })]);
    expect(repository.retrieve("readiness", "男频", 10)).toEqual([
      expect.objectContaining({ id: "card-male" }),
    ]);
  });
});

function source(overrides: Partial<OfficialSource> = {}): OfficialSource {
  return {
    id: "source-default",
    sourceKey: "fanqienovel.test",
    platform: "fanqienovel",
    url: "https://fanqienovel.com/writer/zone/notice",
    title: "官方公告索引",
    sourceType: "governance",
    publishedAt: null,
    retrievedAt: now,
    contentHash: "hash-v1",
    status: "ACTIVE",
    applicableStages: ["readiness"],
    applicableGenres: [],
    authorityType: "OFFICIAL_RULE",
    summary: "用于测试的官方来源。",
    sourceVersion: "v1",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function card(
  id: string,
  official: OfficialSource,
  applicableGenres: string[],
  updatedAt = now,
): KnowledgeCard {
  return {
    id,
    title: id,
    principle: "以当前官方来源为准。",
    why: "避免使用失效来源。",
    applicableStage: "readiness",
    applicableGenres,
    signals: ["来源版本"],
    antiPatterns: ["伪造平台规则"],
    suggestions: ["打开官方页面核对"],
    severity: "warning",
    sourceRefs: [
      {
        sourceId: official.id,
        sourceKey: official.sourceKey,
        sourceVersion: official.sourceVersion,
        title: official.title,
        url: official.url,
      },
    ],
    confidence: 0.9,
    status: "ACTIVE",
    createdAt: now,
    updatedAt,
  };
}
