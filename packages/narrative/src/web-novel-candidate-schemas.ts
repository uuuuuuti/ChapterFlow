import {
  ReaderPromiseOperationSchema,
  WebNovelCandidateEvidenceSchema,
} from "@narralume/contracts";
import type { JsonSchemaContract, StructuredValidator } from "@narralume/llm";
import { z } from "zod";

const CHAPTER_PURPOSE_VALUES = [
  "setup",
  "progress",
  "conflict",
  "reveal",
  "payoff",
  "turning_point",
  "relationship",
  "worldbuilding",
  "transition",
  "climax",
] as const;
const CHAPTER_HOOK_TYPE_VALUES = [
  "question",
  "reveal",
  "danger",
  "decision",
  "arrival",
  "identity",
  "information_gap",
  "emotional",
  "reward",
  "reverse",
] as const;
const EMOTION_TARGET_VALUES = [
  "爽",
  "紧张",
  "期待",
  "惊讶",
  "压迫",
  "感动",
  "暧昧",
  "恐惧",
  "轻松",
] as const;
const READER_PROMISE_ACTION_VALUES = ["OPEN", "ADVANCE", "PAYOFF"] as const;

/** Structured, reviewable planning payload carried inside a brief candidate. */
export const ChapterIntentPlanSchema = z
  .object({
    purpose: z.enum(CHAPTER_PURPOSE_VALUES).optional(),
    secondaryPurposes: z
      .array(z.enum(CHAPTER_PURPOSE_VALUES))
      .max(3)
      .optional(),
    readerExpectation: z.string().trim().max(4_000).nullable().optional(),
    emotionTarget: z.enum(EMOTION_TARGET_VALUES).nullable().optional(),
    emotionCurve: z
      .array(
        z
          .object({
            label: z.string().trim().min(1).max(200),
            intensity: z.number().int().min(0).max(5),
          })
          .strict(),
      )
      .max(8)
      .optional(),
    goal: z.string().trim().max(4_000).nullable().optional(),
    conflict: z.string().trim().max(4_000).nullable().optional(),
    readerPromiseOperations: z
      .array(ReaderPromiseOperationSchema)
      .max(30)
      .optional(),
    payoff: z.string().trim().max(4_000).nullable().optional(),
    payoffStrength: z.number().int().min(0).max(5).optional(),
    hook: z.string().trim().max(4_000).nullable().optional(),
    hookType: z.enum(CHAPTER_HOOK_TYPE_VALUES).nullable().optional(),
    hookStrength: z.number().int().min(0).max(5).optional(),
    informationGain: z.number().int().min(0).max(5).optional(),
    endingPull: z.number().int().min(0).max(5).optional(),
    sceneStructure: z
      .array(
        z
          .object({
            order: z.number().int().min(1).max(20),
            purpose: z.enum(CHAPTER_PURPOSE_VALUES),
            beat: z.string().trim().min(1).max(2_000),
            payoff: z.string().trim().max(2_000).nullable(),
          })
          .strict(),
      )
      .max(20)
      .optional(),
    characterIds: z.array(z.string().trim().min(1)).max(100).optional(),
    foreshadowIds: z.array(z.string().trim().min(1)).max(100).optional(),
    timelineIds: z.array(z.string().trim().min(1)).max(100).optional(),
    targetWords: z.number().int().positive().max(100_000).nullable().optional(),
    pacing: z.enum(["slow", "steady", "fast", "cliffhanger"]).optional(),
  })
  .strict();
export type ChapterIntentPlan = z.infer<typeof ChapterIntentPlanSchema>;

export const CHAPTER_INTENT_PLAN_CONTRACT: JsonSchemaContract = {
  name: "chapter_intent_plan_patch",
  description:
    "Reviewable Chapter Intent fields. Only changed editable fields are allowed; this contract never generates manuscript prose.",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      purpose: { type: "string", enum: [...CHAPTER_PURPOSE_VALUES] },
      secondaryPurposes: {
        type: "array",
        maxItems: 3,
        items: { type: "string", enum: [...CHAPTER_PURPOSE_VALUES] },
      },
      readerExpectation: { type: ["string", "null"] },
      emotionTarget: {
        type: ["string", "null"],
        enum: [...EMOTION_TARGET_VALUES, null],
      },
      emotionCurve: {
        type: "array",
        maxItems: 8,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["label", "intensity"],
          properties: {
            label: { type: "string" },
            intensity: { type: "integer", minimum: 0, maximum: 5 },
          },
        },
      },
      goal: { type: ["string", "null"] },
      conflict: { type: ["string", "null"] },
      readerPromiseOperations: {
        type: "array",
        maxItems: 30,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["action", "promiseId", "title", "note"],
          properties: {
            action: { type: "string", enum: [...READER_PROMISE_ACTION_VALUES] },
            promiseId: { type: ["string", "null"] },
            title: { type: ["string", "null"] },
            note: { type: ["string", "null"] },
          },
        },
      },
      payoff: { type: ["string", "null"] },
      payoffStrength: { type: "integer", minimum: 0, maximum: 5 },
      hook: { type: ["string", "null"] },
      hookType: {
        type: ["string", "null"],
        enum: [...CHAPTER_HOOK_TYPE_VALUES, null],
      },
      hookStrength: { type: "integer", minimum: 0, maximum: 5 },
      informationGain: { type: "integer", minimum: 0, maximum: 5 },
      endingPull: { type: "integer", minimum: 0, maximum: 5 },
      sceneStructure: {
        type: "array",
        maxItems: 20,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["order", "purpose", "beat", "payoff"],
          properties: {
            order: { type: "integer", minimum: 1, maximum: 20 },
            purpose: { type: "string", enum: [...CHAPTER_PURPOSE_VALUES] },
            beat: { type: "string" },
            payoff: { type: ["string", "null"] },
          },
        },
      },
      characterIds: {
        type: "array",
        maxItems: 100,
        items: { type: "string" },
      },
      foreshadowIds: {
        type: "array",
        maxItems: 100,
        items: { type: "string" },
      },
      timelineIds: {
        type: "array",
        maxItems: 100,
        items: { type: "string" },
      },
      targetWords: { type: ["integer", "null"], minimum: 1, maximum: 100_000 },
      pacing: {
        type: "string",
        enum: ["slow", "steady", "fast", "cliffhanger"],
      },
    },
  },
};

export const WebNovelCandidateModelItemSchema = z
  .object({
    operation: z.literal("update"),
    title: z.string().trim().min(1).max(500),
    rationale: z.string().trim().min(1).max(10_000),
    impact: z.array(z.string().trim().min(1).max(2_000)).max(12),
    evidence: z.array(WebNovelCandidateEvidenceSchema).max(8).default([]),
    afterJson: z.string().trim().min(2).max(100_000),
    requiresLockedConfirmation: z.boolean().default(false),
  })
  .strict();

export const WebNovelCandidateModelResultSchema = z
  .object({
    summary: z.string().trim().min(1).max(10_000),
    items: z.array(WebNovelCandidateModelItemSchema).min(1).max(12),
  })
  .strict();
export type WebNovelCandidateModelResult = z.infer<
  typeof WebNovelCandidateModelResultSchema
>;

export const WEB_NOVEL_CANDIDATE_MODEL_CONTRACT: JsonSchemaContract = {
  name: "web_novel_candidate",
  description:
    "Reviewable profile or chapter brief updates. afterJson is a JSON object containing only changed editable fields.",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["summary", "items"],
    properties: {
      summary: { type: "string", minLength: 1 },
      items: {
        type: "array",
        minItems: 1,
        maxItems: 12,
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "operation",
            "title",
            "rationale",
            "impact",
            "evidence",
            "afterJson",
            "requiresLockedConfirmation",
          ],
          properties: {
            operation: { type: "string", enum: ["update"] },
            title: { type: "string", minLength: 1 },
            rationale: { type: "string", minLength: 1 },
            impact: {
              type: "array",
              maxItems: 12,
              items: { type: "string", minLength: 1 },
            },
            evidence: {
              type: "array",
              maxItems: 8,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["sourceType", "sourceId", "label", "quote"],
                properties: {
                  sourceType: {
                    type: "string",
                    enum: [
                      "outline",
                      "entity",
                      "fact",
                      "relation",
                      "timeline",
                      "foreshadow",
                      "document",
                      "profile",
                      "brief",
                      "reader_promise",
                    ],
                  },
                  sourceId: { type: "string", minLength: 1 },
                  label: { type: "string", minLength: 1 },
                  quote: { type: "string", minLength: 1 },
                  versionId: { anyOf: [{ type: "string" }, { type: "null" }] },
                },
              },
            },
            afterJson: { type: "string", minLength: 2 },
            requiresLockedConfirmation: { type: "boolean" },
          },
        },
      },
    },
  },
};

export function webNovelCandidateModelValidator(
  kind: "profile" | "brief",
  evidenceIndex: Readonly<Record<string, readonly string[]>>,
): StructuredValidator<WebNovelCandidateModelResult> {
  return (value) => {
    const parsed = WebNovelCandidateModelResultSchema.safeParse(value);
    if (!parsed.success) {
      return {
        success: false,
        issues: parsed.error.issues.map(
          (issue) => `${issue.path.join(".") || "root"}: ${issue.message}`,
        ),
      };
    }
    const issues: string[] = [];
    const allowed = new Set(
      kind === "profile"
        ? [
            "presetId",
            "genre",
            "audience",
            "promise",
            "tone",
            "endingDirection",
            "pov",
            "updateCadence",
            "targetWordsPerChapter",
            "boundaries",
            "worldRules",
            "arcNotes",
          ]
        : [
            "goal",
            "conflict",
            "payoff",
            "hook",
            "characterIds",
            "foreshadowIds",
            "timelineIds",
            "targetWords",
            "pacing",
            "purpose",
            "secondaryPurposes",
            "readerExpectation",
            "emotionTarget",
            "emotionCurve",
            "readerPromiseOperations",
            "payoffStrength",
            "hookType",
            "hookStrength",
            "informationGain",
            "endingPull",
            "sceneStructure",
          ],
    );
    parsed.data.items.forEach((item, index) => {
      let after: unknown;
      try {
        after = JSON.parse(item.afterJson);
      } catch {
        issues.push(`items.${index}.afterJson must be valid JSON`);
        return;
      }
      if (!after || typeof after !== "object" || Array.isArray(after)) {
        issues.push(`items.${index}.afterJson must be a JSON object`);
      } else {
        for (const key of Object.keys(after)) {
          if (!allowed.has(key))
            issues.push(`items.${index}.afterJson.${key} is not editable`);
        }
        if (kind === "brief") {
          const parsedPlan = ChapterIntentPlanSchema.partial().safeParse(after);
          if (!parsedPlan.success) {
            issues.push(
              ...parsedPlan.error.issues.map(
                (issue) =>
                  `items.${index}.afterJson.${issue.path.join(".") || "root"}: ${issue.message}`,
              ),
            );
          }
        }
      }
      item.evidence.forEach((evidence, evidenceIndexPosition) => {
        const ids = evidenceIndex[evidence.sourceType] ?? [];
        if (!ids.includes(evidence.sourceId)) {
          issues.push(
            `items.${index}.evidence.${evidenceIndexPosition} references unknown ${evidence.sourceType} ${evidence.sourceId}`,
          );
        }
      });
    });
    return issues.length
      ? { success: false, issues }
      : { success: true, data: parsed.data };
  };
}
