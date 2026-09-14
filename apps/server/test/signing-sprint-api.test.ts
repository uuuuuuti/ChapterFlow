import { randomUUID } from "node:crypto";

import type { SigningSprintCandidate } from "@narralume/domain";
import { SqliteSigningSprintRepository } from "@narralume/persistence";
import { NodeNarrativeDatabase } from "@narralume/persistence/node";
import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import type { ServerConfig } from "../src/config.js";

const config: ServerConfig = {
  dataDirectory: ".",
  databasePath: ":memory:",
  host: "127.0.0.1",
  port: 4317,
  environment: "test",
};

const resources: {
  app: Awaited<ReturnType<typeof buildApp>>;
  database: NodeNarrativeDatabase;
}[] = [];

afterEach(async () => {
  while (resources.length > 0) {
    const resource = resources.pop();
    await resource?.app.close();
    resource?.database.close();
  }
});

describe("Signing Sprint API", () => {
  it("supports a blank entry point, official references, signal checks, and readiness review", async () => {
    const database = new NodeNarrativeDatabase();
    const app = await buildApp({
      config,
      database,
      environment: {},
      enableRunWorker: false,
      logger: false,
    });
    resources.push({ app, database });

    const created = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { requestId: randomUUID(), title: "未命名作品", premise: null },
    });
    expect(created.statusCode, created.body).toBe(201);
    const projectId = created.json().id as string;

    const initial = await app.inject({
      method: "GET",
      url: `/api/projects/${projectId}/signing-sprint`,
    });
    expect(initial.statusCode, initial.body).toBe(200);
    expect(initial.json()).toMatchObject({
      workflow: {
        version: 0,
        state: { direction: null },
      },
      knowledge: expect.any(Array),
    });

    const sources = await app.inject({
      method: "GET",
      url: "/api/official-knowledge/sources?status=ACTIVE",
    });
    const cards = await app.inject({
      method: "GET",
      url: "/api/official-knowledge/cards?stage=opening",
    });
    expect(sources.statusCode, sources.body).toBe(200);
    expect(sources.json()).toHaveLength(11);
    expect(cards.statusCode, cards.body).toBe(200);
    expect(cards.json().length).toBeGreaterThan(0);
    expect(cards.json()[0].sourceRefs[0].url).toContain("fanqienovel.com");

    const started = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/signing-sprint`,
      payload: {
        premise: "一名修复师在旧书中发现来自未来的留言。",
        genre: "都市悬疑",
        audience: "喜欢快节奏推理的读者",
        coreEmotion: "紧张",
      },
    });
    expect(started.statusCode, started.body).toBe(200);
    expect(started.json().workflow).toMatchObject({
      version: 1,
      state: { direction: { genre: "都市悬疑" } },
    });

    const stale = await app.inject({
      method: "PATCH",
      url: `/api/projects/${projectId}/signing-sprint`,
      payload: { expectedVersion: 0, currentStep: "positioning" },
    });
    expect(stale.statusCode, stale.body).toBe(409);

    const sprintWorkflow = started.json().workflow as {
      id: string;
      version: number;
    };
    const candidate: SigningSprintCandidate = {
      id: "candidate-1",
      workflowId: sprintWorkflow.id,
      projectId,
      task: "BrainstormBookDirection",
      status: "candidate",
      payload: {
        premise: "一名修复师在旧书中发现来自未来的留言。",
        genre: "都市悬疑",
        audience: "喜欢快节奏推理的读者",
        coreEmotion: "紧张",
        protagonistSeed: null,
        hook: "留言来自明天",
        differentiation: [],
      },
      rationale: "保留作者原始想法并收紧方向。",
      provenance: { kind: "model", sourceRefs: [], runId: "run-1" },
      baseWorkflowVersion: sprintWorkflow.version,
      createdAt: "2026-09-15T00:00:00.000Z",
      decidedAt: null,
    };
    new SqliteSigningSprintRepository(database).insertCandidate(candidate);
    const accepted = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/signing-sprint/candidates/${candidate.id}/decision`,
      payload: {
        action: "accept",
        expectedWorkflowVersion: sprintWorkflow.version,
      },
    });
    expect(accepted.statusCode, accepted.body).toBe(200);
    expect(accepted.json()).toMatchObject({
      workflow: { version: 2, state: { direction: { hook: "留言来自明天" } } },
      candidate: { status: "accepted" },
    });
    const decidedAgain = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/signing-sprint/candidates/${candidate.id}/decision`,
      payload: { action: "reject", expectedWorkflowVersion: 2 },
    });
    expect(decidedAgain.statusCode, decidedAgain.body).toBe(409);

    const chapter = (index: number) => ({
      index,
      title: `第${index}章`,
      purpose: index === 1 ? "setup" : "progress",
      protagonistAction: "主角推进第一阶段目标",
      conflict: "新的阻力迫使主角做出选择",
      readerExpectation: "主角能否完成下一步目标？",
      emotionTarget: "紧张",
      hook: "留下一个需要追问的问题",
      payoff: "推进目标并制造新的变化",
      targetWords: null,
    });
    const firstArcChapters = Array.from({ length: 12 }, (_, index) =>
      chapter(index + 1),
    );
    const planned = await app.inject({
      method: "PATCH",
      url: `/api/projects/${projectId}/signing-sprint`,
      payload: {
        expectedVersion: 2,
        currentStep: "writing",
        completedSteps: ["direction", "opening"],
        state: {
          openingBlueprint: {
            readerPromise: "每章揭开一层时间谜团",
            openingHook: "旧书里出现了明天的日期",
            expectation: "主角能否找到留言来源？",
            informationRevealPlan: ["先发现留言", "再确认来源"],
            firstThreeChapters: firstArcChapters.slice(0, 3),
            firstArcTitle: "追查留言来源",
            firstArcGoal: "找到第一条留言的寄出者",
            firstArcConflict: "每次查证都会丢失一段记忆",
            firstArcPayoff: "确认留言来自未来的主角",
            firstArcChapters,
            riskNotes: [],
          },
        },
      },
    });
    expect(planned.statusCode, planned.body).toBe(200);
    expect(
      planned.json().workflow.state.openingBlueprint.firstArcChapters,
    ).toHaveLength(12);
    const bible = await app.inject({
      method: "GET",
      url: `/api/projects/${projectId}/story-bible`,
    });
    expect(bible.statusCode, bible.body).toBe(200);
    expect(
      bible
        .json()
        .outline.filter((node: { kind: string }) => node.kind === "chapter"),
    ).toHaveLength(12);

    const opening = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/signing-sprint/opening-check`,
    });
    expect(opening.statusCode, opening.body).toBe(200);
    expect(opening.json()).toMatchObject({
      report: { analyzedChapterCount: 3, metrics: { characterCount: 0 } },
    });

    const readiness = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/signing-sprint/readiness`,
    });
    expect(readiness.statusCode, readiness.body).toBe(200);
    expect(readiness.json().report).toMatchObject({
      status: "needs_attention",
      checks: { officialMatching: "ready" },
    });
    expect(JSON.stringify(readiness.json())).not.toMatch(/概率|评分|分数/u);
  });
});
