import { randomUUID } from "node:crypto";

import type { NarrativeModelClient } from "@narralume/narrative";
import type { SigningSprintCandidate } from "@narralume/domain";
import type { SigningSprintTask } from "@narralume/contracts";
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
    const cardId = cards.json()[0].id as string;
    const disabledCard = await app.inject({
      method: "POST",
      url: `/api/official-knowledge/cards/${cardId}/disable`,
      payload: {},
    });
    expect(disabledCard.statusCode, disabledCard.body).toBe(200);
    expect(disabledCard.json().status).toBe("DISABLED");
    const enabledCard = await app.inject({
      method: "POST",
      url: `/api/official-knowledge/cards/${cardId}/activate`,
      payload: {},
    });
    expect(enabledCard.statusCode, enabledCard.body).toBe(200);
    expect(enabledCard.json().status).toBe("ACTIVE");
    const signingSources = await app.inject({
      method: "GET",
      url: "/api/official-knowledge/sources?sourceType=signing",
    });
    expect(signingSources.statusCode, signingSources.body).toBe(200);
    expect(signingSources.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceType: "signing" }),
      ]),
    );
    const invalidVersion = await app.inject({
      method: "POST",
      url: `/api/official-knowledge/sources/${sources.json()[0].id}/versions`,
      payload: {
        url: "https://example.com/not-official",
        title: "伪造来源",
        sourceType: "help",
        publishedAt: null,
        retrievedAt: new Date().toISOString(),
        contentHash: "0".repeat(64),
        applicableStages: ["readiness"],
        applicableGenres: [],
        authorityType: "OFFICIAL_GUIDANCE",
        summary: "不应写入的来源",
        sourceVersion: "test-invalid-url",
      },
    });
    expect(invalidVersion.statusCode, invalidVersion.body).toBe(422);

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
          storyEngine: {
            protagonist: "林修复师",
            relationships: ["与失踪者留下的未来留言互相牵引"],
            antagonist: "篡改留言的人",
            mechanism: "旧书会显出七秒后的文字",
            worldRules: ["每次读取都会丢失一段近期记忆"],
            conflict: "必须在记忆消失前找到留言来源",
          },
          packaging: [
            {
              title: "七秒留言",
              titleDirection: "限时悬疑",
              description: "修复师追查来自未来的留言，代价是失去自己的记忆。",
              genre: "都市悬疑",
              tags: ["都市", "悬疑"],
              tagline: "每条留言都比真相早七秒",
              coverBrief: null,
              rationale: "把机制和限时感放进包装。",
            },
          ],
          selectedPackagingId: "0",
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
    expect(bible.json().intent).toMatchObject({
      currentFocus: expect.stringContaining("林修复师"),
    });
    expect(bible.json().entities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "林修复师",
          attributes: expect.objectContaining({
            signingSprintRole: "protagonist",
          }),
        }),
        expect.objectContaining({
          name: "篡改留言的人",
          attributes: expect.objectContaining({
            signingSprintRole: "antagonist",
          }),
        }),
      ]),
    );
    const profile = await app.inject({
      method: "GET",
      url: `/api/projects/${projectId}/book-profile`,
    });
    expect(profile.statusCode, profile.body).toBe(200);
    expect(profile.json()).toMatchObject({
      genre: "都市悬疑",
      audience: "喜欢快节奏推理的读者",
      worldRules: ["每次读取都会丢失一段近期记忆"],
    });
    const firstChapter = bible
      .json()
      .outline.find(
        (node: {
          kind: string;
          metadata: { signingSprintChapterIndex?: number };
        }) =>
          node.kind === "chapter" &&
          node.metadata.signingSprintChapterIndex === 1,
      );
    const firstChapterDocument = bible
      .json()
      .documents.find(
        (document: { outlineNodeId: string | null }) =>
          document.outlineNodeId === firstChapter?.id,
      );
    const manuscript = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/documents/${firstChapterDocument?.id}/versions`,
      payload: {
        content: "林修复师推开旧书店的门。\n\n‘你会在七秒后看见真相。’",
        source: "manual",
        expectedCurrentVersionId: null,
      },
    });
    expect(manuscript.statusCode, manuscript.body).toBe(201);
    const brief = await app.inject({
      method: "GET",
      url: `/api/projects/${projectId}/chapter-briefs/${firstChapter?.id}`,
    });
    expect(brief.statusCode, brief.body).toBe(200);
    expect(brief.json()).toMatchObject({
      purpose: "setup",
      readerPromiseOperations: [expect.objectContaining({ action: "OPEN" })],
    });
    const promises = await app.inject({
      method: "GET",
      url: `/api/projects/${projectId}/reader-promises`,
    });
    expect(promises.statusCode, promises.body).toBe(200);
    expect(promises.json().promises).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: "每章揭开一层时间谜团" }),
      ]),
    );

    const opening = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/signing-sprint/opening-check`,
    });
    expect(opening.statusCode, opening.body).toBe(200);
    expect(opening.json()).toMatchObject({
      report: {
        analyzedChapterCount: 1,
        metrics: { characterCount: expect.any(Number) },
        signals: expect.arrayContaining([
          expect.objectContaining({
            code: "dialogue_ratio",
            locations: ["第 1 段"],
          }),
        ]),
      },
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

  it("runs every structured sprint task as a candidate before durable acceptance", async () => {
    const database = new NodeNarrativeDatabase();
    const app = await buildApp({
      config,
      database,
      environment: {
        NARRATIVE_LLM_API_KEY: "server-only-test-key",
        NARRATIVE_LLM_BASE_URL: "https://api.example.com/v1",
        NARRATIVE_LLM_MODEL: "test-model",
      },
      narrativeModelClient: signingSprintModel(),
      enableRunWorker: false,
      logger: false,
    });
    resources.push({ app, database });

    const created = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: {
        requestId: randomUUID(),
        title: "七秒回声",
        premise: "落魄刑警能听见死者最后七秒的声音。",
      },
    });
    expect(created.statusCode, created.body).toBe(201);
    const projectId = created.json().id as string;

    const start = async (task: SigningSprintTask) => {
      const response = await app.inject({
        method: "POST",
        url: `/api/projects/${projectId}/signing-sprint/ai`,
        payload: {
          requestId: randomUUID(),
          task,
          instruction: "返回一份可审阅的结构化候选。",
          policy: {},
        },
      });
      expect(response.statusCode, response.body).toBe(202);
      const runId = response.json().runId as string;
      await finishRun(app, projectId, runId);
      const candidates = await app.inject({
        method: "GET",
        url: `/api/projects/${projectId}/signing-sprint/candidates?task=${task}`,
      });
      expect(candidates.statusCode, candidates.body).toBe(200);
      const candidate = (candidates.json() as SigningSprintCandidate[]).find(
        (item) => item.provenance.runId === runId,
      );
      expect(candidate, candidates.body).toBeTruthy();
      expect(candidate?.provenance.sourceRefs.length).toBeGreaterThan(0);
      return candidate!;
    };

    const accept = async (
      candidate: SigningSprintCandidate,
      selectedPackagingIndex?: number,
    ) => {
      const current = await app.inject({
        method: "GET",
        url: `/api/projects/${projectId}/signing-sprint`,
      });
      expect(current.statusCode, current.body).toBe(200);
      const response = await app.inject({
        method: "POST",
        url: `/api/projects/${projectId}/signing-sprint/candidates/${candidate.id}/decision`,
        payload: {
          action: "accept",
          expectedWorkflowVersion: current.json().workflow.version,
          ...(selectedPackagingIndex === undefined
            ? {}
            : { selectedPackagingIndex }),
        },
      });
      expect(response.statusCode, response.body).toBe(200);
      expect(response.json().candidate.status).toBe("accepted");
      return response.json().workflow;
    };

    await accept(await start("BrainstormBookDirection"));
    await accept(await start("RefineBookPositioning"));
    await accept(await start("EvaluatePositioning"));

    const generatedEngine = await start("GenerateStoryEngine");
    const engineWorkflow = await accept(generatedEngine);
    expect(engineWorkflow.state.storyEngine).toMatchObject({
      protagonist: "沈砚，落魄刑警",
      conflict: "必须用记忆换取真相",
    });

    const beforeEngine = await app.inject({
      method: "GET",
      url: `/api/projects/${projectId}/signing-sprint`,
    });
    const engine = await app.inject({
      method: "PATCH",
      url: `/api/projects/${projectId}/signing-sprint`,
      payload: {
        expectedVersion: beforeEngine.json().workflow.version,
        currentStep: "packaging",
        completedSteps: ["direction", "positioning", "story_engine"],
        state: {
          storyEngine: {
            protagonist: "沈砚，落魄刑警",
            relationships: ["与姐姐旧案相关的证人"],
            antagonist: "篡改声音记录的人",
            mechanism: "听见死者最后七秒",
            worldRules: ["每次使用能力都会丢失一段近期记忆"],
            conflict: "必须在记忆消失前查清姐姐旧案",
          },
        },
      },
    });
    expect(engine.statusCode, engine.body).toBe(200);

    const generatedPackaging = await start("GenerateBookPackaging");
    const selectedPackaging = await accept(generatedPackaging, 1);
    expect(selectedPackaging.state.selectedPackagingId).toBe("1");
    const afterPackaging = await app.inject({
      method: "GET",
      url: `/api/projects/${projectId}/signing-sprint`,
    });
    expect(afterPackaging.statusCode, afterPackaging.body).toBe(200);
    expect(afterPackaging.json().workflow.state.selectedPackagingId).toBe("1");

    await accept(await start("EvaluateBookPackaging"));
    await accept(await start("GenerateOpeningBlueprint"));
    const afterOpening = await app.inject({
      method: "GET",
      url: `/api/projects/${projectId}/signing-sprint`,
    });
    expect(afterOpening.json().workflow.state.openingBlueprint).toBeTruthy();
    expect(
      afterOpening.json().workflow.state.openingBlueprint.firstThreeChapters,
    ).toHaveLength(3);

    await accept(await start("EvaluateOpening"));
    const intentCandidate = await start("GenerateChapterFromIntent");
    expect(intentCandidate.payload).toMatchObject({
      goal: "找到第一条声音的来源",
    });
    const acceptedIntentWorkflow = await accept(intentCandidate);
    expect(acceptedIntentWorkflow.currentStep).toBe("readiness");
    const story = await app.inject({
      method: "GET",
      url: `/api/projects/${projectId}/story-bible`,
    });
    expect(story.statusCode, story.body).toBe(200);
    const firstChapter = story
      .json()
      .outline.find(
        (node: { kind: string; metadata: { createdWith?: string } }) =>
          node.kind === "chapter" &&
          node.metadata.createdWith === "signing-sprint",
      );
    expect(firstChapter).toBeTruthy();
    const brief = await app.inject({
      method: "GET",
      url: `/api/projects/${projectId}/chapter-briefs/${firstChapter.id}`,
    });
    expect(brief.statusCode, brief.body).toBe(200);
    expect(brief.json()).toMatchObject({ goal: "找到第一条声音的来源" });

    const readinessCandidate = await start("SigningReadinessReview");
    await accept(readinessCandidate);
    const final = await app.inject({
      method: "GET",
      url: `/api/projects/${projectId}/signing-sprint`,
    });
    expect(final.statusCode, final.body).toBe(200);
    expect(final.json().workflow.state.readiness.checks).toMatchObject({
      openingQuality: "needs_attention",
    });
  });
});

function signingSprintModel(): NarrativeModelClient {
  return {
    async text() {
      throw new Error("Signing Sprint uses structured output");
    },
    async structured(_run, _step, purpose, request, _contract, validate) {
      if (purpose !== "signing-sprint")
        throw new Error(`unexpected purpose ${purpose}`);
      const content = request.messages[0]?.content;
      const packet = JSON.parse(
        typeof content === "string" ? content : JSON.stringify(content),
      ) as { task: SigningSprintTask };
      const value = {
        task: packet.task,
        summary: "结构化测试候选",
        rationale: "用于验证候选、来源和接受边界。",
        payload: signingSprintPayload(packet.task),
      };
      const checked = validate(value);
      if (!checked.success) throw new Error(checked.issues.join("; "));
      return {
        value: checked.data,
        usage: {
          inputTokens: 100,
          outputTokens: 100,
          calls: 1,
          costUsd: 0,
          wallTimeMs: 1,
        },
        mode: "native",
        attempts: 1,
      };
    },
  } as NarrativeModelClient;
}

function signingSprintPayload(
  task: SigningSprintTask,
): Record<string, unknown> {
  if (task === "BrainstormBookDirection") {
    return {
      premise: "落魄刑警能听见死者最后七秒的声音。",
      genre: "都市脑洞",
      audience: "喜欢悬疑反转的男频读者",
      coreEmotion: "悬疑、反转、成长和爽感",
      protagonistSeed: "沈砚，落魄刑警",
      hook: "姐姐死亡现场留下了不属于过去的声音",
      differentiation: ["声音线索会付出记忆代价"],
    };
  }
  if (task === "RefineBookPositioning") {
    return {
      oneLineStory: "落魄刑警用死者最后七秒的声音追查姐姐旧案。",
      coreIdea: "每个声音线索都能逼近真相，也会带走主角一段记忆。",
      sellingPoints: ["七秒声音机制", "案件反转", "记忆代价"],
      emotionalPayoff: "查案反转中的紧张、成长和阶段性爽感",
      readerProfile: "喜欢都市脑洞、悬疑反转和成长线的读者",
      protagonistDesire: "查清姐姐死亡真相",
      obstacle: "篡改声音记录的人和逐渐消失的记忆",
      mechanism: "听见死者最后七秒",
      coreConflict: "主角必须用记忆换取真相",
      longTermExpectation: "姐姐旧案最终指向主角隐瞒的选择",
      sustainability: {
        shortTermAppeal: "每案都有即时声音谜面",
        midTermExpansion: "不同案件逐步连接成声音网络",
        longTermSpace: "主角的记忆缺口与旧案形成终局",
      },
      riskNotes: [],
    };
  }
  if (task === "GenerateStoryEngine") {
    return {
      protagonist: "沈砚，落魄刑警",
      relationships: ["与姐姐旧案相关的证人"],
      antagonist: "篡改声音记录的人",
      mechanism: "听见死者最后七秒",
      worldRules: ["每次使用能力都会丢失一段近期记忆"],
      conflict: "必须用记忆换取真相",
    };
  }
  if (task === "GenerateBookPackaging") {
    return {
      candidates: [1, 2, 3].map((index) => ({
        title: ["七秒回声", "死者留声", "记忆盲区"][index - 1]!,
        titleDirection: `声音悬疑方向 ${index}`,
        description:
          "落魄刑警用死者最后七秒的声音追查姐姐旧案，每次靠近真相都会失去一段记忆。",
        genre: "都市脑洞",
        tags: ["都市", "悬疑", "脑洞"],
        tagline: "真相只比记忆多活七秒",
        coverBrief: "城市夜色、声波和旧案档案",
        rationale: "让书名和简介直接承接声音机制与记忆代价。",
      })),
    };
  }
  if (task === "GenerateOpeningBlueprint") {
    const chapter = (index: number) => ({
      index,
      title: `回声现场 ${index}`,
      purpose: index === 1 ? "setup" : index === 3 ? "payoff" : "progress",
      protagonistAction:
        index === 1 ? "沈砚赶到姐姐旧案现场" : "沈砚追查新的声音线索",
      conflict: "篡改记录的人正在抹掉下一条线索",
      readerExpectation: "沈砚能否在记忆消失前听清真相？",
      emotionTarget: "紧张",
      hook: "录音里出现了明天才会发生的声音",
      payoff: "确认一条新线索并扩大姐姐旧案",
      targetWords: 2_500,
    });
    const chapters = [1, 2, 3].map(chapter);
    return {
      readerPromise: "每一章都揭开一段声音谜团，并付出记忆代价。",
      openingHook: "姐姐的死亡录音里出现了明天的脚步声。",
      expectation: "主角能否在记忆缺口扩大前追到声音来源？",
      informationRevealPlan: ["先听见异常", "再确认代价", "最后锁定旧案关联"],
      firstThreeChapters: chapters,
      firstArcTitle: "追查七秒回声",
      firstArcGoal: "找到改写声音记录的人",
      firstArcConflict: "每次使用能力都会失去记忆",
      firstArcPayoff: "确认姐姐旧案与声音网络有关",
      firstArcChapters: chapters,
      riskNotes: [],
    };
  }
  if (task === "EvaluateOpening") {
    return {
      summary: "开篇已经有明确异常，但还需回看第一章的行动密度。",
      strengths: ["声音机制有记忆代价", "章尾留下了可追踪问题"],
      issues: [
        {
          code: "opening.action_late",
          title: "核心异常出现得偏晚",
          problem: "第一章前几段仍在交代背景。",
          impact: "读者需要更久才抓住声音机制。",
          suggestion: "把异常录音提前到现场动作中。",
          locations: ["第 1 章 · 第 1—3 段"],
          evidence: ["开篇检查：连续解释段"],
          source: "chapterflow",
          sourceRefs: [],
        },
      ],
      officialMatches: ["官方开篇课程建议回看期待感"],
    };
  }
  if (task === "SigningReadinessReview") {
    return {
      status: "needs_attention",
      headline: "建议先处理若干问题",
      issues: [],
      checks: {
        metadata: "ready",
        content: "needs_attention",
        openingQuality: "needs_attention",
        consistency: "ready",
        officialMatching: "ready",
        technicalSafety: "ready",
      },
      generatedAt: "2026-09-15T00:00:00.000Z",
    };
  }
  if (task === "GenerateChapterFromIntent") {
    return {
      purpose: "setup",
      readerExpectation: "沈砚能否听清第一条声音？",
      goal: "找到第一条声音的来源",
      conflict: "声音即将被人为抹除",
      payoff: "确认声音和姐姐旧案有关",
      hook: "声音里喊出了沈砚自己的名字",
      targetWords: 2_500,
      pacing: "fast",
    };
  }
  return {
    strengths: ["目标清楚"],
    concerns: ["还需补充场景证据"],
    suggestions: ["把机制落到第一章行动"],
    officialMatches: ["官方课程来源"],
  };
}

async function finishRun(
  app: Awaited<ReturnType<typeof buildApp>>,
  projectId: string,
  runId: string,
): Promise<void> {
  for (let index = 0; index < 8; index += 1) {
    const response = await app.inject({
      method: "POST",
      url: `/api/runs/${runId}/advance`,
      payload: { projectId },
    });
    expect(response.statusCode, response.body).toBe(200);
    const status = response.json().snapshot.run.status as string;
    if (status === "completed") return;
    if (["failed", "cancelled"].includes(status))
      throw new Error(response.body);
  }
  throw new Error("signing sprint run did not complete");
}
