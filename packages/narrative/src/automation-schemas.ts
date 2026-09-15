import type { JsonSchemaContract, StructuredValidator } from "@narralume/llm";
import {
  ChapterEmotionCurvePointSchema,
  ChapterEmotionTargetSchema,
  ChapterHookTypeSchema,
  ChapterPurposeSchema,
  ChapterSceneStructureSchema,
  ReaderPromiseOperationSchema,
} from "@narralume/contracts";
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
const IntentProposalSchema = z.object({
  promise: z.string().min(1),
  themes: z.array(z.string().min(1)).min(1).max(12),
  audience: z.string().nullable(),
  tone: z.string().nullable(),
  boundaries: z.array(z.string()).max(20),
  endingDirection: z.string().nullable(),
  currentFocus: z.string().nullable(),
});

const CompassProposalSchema = z.object({
  corePromise: z.string().min(1),
  endingDirection: z.string().nullable(),
  longLines: z
    .array(
      z.object({
        title: z.string().min(1),
        promise: z.string().min(1),
        status: z.enum(["open", "developing", "resolved"]),
      }),
    )
    .min(1)
    .max(12),
  themeQuestions: z.array(z.string().min(1)).min(1).max(12),
  target: z.object({
    chapters: z.number().int().min(1).max(500),
    wordsPerChapter: z.number().int().positive(),
    volumes: z.number().int().min(1).max(20),
  }),
  constraints: z.array(z.string()).max(30),
});

const FoundationEntitySchema = z.object({
  type: z.enum([
    "character",
    "location",
    "organization",
    "item",
    "rule",
    "concept",
  ]),
  name: z.string().min(1),
  aliases: z.array(z.string()).max(20),
  description: z.string().min(1),
  attributes: z.object({
    role: z.string().nullable(),
    desire: z.string().nullable(),
    fear: z.string().nullable(),
    secret: z.string().nullable(),
  }),
});

/** One complete route through the story foundation. Plans deliberately carry
 * the same source-of-truth fields, making side-by-side comparison honest and
 * allowing a single author decision to commit one route atomically. */
export const FoundationPlanSchema = z.object({
  key: z.string().trim().min(1).max(40),
  title: z.string().min(1),
  rationale: z.string().min(1),
  angle: z.string().min(1),
  riskNotes: z.array(z.string().min(1)).max(12),
  intent: IntentProposalSchema,
  compass: CompassProposalSchema,
  entities: z.array(FoundationEntitySchema).min(1).max(20),
});
export type FoundationPlan = z.infer<typeof FoundationPlanSchema>;

export const FoundationProposalSchema = z.object({
  plans: z.array(FoundationPlanSchema).length(3),
});
export type FoundationProposal = z.infer<typeof FoundationProposalSchema>;

export const FoundationGenerationArtifactSchema =
  FoundationProposalSchema.extend({
    baseline: z.object({
      intentUpdatedAt: z.string().nullable(),
      compassVersion: z.number().int().nonnegative().nullable(),
    }),
  });

const PlannedChapterSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  goal: z.string().min(1),
  conflict: z.string().min(1),
  outcome: z.string().min(1),
  povName: z.string().nullable(),
  storyTime: z.string().nullable(),
  hook: z.string().min(1),
  // V1 chapter-brief fields. They remain optional for compatibility with
  // older saved recipes; commitOutline supplies deterministic fallbacks and
  // persists the complete brief envelope in outline metadata.
  location: z.string().trim().min(1).max(300).nullable().optional(),
  informationRevealed: z.array(z.string().trim().min(1)).max(12).optional(),
  lockedFacts: z.array(z.string().trim().min(1)).max(20).optional(),
  foreshadowSeeds: z.array(z.string().trim().min(1)).max(12).optional(),
  characterNames: z.array(z.string().trim().min(1)).max(12).optional(),
  targetWords: z.number().int().positive().max(100_000).optional(),
  purpose: ChapterPurposeSchema.optional(),
  secondaryPurposes: z.array(ChapterPurposeSchema).max(3).optional(),
  readerExpectation: z.string().trim().max(4_000).nullable().optional(),
  emotionTarget: ChapterEmotionTargetSchema.nullable().optional(),
  emotionCurve: z.array(ChapterEmotionCurvePointSchema).max(8).optional(),
  readerPromiseOperations: z
    .array(ReaderPromiseOperationSchema)
    .max(30)
    .optional(),
  payoffStrength: z.number().int().min(0).max(5).optional(),
  hookType: ChapterHookTypeSchema.nullable().optional(),
  hookStrength: z.number().int().min(0).max(5).optional(),
  informationGain: z.number().int().min(0).max(5).optional(),
  endingPull: z.number().int().min(0).max(5).optional(),
  sceneStructure: z.array(ChapterSceneStructureSchema).max(20).optional(),
});

export const RollingOutlineProposalSchema = z.object({
  rationale: z.string().min(1),
  volume: z.object({
    title: z.string().min(1),
    summary: z.string().min(1),
    goal: z.string().min(1),
  }),
  arc: z.object({
    title: z.string().min(1),
    summary: z.string().min(1),
    goal: z.string().min(1),
    conflict: z.string().min(1),
    outcome: z.string().min(1),
  }),
  chapters: z.array(PlannedChapterSchema).min(1).max(20),
  nextArc: z
    .object({
      title: z.string().min(1),
      summary: z.string().min(1),
      goal: z.string().min(1),
    })
    .nullable(),
  continuityRisks: z.array(z.string()).max(20),
});
export type RollingOutlineProposal = z.infer<
  typeof RollingOutlineProposalSchema
>;

/**
 * A missing Promise id is a recoverable model mistake, not a reason to lose a
 * whole rolling outline.  The planner still validates the complete outline;
 * this validator only removes lifecycle operations that cannot be applied
 * against the Promise state supplied to the model.
 */
export function rollingOutlineValidator(
  knownPromiseIds: readonly string[] = [],
): StructuredValidator<RollingOutlineProposal> {
  const knownIds = new Set(knownPromiseIds);
  return (value) => {
    const parsed = RollingOutlineProposalSchema.safeParse(
      sanitizeRollingPromiseOperations(value, knownIds),
    );
    return parsed.success
      ? { success: true, data: parsed.data }
      : {
          success: false,
          issues: parsed.error.issues.map(
            (issue) => `${issue.path.join(".")}: ${issue.message}`,
          ),
        };
  };
}

export const SteerClassificationResultSchema = z.object({
  classification: z.enum([
    "immediate_current",
    "next_scene",
    "future_plan",
    "canon_change",
    "rewrite_existing",
    "temporary_director_note",
  ]),
  effectiveBoundary: z.enum([
    "immediate",
    "next_scene",
    "next_chapter",
    "future",
  ]),
  rationale: z.string().min(1),
  risk: z.enum(["low", "medium", "high"]),
});
export type SteerClassificationResult = z.infer<
  typeof SteerClassificationResultSchema
>;

export const PlanningReviewResultSchema = z.object({
  summary: z.string().min(1),
  scores: z.object({
    promise: z.number().min(0).max(100),
    causality: z.number().min(0).max(100),
    characterArc: z.number().min(0).max(100),
    pacing: z.number().min(0).max(100),
    continuity: z.number().min(0).max(100),
  }),
  recommendations: z.array(z.string().min(1)).max(20),
  compassAdjustments: z.array(z.string()).max(12),
});
export type PlanningReviewResult = z.infer<typeof PlanningReviewResultSchema>;

/** The first-release batch review is deliberately separate from an arc/volume
 * retrospective: its evidence is bound to exactly five current document
 * versions, so an old review cannot be mistaken for the acceptance result. */
export const BatchReviewResultSchema = z.object({
  verdict: z.enum(["pass", "warning", "block"]),
  summary: z.string().min(1).max(800),
  scores: z.object({
    causality: z.number().min(0).max(100),
    characterKnowledge: z.number().min(0).max(100),
    continuity: z.number().min(0).max(100),
    constraints: z.number().min(0).max(100),
    prose: z.number().min(0).max(100),
  }),
  issues: z
    .array(
      z.object({
        severity: z.enum(["warning", "block"]),
        chapterOrdinal: z.number().int().min(1).max(5),
        category: z.string().min(1).max(80),
        message: z.string().min(1).max(500),
        evidenceQuote: z.string().min(1).max(300),
        rationale: z.string().min(1).max(500),
      }),
    )
    .max(12),
  recommendations: z.array(z.string().min(1).max(300)).max(8),
});
export type BatchReviewResult = z.infer<typeof BatchReviewResultSchema>;

const FOUNDATION_INTENT_JSON = {
  type: "object",
  additionalProperties: false,
  required: [
    "promise",
    "themes",
    "audience",
    "tone",
    "boundaries",
    "endingDirection",
    "currentFocus",
  ],
  properties: {
    promise: { type: "string" },
    themes: { type: "array", items: { type: "string" } },
    audience: { type: ["string", "null"] },
    tone: { type: ["string", "null"] },
    boundaries: { type: "array", items: { type: "string" } },
    endingDirection: { type: ["string", "null"] },
    currentFocus: { type: ["string", "null"] },
  },
} as const;

const FOUNDATION_COMPASS_JSON = {
  type: "object",
  additionalProperties: false,
  required: [
    "corePromise",
    "endingDirection",
    "longLines",
    "themeQuestions",
    "target",
    "constraints",
  ],
  properties: {
    corePromise: { type: "string" },
    endingDirection: { type: ["string", "null"] },
    longLines: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "promise", "status"],
        properties: {
          title: { type: "string" },
          promise: { type: "string" },
          status: { type: "string", enum: ["open", "developing", "resolved"] },
        },
      },
    },
    themeQuestions: { type: "array", items: { type: "string" } },
    target: {
      type: "object",
      additionalProperties: false,
      required: ["chapters", "wordsPerChapter", "volumes"],
      properties: {
        chapters: { type: "integer", minimum: 1, maximum: 500 },
        wordsPerChapter: { type: "integer", minimum: 1 },
        volumes: { type: "integer", minimum: 1, maximum: 20 },
      },
    },
    constraints: { type: "array", items: { type: "string" } },
  },
} as const;

const FOUNDATION_ENTITY_JSON = {
  type: "object",
  additionalProperties: false,
  required: ["type", "name", "aliases", "description", "attributes"],
  properties: {
    type: {
      type: "string",
      enum: [
        "character",
        "location",
        "organization",
        "item",
        "rule",
        "concept",
      ],
    },
    name: { type: "string" },
    aliases: { type: "array", items: { type: "string" } },
    description: { type: "string" },
    attributes: {
      type: "object",
      additionalProperties: false,
      required: ["role", "desire", "fear", "secret"],
      properties: {
        role: { type: ["string", "null"] },
        desire: { type: ["string", "null"] },
        fear: { type: ["string", "null"] },
        secret: { type: ["string", "null"] },
      },
    },
  },
} as const;

const FOUNDATION_PLAN_JSON = {
  type: "object",
  additionalProperties: false,
  required: [
    "key",
    "title",
    "rationale",
    "angle",
    "riskNotes",
    "intent",
    "compass",
    "entities",
  ],
  properties: {
    key: { type: "string" },
    title: { type: "string" },
    rationale: { type: "string" },
    angle: { type: "string" },
    riskNotes: { type: "array", items: { type: "string" } },
    intent: FOUNDATION_INTENT_JSON,
    compass: FOUNDATION_COMPASS_JSON,
    entities: {
      type: "array",
      minItems: 1,
      maxItems: 20,
      items: FOUNDATION_ENTITY_JSON,
    },
  },
} as const;

export const FOUNDATION_CONTRACT: JsonSchemaContract = {
  name: "book_foundation_comparable_plans",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["plans"],
    properties: {
      plans: {
        type: "array",
        minItems: 3,
        maxItems: 3,
        items: FOUNDATION_PLAN_JSON,
      },
    },
  },
};

export const ROLLING_OUTLINE_CONTRACT: JsonSchemaContract = {
  name: "rolling_story_outline",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "rationale",
      "volume",
      "arc",
      "chapters",
      "nextArc",
      "continuityRisks",
    ],
    properties: {
      rationale: { type: "string" },
      volume: outlineUnitSchema(["title", "summary", "goal"]),
      arc: outlineUnitSchema([
        "title",
        "summary",
        "goal",
        "conflict",
        "outcome",
      ]),
      chapters: {
        type: "array",
        minItems: 1,
        maxItems: 20,
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "title",
            "summary",
            "goal",
            "conflict",
            "outcome",
            "povName",
            "storyTime",
            "hook",
          ],
          properties: {
            title: { type: "string" },
            summary: { type: "string" },
            goal: { type: "string" },
            conflict: { type: "string" },
            outcome: { type: "string" },
            povName: { type: ["string", "null"] },
            storyTime: { type: ["string", "null"] },
            hook: { type: "string" },
            location: { type: ["string", "null"] },
            informationRevealed: {
              type: "array",
              items: { type: "string" },
            },
            lockedFacts: { type: "array", items: { type: "string" } },
            foreshadowSeeds: {
              type: "array",
              items: { type: "string" },
            },
            characterNames: { type: "array", items: { type: "string" } },
            targetWords: { type: "integer", minimum: 1 },
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
            readerPromiseOperations: {
              type: "array",
              maxItems: 30,
              items: {
                oneOf: [
                  {
                    type: "object",
                    additionalProperties: false,
                    required: ["action", "promiseId", "title", "note"],
                    properties: {
                      action: { type: "string", enum: ["OPEN"] },
                      promiseId: { type: ["string", "null"] },
                      title: { type: ["string", "null"] },
                      note: { type: ["string", "null"] },
                    },
                  },
                  {
                    type: "object",
                    additionalProperties: false,
                    required: ["action", "promiseId", "title", "note"],
                    properties: {
                      action: {
                        type: "string",
                        enum: ["ADVANCE", "PAYOFF"],
                      },
                      promiseId: { type: "string", minLength: 1 },
                      title: { type: ["string", "null"] },
                      note: { type: ["string", "null"] },
                    },
                  },
                ],
              },
            },
            payoffStrength: { type: "integer", minimum: 0, maximum: 5 },
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
                  purpose: {
                    type: "string",
                    enum: [...CHAPTER_PURPOSE_VALUES],
                  },
                  beat: { type: "string" },
                  payoff: { type: ["string", "null"] },
                },
              },
            },
          },
        },
      },
      nextArc: {
        anyOf: [
          outlineUnitSchema(["title", "summary", "goal"]),
          { type: "null" },
        ],
      },
      continuityRisks: { type: "array", items: { type: "string" } },
    },
  },
};

export const STEER_CLASSIFICATION_CONTRACT: JsonSchemaContract = {
  name: "story_steer_classification",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["classification", "effectiveBoundary", "rationale", "risk"],
    properties: {
      classification: {
        type: "string",
        enum: [
          "immediate_current",
          "next_scene",
          "future_plan",
          "canon_change",
          "rewrite_existing",
          "temporary_director_note",
        ],
      },
      effectiveBoundary: {
        type: "string",
        enum: ["immediate", "next_scene", "next_chapter", "future"],
      },
      rationale: { type: "string" },
      risk: { type: "string", enum: ["low", "medium", "high"] },
    },
  },
};

export const PLANNING_REVIEW_CONTRACT: JsonSchemaContract = {
  name: "arc_volume_review",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["summary", "scores", "recommendations", "compassAdjustments"],
    properties: {
      summary: { type: "string" },
      scores: {
        type: "object",
        additionalProperties: false,
        required: [
          "promise",
          "causality",
          "characterArc",
          "pacing",
          "continuity",
        ],
        properties: Object.fromEntries(
          ["promise", "causality", "characterArc", "pacing", "continuity"].map(
            (key) => [key, { type: "number", minimum: 0, maximum: 100 }],
          ),
        ),
      },
      recommendations: { type: "array", items: { type: "string" } },
      compassAdjustments: { type: "array", items: { type: "string" } },
    },
  },
};

export const BATCH_REVIEW_CONTRACT: JsonSchemaContract = {
  name: "first_five_joint_review",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["verdict", "summary", "scores", "issues", "recommendations"],
    properties: {
      verdict: { type: "string", enum: ["pass", "warning", "block"] },
      summary: { type: "string", maxLength: 800 },
      scores: {
        type: "object",
        additionalProperties: false,
        required: [
          "causality",
          "characterKnowledge",
          "continuity",
          "constraints",
          "prose",
        ],
        properties: Object.fromEntries(
          [
            "causality",
            "characterKnowledge",
            "continuity",
            "constraints",
            "prose",
          ].map((key) => [key, { type: "number", minimum: 0, maximum: 100 }]),
        ),
      },
      issues: {
        type: "array",
        maxItems: 12,
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "severity",
            "chapterOrdinal",
            "category",
            "message",
            "evidenceQuote",
            "rationale",
          ],
          properties: {
            severity: { type: "string", enum: ["warning", "block"] },
            chapterOrdinal: { type: "integer", minimum: 1, maximum: 5 },
            category: { type: "string", maxLength: 80 },
            message: { type: "string", maxLength: 500 },
            evidenceQuote: { type: "string", minLength: 1, maxLength: 300 },
            rationale: { type: "string", maxLength: 500 },
          },
        },
      },
      recommendations: {
        type: "array",
        maxItems: 8,
        items: { type: "string", maxLength: 300 },
      },
    },
  },
};

export function automationValidator<T>(
  schema: z.ZodType<T>,
): StructuredValidator<T> {
  return (value) => {
    const parsed = schema.safeParse(value);
    return parsed.success
      ? { success: true, data: parsed.data }
      : {
          success: false,
          issues: parsed.error.issues.map(
            (issue) => `${issue.path.join(".")}: ${issue.message}`,
          ),
        };
  };
}

function sanitizeRollingPromiseOperations(
  value: unknown,
  knownPromiseIds: ReadonlySet<string>,
): unknown {
  if (!isRecord(value) || !Array.isArray(value.chapters)) return value;
  return {
    ...value,
    chapters: value.chapters.map((chapter) => {
      if (
        !isRecord(chapter) ||
        !Array.isArray(chapter.readerPromiseOperations)
      ) {
        return chapter;
      }
      return {
        ...chapter,
        readerPromiseOperations: chapter.readerPromiseOperations.filter(
          (operation) => {
            if (!isRecord(operation)) return true;
            if (operation.action === "OPEN") return true;
            if (
              operation.action !== "ADVANCE" &&
              operation.action !== "PAYOFF"
            ) {
              return true;
            }
            return (
              typeof operation.promiseId === "string" &&
              knownPromiseIds.has(operation.promiseId.trim())
            );
          },
        ),
      };
    }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function outlineUnitSchema(required: readonly string[]) {
  return {
    type: "object",
    additionalProperties: false,
    required,
    properties: Object.fromEntries(
      required.map((key) => [key, { type: "string" }]),
    ),
  };
}
