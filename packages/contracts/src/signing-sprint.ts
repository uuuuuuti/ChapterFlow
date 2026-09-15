import { z } from "zod";

const IdSchema = z.string().trim().min(1).max(300);
const TimestampSchema = z.string().min(1);
const TextSchema = z.string().trim().min(1).max(20_000);
const TextListSchema = z.array(TextSchema).max(100);

export const OfficialSourceTypeSchema = z.enum([
  "platform_rule",
  "official_course",
  "help",
  "signing",
  "governance",
  "tag_guide",
]);
export const OfficialSourceStatusSchema = z.enum([
  "ACTIVE",
  "CANDIDATE",
  "OUTDATED",
  "SUPERSEDED",
  "DISABLED",
  "FETCH_FAILED",
]);
export const OfficialAuthorityTypeSchema = z.enum([
  "OFFICIAL_RULE",
  "OFFICIAL_GUIDANCE",
  "OFFICIAL_TUTORIAL",
]);

export const OfficialSourceSchema = z
  .object({
    id: IdSchema,
    sourceKey: IdSchema,
    platform: z.literal("fanqienovel"),
    url: z.string().url(),
    title: TextSchema.max(500),
    sourceType: OfficialSourceTypeSchema,
    publishedAt: TimestampSchema.nullable(),
    retrievedAt: TimestampSchema,
    contentHash: IdSchema,
    status: OfficialSourceStatusSchema,
    applicableStages: TextListSchema,
    applicableGenres: TextListSchema,
    authorityType: OfficialAuthorityTypeSchema,
    summary: TextSchema.max(4_000),
    sourceVersion: IdSchema,
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
  })
  .strict();
export type OfficialSourceDto = z.infer<typeof OfficialSourceSchema>;

export const KnowledgeCardSourceRefSchema = z
  .object({
    sourceId: IdSchema,
    sourceKey: IdSchema,
    sourceVersion: IdSchema,
    title: TextSchema.max(500),
    url: z.string().url(),
  })
  .strict();

export const KnowledgeCardSchema = z
  .object({
    id: IdSchema,
    title: TextSchema.max(500),
    principle: TextSchema.max(4_000),
    why: TextSchema.max(4_000),
    applicableStage: TextSchema.max(100),
    applicableGenres: TextListSchema,
    signals: TextListSchema,
    antiPatterns: TextListSchema,
    suggestions: TextListSchema,
    severity: z.enum(["info", "suggestion", "warning"]),
    sourceRefs: z.array(KnowledgeCardSourceRefSchema).min(1).max(20),
    confidence: z.number().min(0).max(1),
    status: z.enum(["ACTIVE", "CANDIDATE", "DISABLED"]),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
  })
  .strict();
export type KnowledgeCardDto = z.infer<typeof KnowledgeCardSchema>;

export const BookDirectionSchema = z
  .object({
    // A blank work is a valid entry point; the direction step asks the author
    // to fill this before moving forward.
    premise: z.string().trim().max(10_000),
    genre: z.string().trim().max(200).nullable(),
    audience: z.string().trim().max(500).nullable(),
    coreEmotion: z.string().trim().max(200).nullable(),
    protagonistSeed: z.string().trim().max(2_000).nullable(),
    hook: z.string().trim().max(2_000).nullable(),
    differentiation: TextListSchema,
  })
  .strict();
export type BookDirectionDto = z.infer<typeof BookDirectionSchema>;

export const SustainabilityAssessmentSchema = z
  .object({
    shortTermAppeal: TextSchema.max(2_000),
    midTermExpansion: TextSchema.max(2_000),
    longTermSpace: TextSchema.max(2_000),
  })
  .strict();
export type SustainabilityAssessmentDto = z.infer<
  typeof SustainabilityAssessmentSchema
>;

export const BookPositioningSchema = z
  .object({
    oneLineStory: TextSchema.max(1_000),
    coreIdea: TextSchema.max(4_000),
    sellingPoints: TextListSchema,
    emotionalPayoff: TextSchema.max(2_000),
    readerProfile: TextSchema.max(1_000),
    protagonistDesire: TextSchema.max(2_000),
    obstacle: TextSchema.max(2_000),
    mechanism: TextSchema.max(2_000),
    coreConflict: TextSchema.max(2_000),
    longTermExpectation: TextSchema.max(2_000),
    sustainability: SustainabilityAssessmentSchema,
    riskNotes: TextListSchema,
  })
  .strict();
export type BookPositioningDto = z.infer<typeof BookPositioningSchema>;

export const BookPackagingSchema = z
  .object({
    title: TextSchema.max(200),
    titleDirection: TextSchema.max(500),
    description: TextSchema.max(4_000),
    genre: z.string().trim().max(200).nullable(),
    tags: z.array(z.string().trim().min(1).max(100)).max(20),
    tagline: z.string().trim().max(500).nullable(),
    coverBrief: z.string().trim().max(2_000).nullable(),
    rationale: TextSchema.max(2_000),
  })
  .strict();
export type BookPackagingDto = z.infer<typeof BookPackagingSchema>;

export const OpeningChapterBlueprintSchema = z
  .object({
    index: z.number().int().positive().max(100),
    title: TextSchema.max(200),
    purpose: TextSchema.max(500),
    protagonistAction: TextSchema.max(2_000),
    conflict: TextSchema.max(2_000),
    readerExpectation: TextSchema.max(2_000),
    emotionTarget: TextSchema.max(200),
    hook: TextSchema.max(2_000),
    payoff: TextSchema.max(2_000),
    targetWords: z.number().int().positive().max(100_000).nullable(),
  })
  .strict();
export type OpeningChapterBlueprintDto = z.infer<
  typeof OpeningChapterBlueprintSchema
>;

export const OpeningBlueprintSchema = z
  .object({
    readerPromise: TextSchema.max(2_000),
    openingHook: TextSchema.max(2_000),
    expectation: TextSchema.max(2_000),
    informationRevealPlan: TextListSchema,
    firstThreeChapters: z.array(OpeningChapterBlueprintSchema).min(1).max(3),
    firstArcTitle: TextSchema.max(200),
    firstArcGoal: TextSchema.max(2_000),
    firstArcConflict: TextSchema.max(2_000),
    firstArcPayoff: TextSchema.max(2_000),
    firstArcChapters: z.array(OpeningChapterBlueprintSchema).min(1).max(30),
    riskNotes: TextListSchema,
  })
  .strict();
export type OpeningBlueprintDto = z.infer<typeof OpeningBlueprintSchema>;

export const OpeningSignalMetricsSchema = z
  .object({
    characterCount: z.number().int().nonnegative(),
    paragraphCount: z.number().int().nonnegative(),
    dialogueCharacterCount: z.number().int().nonnegative(),
    dialogueRatio: z.number().min(0).max(1),
    longParagraphCount: z.number().int().nonnegative(),
    longParagraphRate: z.number().min(0).max(1),
    namedPersonDensity: z.number().nonnegative(),
    properNounDensity: z.number().nonnegative(),
    expositionRunCount: z.number().int().nonnegative(),
    viewpointMarkerCount: z.number().int().nonnegative(),
    repeatedParagraphCount: z.number().int().nonnegative(),
  })
  .strict();

export const OpeningSignalSchema = z
  .object({
    code: IdSchema,
    label: TextSchema.max(200),
    value: z.number().nonnegative(),
    threshold: z.number().nonnegative().nullable(),
    direction: z.enum(["higher_is_risk", "lower_is_risk", "observation"]),
    explanation: TextSchema.max(1_000),
    /** Paragraph-level anchors keep deterministic signals actionable. */
    locations: z.array(TextSchema.max(200)).max(100).default([]),
  })
  .strict();

export const OpeningSignalReportSchema = z
  .object({
    metrics: OpeningSignalMetricsSchema,
    signals: z.array(OpeningSignalSchema),
    analyzedChapterCount: z.number().int().nonnegative(),
    analyzedAt: TimestampSchema,
  })
  .strict();
export type OpeningSignalReportDto = z.infer<typeof OpeningSignalReportSchema>;

/** Concrete, reviewable editor findings for the first three chapters. */
export const OpeningReviewIssueSchema = z
  .object({
    code: IdSchema,
    title: TextSchema.max(500),
    problem: TextSchema.max(4_000),
    impact: TextSchema.max(4_000),
    suggestion: TextSchema.max(4_000),
    locations: z.array(TextSchema.max(500)).max(100),
    evidence: TextListSchema,
    source: z.enum(["official", "chapterflow"]),
    sourceRefs: z.array(KnowledgeCardSourceRefSchema),
  })
  .strict();

export const OpeningReviewSchema = z
  .object({
    summary: TextSchema.max(4_000),
    strengths: TextListSchema,
    issues: z.array(OpeningReviewIssueSchema).max(50),
    officialMatches: TextListSchema,
  })
  .strict();
export type OpeningReviewDto = z.infer<typeof OpeningReviewSchema>;

export const ReadinessIssueSchema = z
  .object({
    code: IdSchema,
    title: TextSchema.max(500),
    severity: z.enum(["info", "warning", "error"]),
    source: z.enum(["official", "chapterflow"]),
    detail: TextSchema.max(4_000),
    evidence: TextListSchema,
    locations: TextListSchema,
    suggestions: TextListSchema,
    sourceRefs: z.array(KnowledgeCardSourceRefSchema),
  })
  .strict();

export const SigningReadinessReportSchema = z
  .object({
    status: z.enum(["ready_to_prepare_submission", "needs_attention"]),
    headline: TextSchema.max(1_000),
    issues: z.array(ReadinessIssueSchema).max(100),
    checks: z
      .object({
        metadata: z.enum(["ready", "needs_attention"]),
        content: z.enum(["ready", "needs_attention"]),
        /** Opening quality remains a review surface, not a platform score. */
        openingQuality: z
          .enum(["ready", "needs_attention"])
          .default("needs_attention"),
        consistency: z.enum(["ready", "needs_attention"]),
        officialMatching: z.enum(["ready", "needs_attention", "unconfirmed"]),
        technicalSafety: z.enum(["ready", "needs_attention"]),
      })
      .strict(),
    generatedAt: TimestampSchema,
  })
  .strict();
export type SigningReadinessReportDto = z.infer<
  typeof SigningReadinessReportSchema
>;

export const SigningSprintStepSchema = z.enum([
  "direction",
  "positioning",
  "story_engine",
  "packaging",
  "opening",
  "writing",
  "readiness",
]);
export type SigningSprintStep = z.infer<typeof SigningSprintStepSchema>;
export const SigningSprintStatusSchema = z.enum([
  "active",
  "paused",
  "completed",
]);
export const SigningSprintTaskSchema = z.enum([
  "BrainstormBookDirection",
  "RefineBookPositioning",
  "GenerateStoryEngine",
  "EvaluatePositioning",
  "GenerateBookPackaging",
  "EvaluateBookPackaging",
  "GenerateOpeningBlueprint",
  "EvaluateOpening",
  "GenerateChapterFromIntent",
  "SigningReadinessReview",
]);
export type SigningSprintTask = z.infer<typeof SigningSprintTaskSchema>;

export const BookStoryEngineSchema = z
  .object({
    protagonist: z.string().trim().max(4_000).nullable(),
    relationships: TextListSchema,
    antagonist: z.string().trim().max(4_000).nullable(),
    mechanism: z.string().trim().max(4_000).nullable(),
    worldRules: TextListSchema,
    conflict: z.string().trim().max(4_000).nullable(),
  })
  .strict();
export type BookStoryEngineDto = z.infer<typeof BookStoryEngineSchema>;

export const SigningSprintStateSchema = z
  .object({
    direction: BookDirectionSchema.nullable(),
    positioning: BookPositioningSchema.nullable(),
    storyEngine: BookStoryEngineSchema.nullable(),
    packaging: z.array(BookPackagingSchema),
    selectedPackagingId: IdSchema.nullable(),
    openingBlueprint: OpeningBlueprintSchema.nullable(),
    openingCheck: OpeningSignalReportSchema.nullable(),
    readiness: SigningReadinessReportSchema.nullable(),
  })
  .strict();

export const SigningSprintWorkflowSchema = z
  .object({
    id: IdSchema,
    projectId: IdSchema,
    status: SigningSprintStatusSchema,
    currentStep: SigningSprintStepSchema,
    completedSteps: z.array(SigningSprintStepSchema),
    state: SigningSprintStateSchema,
    selectedStrategyId: IdSchema.nullable(),
    knowledgeRefs: z.array(IdSchema),
    version: z.number().int().nonnegative(),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
  })
  .strict();
export type SigningSprintWorkflowDto = z.infer<
  typeof SigningSprintWorkflowSchema
>;

export const SigningSprintCandidateSchema = z
  .object({
    id: IdSchema,
    workflowId: IdSchema,
    projectId: IdSchema,
    task: SigningSprintTaskSchema,
    status: z.enum(["candidate", "accepted", "rejected"]),
    payload: z.record(z.string(), z.unknown()),
    rationale: z.string(),
    provenance: z
      .object({
        kind: z.enum(["model", "author", "official_knowledge"]),
        sourceRefs: z.array(KnowledgeCardSourceRefSchema),
        runId: IdSchema.nullable(),
      })
      .strict(),
    baseWorkflowVersion: z.number().int().nonnegative(),
    createdAt: TimestampSchema,
    decidedAt: TimestampSchema.nullable(),
  })
  .strict();
export type SigningSprintCandidateDto = z.infer<
  typeof SigningSprintCandidateSchema
>;

export const CreateSigningSprintRequestSchema = z
  .object({
    title: z.string().trim().max(200).optional(),
    premise: z.string().trim().max(10_000).nullable().optional(),
    genre: z.string().trim().max(200).nullable().optional(),
    audience: z.string().trim().max(500).nullable().optional(),
    coreEmotion: z.string().trim().max(200).nullable().optional(),
  })
  .strict();
export type CreateSigningSprintRequest = z.infer<
  typeof CreateSigningSprintRequestSchema
>;

export const UpdateSigningSprintRequestSchema = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    currentStep: SigningSprintStepSchema.optional(),
    status: SigningSprintStatusSchema.optional(),
    completedSteps: z.array(SigningSprintStepSchema).optional(),
    state: SigningSprintStateSchema.partial().optional(),
    selectedStrategyId: IdSchema.nullable().optional(),
    knowledgeRefs: z.array(IdSchema).optional(),
  })
  .strict();
export type UpdateSigningSprintRequest = z.infer<
  typeof UpdateSigningSprintRequestSchema
>;

export const StartSigningSprintAiRequestSchema = z
  .object({
    requestId: z.string().uuid(),
    task: SigningSprintTaskSchema,
    instruction: z.string().trim().max(20_000).default(""),
    policy: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();
export type StartSigningSprintAiRequest = z.infer<
  typeof StartSigningSprintAiRequestSchema
>;

export const DecideSigningSprintCandidateRequestSchema = z
  .object({
    action: z.enum(["accept", "reject"]),
    expectedWorkflowVersion: z.number().int().nonnegative(),
    /** GenerateBookPackaging can be accepted with one chosen option in the same transaction. */
    selectedPackagingIndex: z.number().int().nonnegative().optional(),
  })
  .strict();
export type DecideSigningSprintCandidateRequest = z.infer<
  typeof DecideSigningSprintCandidateRequestSchema
>;

export const OfficialKnowledgeQuerySchema = z.object({
  stage: z.string().trim().max(100).optional(),
  genre: z.string().trim().max(200).optional(),
  sourceType: OfficialSourceTypeSchema.optional(),
  status: z.enum(["ACTIVE", "CANDIDATE", "DISABLED"]).optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
export const OfficialSourceQuerySchema = OfficialKnowledgeQuerySchema.extend({
  status: OfficialSourceStatusSchema.optional(),
});
