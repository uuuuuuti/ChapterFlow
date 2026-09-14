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
});
