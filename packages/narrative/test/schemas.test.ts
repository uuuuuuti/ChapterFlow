import { describe, expect, it } from "vitest";

import {
  SIGNING_SPRINT_MODEL_CONTRACT,
  SigningSprintModelResultSchema,
} from "../src/signing-sprint-schemas.js";
import {
  GroundedSettlementSchema,
  SETTLEMENT_CONTRACT,
  SettlementSchema,
  zodValidator,
} from "../src/schemas.js";
import {
  CHAPTER_INTENT_PLAN_CONTRACT,
  ChapterIntentPlanSchema,
  webNovelCandidateModelValidator,
} from "../src/web-novel-candidate-schemas.js";

const baseFact = {
  operation: "assert" as const,
  factId: null,
  subjectId: "hero",
  predicate: "目击",
  knowledgeScope: "character" as const,
  knowledgeSubjectId: "hero",
  belief: "known" as const,
  evidenceParagraphs: [1],
};

describe("chapter settlement fact object contract", () => {
  it("accepts entity objects, scalar values, and object-free withdrawals", () => {
    const result = SettlementSchema.safeParse(
      settlement([
        { ...baseFact, objectEntityId: "witness", value: null },
        {
          ...baseFact,
          predicate: "记忆状态",
          objectEntityId: null,
          value: "模糊",
        },
        {
          ...baseFact,
          operation: "withdraw",
          factId: "fact-1",
          objectEntityId: null,
          value: null,
        },
      ]),
    );

    expect(result.success).toBe(true);
  });

  it("rejects an entity object combined with a scalar value", () => {
    const result = zodValidator(SettlementSchema)(
      settlement([{ ...baseFact, objectEntityId: "witness", value: true }]),
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toContain(
      "factCandidates.0.value: 已填写 objectEntityId 时 value 必须为 null",
    );
    expect(result.issues[0]).toContain("不要额外填写布尔值或字符串 true");
  });

  it("requires assert and supersede to provide one non-null object", () => {
    const result = SettlementSchema.safeParse(
      settlement([{ ...baseFact, objectEntityId: null, value: null }]),
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]).toMatchObject({
      path: ["factCandidates", 0, "value"],
      message: expect.stringContaining(
        "必须填写 objectEntityId 或非 null value",
      ),
    });
  });

  it("rejects payload fields on withdrawals, including grounded artifacts", () => {
    const invalidFacts = [
      {
        ...baseFact,
        operation: "withdraw" as const,
        factId: "fact-1",
        objectEntityId: "witness",
        value: null,
      },
      {
        ...baseFact,
        operation: "withdraw" as const,
        factId: "fact-1",
        objectEntityId: null,
        value: "旧值",
      },
    ];
    const groundedResult = GroundedSettlementSchema.safeParse(
      settlement([
        {
          ...invalidFacts[0],
          evidence: [groundedEvidence("撤回旧事实")],
        },
      ]),
    );

    for (const fact of invalidFacts) {
      expect(SettlementSchema.safeParse(settlement([fact])).success).toBe(
        false,
      );
    }
    expect(groundedResult.success).toBe(false);
  });

  it("publishes the same three object variants in the model JSON schema", () => {
    const schema = SETTLEMENT_CONTRACT.schema as {
      properties: {
        factCandidates: {
          items: {
            anyOf: Array<{
              additionalProperties: boolean;
              required: string[];
              properties: {
                operation: { enum: string[] };
                objectEntityId: { type: string | string[] };
                value: { type: string | string[] };
              };
            }>;
          };
        };
      };
    };
    const branches = schema.properties.factCandidates.items.anyOf;

    expect(branches).toHaveLength(3);
    expect(
      branches.every(
        (branch) =>
          branch.additionalProperties === false &&
          branch.required.includes("objectEntityId") &&
          branch.required.includes("value"),
      ),
    ).toBe(true);
    expect(branches.map((branch) => branch.properties.operation.enum)).toEqual([
      ["assert", "supersede"],
      ["assert", "supersede"],
      ["withdraw"],
    ]);
    expect(branches[0]?.properties).toMatchObject({
      objectEntityId: { type: "string" },
      value: { type: "null" },
    });
    expect(branches[1]?.properties).toMatchObject({
      objectEntityId: { type: "null" },
      value: { type: ["string", "number", "boolean"] },
    });
    expect(branches[2]?.properties).toMatchObject({
      objectEntityId: { type: "null" },
      value: { type: "null" },
    });
  });
});

describe("Chapter Intent candidate contract", () => {
  it("accepts structured intent fields and exposes them to the model contract", () => {
    const plan = ChapterIntentPlanSchema.parse({
      purpose: "turning_point",
      readerExpectation: "主角终于会看见真相的一角",
      emotionTarget: "紧张",
      emotionCurve: [{ label: "逼近", intensity: 4 }],
      readerPromiseOperations: [
        {
          action: "OPEN",
          promiseId: null,
          title: "船票上的未来日期",
          note: "下一章核对日期",
        },
      ],
      payoffStrength: 4,
      hookType: "question",
      hookStrength: 5,
      informationGain: 3,
      endingPull: 5,
      sceneStructure: [
        {
          order: 1,
          purpose: "conflict",
          beat: "证人改口",
          payoff: "留下矛盾证词",
        },
      ],
    });

    expect(plan).toMatchObject({
      purpose: "turning_point",
      readerPromiseOperations: [expect.objectContaining({ action: "OPEN" })],
    });
    expect(CHAPTER_INTENT_PLAN_CONTRACT.schema).toMatchObject({
      additionalProperties: false,
      properties: expect.objectContaining({
        readerPromiseOperations: expect.any(Object),
        sceneStructure: expect.any(Object),
      }),
    });
  });

  it("rejects lifecycle operations that do not identify their promise", () => {
    const validator = webNovelCandidateModelValidator("brief", {
      reader_promise: ["promise-1"],
    });
    const result = validator({
      summary: "补充章节推进",
      items: [
        {
          operation: "update",
          title: "推进旧线索",
          rationale: "本章需要给出可见进展",
          impact: ["减少悬置"],
          evidence: [],
          afterJson: JSON.stringify({
            readerPromiseOperations: [
              {
                action: "ADVANCE",
                promiseId: null,
                title: null,
                note: "找到一半证据",
              },
            ],
          }),
          requiresLockedConfirmation: false,
        },
      ],
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.issues.join("\n")).toContain("promiseId");
  });
});

describe("Signing Sprint structured candidate contract", () => {
  it("accepts the complete positioning, packaging, opening, review, and readiness shapes", () => {
    const payloads: Record<string, Record<string, unknown>> = {
      RefineBookPositioning: positioningPayload(),
      GenerateBookPackaging: {
        candidates: [1, 2, 3].map((index) => packagingPayload(index)),
      },
      GenerateOpeningBlueprint: openingPayload(),
      EvaluateOpening: {
        summary: "开篇已形成可追踪的异常和冲突。",
        strengths: ["核心机制出现得早"],
        issues: [],
        officialMatches: ["官方开篇课程来源"],
      },
      SigningReadinessReview: {
        status: "needs_attention",
        headline: "建议先处理若干问题",
        issues: [],
        checks: {
          metadata: "ready",
          content: "needs_attention",
          openingQuality: "needs_attention",
          consistency: "ready",
          officialMatching: "unconfirmed",
          technicalSafety: "ready",
        },
        generatedAt: "2026-09-15T00:00:00.000Z",
      },
    };

    for (const [task, payload] of Object.entries(payloads)) {
      const result = SigningSprintModelResultSchema.parse({
        task,
        summary: "结构化候选摘要",
        rationale: "结构化候选理由",
        payload,
      });
      expect(result.task).toBe(task);
      expect(result.payload).toEqual(payload);
    }
    expect(SIGNING_SPRINT_MODEL_CONTRACT.schema).toMatchObject({
      additionalProperties: false,
      required: ["task", "summary", "rationale", "payload"],
    });
  });

  it("requires three packaging candidates and a three-chapter opening plan", () => {
    expect(() =>
      SigningSprintModelResultSchema.parse({
        task: "GenerateBookPackaging",
        summary: "包装",
        rationale: "理由",
        payload: { candidates: [packagingPayload(1)] },
      }),
    ).toThrow();
    expect(() =>
      SigningSprintModelResultSchema.parse({
        task: "GenerateOpeningBlueprint",
        summary: "开篇",
        rationale: "理由",
        payload: {
          ...openingPayload(),
          firstThreeChapters: [openingChapter(1)],
        },
      }),
    ).toThrow();
    expect(() =>
      SigningSprintModelResultSchema.parse({
        task: "GenerateOpeningBlueprint",
        summary: "第一阶段",
        rationale: "理由",
        payload: {
          ...openingPayload(),
          firstArcChapters: [openingChapter(1)],
        },
      }),
    ).toThrow();
  });
});

function positioningPayload(): Record<string, unknown> {
  return {
    oneLineStory: "落魄刑警用死者最后七秒的声音追查姐姐旧案。",
    coreIdea: "每个声音线索都能逼近真相，也会带走主角一段记忆。",
    sellingPoints: ["声音机制", "案件反转"],
    emotionalPayoff: "紧张、成长和阶段性爽感",
    readerProfile: "喜欢都市脑洞和悬疑反转的读者",
    protagonistDesire: "查清姐姐死亡真相",
    obstacle: "篡改声音记录的人和逐渐消失的记忆",
    mechanism: "听见死者最后七秒",
    coreConflict: "主角必须用记忆换取真相",
    longTermExpectation: "姐姐旧案指向主角隐瞒的选择",
    sustainability: {
      shortTermAppeal: "每案都有即时声音谜面",
      midTermExpansion: "不同案件连接成声音网络",
      longTermSpace: "记忆缺口与旧案形成终局",
    },
    riskNotes: [],
  };
}

function packagingPayload(index: number): Record<string, unknown> {
  return {
    title:
      [`七秒回声${index}`, `死者留声${index}`, `记忆盲区${index}`][index - 1] ??
      `声音谜案${index}`,
    titleDirection: `声音悬疑方向 ${index}`,
    description: "落魄刑警用死者最后七秒的声音追查姐姐旧案。",
    genre: "都市脑洞",
    tags: ["都市", "悬疑"],
    tagline: "真相只比记忆多活七秒",
    coverBrief: "城市夜色、声波和旧案档案",
    rationale: "让书名和简介承接声音机制。",
  };
}

function openingChapter(index: number) {
  return {
    index,
    title: `回声现场 ${index}`,
    purpose: index === 1 ? "setup" : "progress",
    protagonistAction: "主角追查新的声音线索",
    conflict: "线索正在被人为抹除",
    readerExpectation: "主角能否听清真相？",
    emotionTarget: "紧张",
    hook: "录音里出现了明天的声音",
    payoff: "确认一条新线索",
    targetWords: 2500,
  };
}

function openingPayload(): Record<string, unknown> {
  const firstThreeChapters = [1, 2, 3].map(openingChapter);
  return {
    readerPromise: "每一章都揭开一段声音谜团。",
    openingHook: "死亡录音里出现了明天的脚步声。",
    expectation: "主角能否在记忆消失前追到声音来源？",
    informationRevealPlan: ["先听见异常", "再确认代价"],
    firstThreeChapters,
    firstArcTitle: "追查七秒回声",
    firstArcGoal: "找到改写声音记录的人",
    firstArcConflict: "每次使用能力都会失去记忆",
    firstArcPayoff: "确认旧案与声音网络有关",
    firstArcChapters: firstThreeChapters,
    riskNotes: [],
  };
}

function settlement(factCandidates: unknown[]) {
  return {
    summary: "结算摘要",
    stateDelta: [],
    factCandidates,
    timelineCandidates: [],
    relationshipCandidates: [],
    foreshadowCandidates: [],
  };
}

function groundedEvidence(quote: string) {
  return {
    quote,
    start: 0,
    end: quote.length,
    documentVersionId: null,
    contentHash: "a".repeat(64),
    paragraphOrdinal: 1,
  };
}
