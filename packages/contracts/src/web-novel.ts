import { z } from "zod";

const IdSchema = z.string().trim().min(1).max(200);
const TimestampSchema = z.string().min(1);
const TextListSchema = z.array(z.string().trim().min(1).max(2_000)).max(100);

export const CreativePresetStatusSchema = z.enum(["active", "archived"]);
export type CreativePresetStatus = z.infer<typeof CreativePresetStatusSchema>;

export const CreativePresetSchema = z.object({
  id: IdSchema,
  projectId: IdSchema.nullable(),
  name: z.string().min(1).max(200),
  genre: z.string().nullable(),
  audience: z.string().nullable(),
  promise: z.string().nullable(),
  pacing: z.enum(["slow", "steady", "fast", "cliffhanger"]),
  targetWordsPerChapter: z.number().int().positive(),
  updateCadence: z.string().nullable(),
  boundaries: TextListSchema,
  checkRules: TextListSchema,
  defaultTemplate: z.string().max(20_000).nullable(),
  status: CreativePresetStatusSchema,
  version: z.number().int().nonnegative(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type CreativePresetDto = z.infer<typeof CreativePresetSchema>;

export const CreativePresetSnapshotSchema = CreativePresetSchema.pick({
  name: true,
  genre: true,
  audience: true,
  promise: true,
  pacing: true,
  targetWordsPerChapter: true,
  updateCadence: true,
  boundaries: true,
  checkRules: true,
  defaultTemplate: true,
  status: true,
});
export type CreativePresetSnapshotDto = z.infer<
  typeof CreativePresetSnapshotSchema
>;

export const CreativePresetHistorySchema = z.object({
  id: IdSchema,
  presetId: IdSchema,
  presetVersion: z.number().int().nonnegative(),
  snapshot: CreativePresetSnapshotSchema,
  createdAt: TimestampSchema,
});
export type CreativePresetHistoryDto = z.infer<
  typeof CreativePresetHistorySchema
>;

export const RestoreCreativePresetHistoryRequestSchema = z.object({
  expectedVersion: z.number().int().nonnegative(),
});
export type RestoreCreativePresetHistoryRequest = z.infer<
  typeof RestoreCreativePresetHistoryRequestSchema
>;

export const CreateCreativePresetRequestSchema = z.object({
  projectId: IdSchema.nullable().default(null),
  name: z.string().trim().min(1).max(200),
  genre: z.string().trim().max(200).nullable().default(null),
  audience: z.string().trim().max(500).nullable().default(null),
  promise: z.string().trim().max(10_000).nullable().default(null),
  pacing: z.enum(["slow", "steady", "fast", "cliffhanger"]).default("steady"),
  targetWordsPerChapter: z
    .number()
    .int()
    .positive()
    .max(100_000)
    .default(2_500),
  updateCadence: z.string().trim().max(200).nullable().default(null),
  boundaries: TextListSchema.default([]),
  checkRules: TextListSchema.default([]),
  defaultTemplate: z.string().max(20_000).nullable().default(null),
});
export type CreateCreativePresetRequest = z.infer<
  typeof CreateCreativePresetRequestSchema
>;

export const UpdateCreativePresetRequestSchema =
  CreateCreativePresetRequestSchema.omit({
    projectId: true,
  }).extend({
    status: CreativePresetStatusSchema,
    expectedVersion: z.number().int().nonnegative(),
  });
export type UpdateCreativePresetRequest = z.infer<
  typeof UpdateCreativePresetRequestSchema
>;

export const BookProfileSchema = z.object({
  projectId: IdSchema,
  presetId: IdSchema.nullable(),
  genre: z.string().nullable(),
  audience: z.string().nullable(),
  promise: z.string().nullable(),
  tone: z.string().nullable(),
  endingDirection: z.string().nullable(),
  pov: z.string().nullable(),
  updateCadence: z.string().nullable(),
  targetWordsPerChapter: z.number().int().positive().nullable(),
  boundaries: TextListSchema,
  worldRules: TextListSchema,
  arcNotes: TextListSchema,
  version: z.number().int().nonnegative(),
  updatedAt: TimestampSchema,
});
export type BookProfileDto = z.infer<typeof BookProfileSchema>;

/**
 * Editable profile fields accepted while creating a blank book.  Keeping
 * this shape separate from the persisted DTO lets project creation apply the
 * profile in the same transaction without asking the client to guess the
 * initial optimistic-lock version.
 */
export const BookProfileInputSchema = z.object({
  presetId: IdSchema.nullable().default(null),
  genre: z.string().trim().max(200).nullable().default(null),
  audience: z.string().trim().max(500).nullable().default(null),
  promise: z.string().trim().max(10_000).nullable().default(null),
  tone: z.string().trim().max(500).nullable().default(null),
  endingDirection: z.string().trim().max(10_000).nullable().default(null),
  pov: z.string().trim().max(500).nullable().default(null),
  updateCadence: z.string().trim().max(500).nullable().default(null),
  targetWordsPerChapter: z
    .number()
    .int()
    .positive()
    .max(100_000)
    .nullable()
    .default(null),
  boundaries: TextListSchema.default([]),
  worldRules: TextListSchema.default([]),
  arcNotes: TextListSchema.default([]),
});
export type BookProfileInput = z.infer<typeof BookProfileInputSchema>;

export const BookProfileSnapshotSchema = BookProfileSchema.omit({
  projectId: true,
  version: true,
  updatedAt: true,
});
export type BookProfileSnapshotDto = z.infer<typeof BookProfileSnapshotSchema>;

export const BookProfileHistorySchema = z.object({
  id: IdSchema,
  projectId: IdSchema,
  profileVersion: z.number().int().nonnegative(),
  snapshot: BookProfileSnapshotSchema,
  createdAt: TimestampSchema,
});
export type BookProfileHistoryDto = z.infer<typeof BookProfileHistorySchema>;

export const RestoreBookProfileHistoryRequestSchema = z.object({
  expectedVersion: z.number().int().nonnegative(),
});
export type RestoreBookProfileHistoryRequest = z.infer<
  typeof RestoreBookProfileHistoryRequestSchema
>;

export const UpdateBookProfileRequestSchema = BookProfileSchema.omit({
  projectId: true,
  version: true,
  updatedAt: true,
}).extend({
  expectedVersion: z.number().int().nonnegative().nullable(),
});
export type UpdateBookProfileRequest = z.infer<
  typeof UpdateBookProfileRequestSchema
>;

export const ChapterBriefPacingSchema = z.enum([
  "slow",
  "steady",
  "fast",
  "cliffhanger",
]);

export const ChapterPurposeSchema = z.enum([
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
]);
export type ChapterPurpose = z.infer<typeof ChapterPurposeSchema>;

export const ChapterEmotionTargetSchema = z.enum([
  "爽",
  "紧张",
  "期待",
  "惊讶",
  "压迫",
  "感动",
  "暧昧",
  "恐惧",
  "轻松",
]);
export type ChapterEmotionTarget = z.infer<typeof ChapterEmotionTargetSchema>;

export const ChapterHookTypeSchema = z.enum([
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
]);
export type ChapterHookType = z.infer<typeof ChapterHookTypeSchema>;

export const ReaderPromiseActionSchema = z.enum(["OPEN", "ADVANCE", "PAYOFF"]);
export type ReaderPromiseAction = z.infer<typeof ReaderPromiseActionSchema>;

export const ReaderPromiseStatusSchema = z.enum([
  "open",
  "paid_off",
  "abandoned",
]);
export type ReaderPromiseStatus = z.infer<typeof ReaderPromiseStatusSchema>;

export const ChapterEmotionCurvePointSchema = z
  .object({
    label: z.string().trim().min(1).max(200),
    intensity: z.number().int().min(0).max(5),
  })
  .strict();
export type ChapterEmotionCurvePoint = z.infer<
  typeof ChapterEmotionCurvePointSchema
>;

export const ChapterSceneStructureSchema = z
  .object({
    order: z.number().int().min(1).max(20),
    purpose: ChapterPurposeSchema,
    beat: z.string().trim().min(1).max(2_000),
    payoff: z.string().trim().max(2_000).nullable(),
  })
  .strict();
export type ChapterSceneStructure = z.infer<typeof ChapterSceneStructureSchema>;

export const ReaderPromiseOperationSchema = z
  .object({
    action: ReaderPromiseActionSchema,
    promiseId: IdSchema.nullable().default(null),
    title: z.string().trim().max(500).nullable().default(null),
    note: z.string().trim().max(2_000).nullable().default(null),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.action === "OPEN" && !value.promiseId && !value.title) {
      context.addIssue({
        code: "custom",
        path: ["title"],
        message: "OPEN must include a title when promiseId is null",
      });
    }
    if (value.action !== "OPEN" && !value.promiseId) {
      context.addIssue({
        code: "custom",
        path: ["promiseId"],
        message: `${value.action} must include promiseId`,
      });
    }
  });
export type ReaderPromiseOperation = z.infer<
  typeof ReaderPromiseOperationSchema
>;

export const ChapterBriefSchema = z.object({
  id: IdSchema,
  projectId: IdSchema,
  outlineNodeId: IdSchema,
  /** Null for legacy briefs or chapters without a saved manuscript version. */
  documentVersionId: IdSchema.nullable().default(null),
  purpose: ChapterPurposeSchema.default("progress"),
  secondaryPurposes: z.array(ChapterPurposeSchema).max(3).default([]),
  goal: z.string().nullable(),
  readerExpectation: z.string().max(4_000).nullable().default(null),
  emotionTarget: ChapterEmotionTargetSchema.nullable().default(null),
  emotionCurve: z.array(ChapterEmotionCurvePointSchema).max(8).default([]),
  conflict: z.string().nullable(),
  readerPromiseOperations: z
    .array(ReaderPromiseOperationSchema)
    .max(30)
    .default([]),
  payoff: z.string().nullable(),
  payoffStrength: z.number().int().min(0).max(5).default(0),
  hook: z.string().nullable(),
  hookType: ChapterHookTypeSchema.nullable().default(null),
  hookStrength: z.number().int().min(0).max(5).default(0),
  informationGain: z.number().int().min(0).max(5).default(0),
  endingPull: z.number().int().min(0).max(5).default(0),
  sceneStructure: z.array(ChapterSceneStructureSchema).max(20).default([]),
  characterIds: z.array(IdSchema).max(100),
  foreshadowIds: z.array(IdSchema).max(100),
  timelineIds: z.array(IdSchema).max(100),
  targetWords: z.number().int().positive().nullable(),
  pacing: ChapterBriefPacingSchema,
  version: z.number().int().nonnegative(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type ChapterBriefDto = z.infer<typeof ChapterBriefSchema>;

export const ChapterBriefSnapshotSchema = ChapterBriefSchema.pick({
  purpose: true,
  secondaryPurposes: true,
  goal: true,
  readerExpectation: true,
  emotionTarget: true,
  emotionCurve: true,
  conflict: true,
  readerPromiseOperations: true,
  payoff: true,
  payoffStrength: true,
  hook: true,
  hookType: true,
  hookStrength: true,
  informationGain: true,
  endingPull: true,
  sceneStructure: true,
  characterIds: true,
  foreshadowIds: true,
  timelineIds: true,
  targetWords: true,
  pacing: true,
});
export type ChapterBriefSnapshotDto = z.infer<
  typeof ChapterBriefSnapshotSchema
>;

export const ChapterBriefHistorySchema = z.object({
  id: IdSchema,
  projectId: IdSchema,
  outlineNodeId: IdSchema,
  briefVersion: z.number().int().nonnegative(),
  snapshot: ChapterBriefSnapshotSchema,
  createdAt: TimestampSchema,
});
export type ChapterBriefHistoryDto = z.infer<typeof ChapterBriefHistorySchema>;

export const RestoreChapterBriefHistoryRequestSchema = z.object({
  expectedVersion: z.number().int().nonnegative(),
});

export const UpdateChapterBriefRequestSchema = ChapterBriefSchema.omit({
  id: true,
  projectId: true,
  outlineNodeId: true,
  documentVersionId: true,
  version: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  expectedVersion: z.number().int().nonnegative().nullable(),
});
export type UpdateChapterBriefRequest = z.infer<
  typeof UpdateChapterBriefRequestSchema
>;

/** Product-facing name for the persisted ChapterBrief compatibility shape. */
export const ChapterIntentSchema = ChapterBriefSchema;
export type ChapterIntentDto = ChapterBriefDto;
export const ChapterIntentSnapshotSchema = ChapterBriefSnapshotSchema;
export type ChapterIntentSnapshotDto = ChapterBriefSnapshotDto;

export const ReaderPromiseSchema = z.object({
  id: IdSchema,
  projectId: IdSchema,
  title: z.string().trim().min(1).max(500),
  description: z.string().max(4_000).nullable(),
  status: ReaderPromiseStatusSchema,
  openedChapterId: IdSchema.nullable(),
  openedChapterIndex: z.number().int().positive(),
  targetChapterId: IdSchema.nullable(),
  paidOffChapterId: IdSchema.nullable(),
  lastAdvancedChapterId: IdSchema.nullable(),
  lastAdvancedChapterIndex: z.number().int().positive().nullable(),
  advanceCount: z.number().int().nonnegative(),
  version: z.number().int().nonnegative(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type ReaderPromiseDto = z.infer<typeof ReaderPromiseSchema>;

export const ReaderPromiseEventSchema = z.object({
  id: IdSchema,
  projectId: IdSchema,
  promiseId: IdSchema,
  action: ReaderPromiseActionSchema,
  chapterId: IdSchema.nullable(),
  chapterIndex: z.number().int().positive(),
  note: z.string().max(2_000).nullable(),
  source: z.enum(["author", "ai", "settlement", "restore"]),
  createdAt: TimestampSchema,
});
export type ReaderPromiseEventDto = z.infer<typeof ReaderPromiseEventSchema>;

export const ReaderPromiseViewSchema = ReaderPromiseSchema.extend({
  openForChapters: z.number().int().nonnegative(),
  lastAction: ReaderPromiseActionSchema,
  warningCodes: z.array(z.string()),
});
export type ReaderPromiseViewDto = z.infer<typeof ReaderPromiseViewSchema>;

export const ReaderPromiseHealthSchema = z.object({
  openCount: z.number().int().nonnegative(),
  longUnadvancedCount: z.number().int().nonnegative(),
  overloaded: z.boolean(),
  warningCodes: z.array(z.string()),
});
export type ReaderPromiseHealthDto = z.infer<typeof ReaderPromiseHealthSchema>;

export const ReaderPromiseListResponseSchema = z.object({
  promises: z.array(ReaderPromiseViewSchema),
  health: ReaderPromiseHealthSchema,
});
export type ReaderPromiseListResponse = z.infer<
  typeof ReaderPromiseListResponseSchema
>;

export const CreateReaderPromiseRequestSchema = z
  .object({
    requestId: z.string().uuid(),
    title: z.string().trim().min(1).max(500),
    description: z.string().trim().max(4_000).nullable().default(null),
    openedChapterId: IdSchema,
    targetChapterId: IdSchema.nullable().default(null),
  })
  .strict();
export type CreateReaderPromiseRequest = z.infer<
  typeof CreateReaderPromiseRequestSchema
>;

export const ReaderPromiseActionRequestSchema = z
  .object({
    action: z.enum(["ADVANCE", "PAYOFF"]),
    chapterId: IdSchema,
    note: z.string().trim().max(2_000).nullable().default(null),
  })
  .strict();
export type ReaderPromiseActionRequest = z.infer<
  typeof ReaderPromiseActionRequestSchema
>;

export const NovelCheckIssueSchema = z.object({
  id: IdSchema,
  code: z.string().min(1),
  severity: z.enum(["info", "warning", "error"]),
  title: z.string(),
  message: z.string(),
  evidence: z.string(),
  suggestion: z.string(),
  targetChapterId: IdSchema.nullable(),
  targetDocumentId: IdSchema.nullable(),
  targetDocumentVersionId: IdSchema.nullable().default(null),
  status: z.enum(["open", "ignored", "resolved"]).default("open"),
  note: z.string().nullable().default(null),
  updatedAt: TimestampSchema.nullable().default(null),
});

export type NovelCheckIssue = z.infer<typeof NovelCheckIssueSchema>;

export const UpdateNovelCheckIssueRequestSchema = z.object({
  status: z.enum(["open", "ignored", "resolved"]),
  note: z.string().trim().max(4_000).nullable().default(null),
  expectedStatus: z.enum(["open", "ignored", "resolved"]).default("open"),
  reportId: IdSchema.nullable().optional(),
});
export type UpdateNovelCheckIssueRequest = z.infer<
  typeof UpdateNovelCheckIssueRequestSchema
>;

export const OpeningThreeCheckReportSchema = z.object({
  id: IdSchema,
  projectId: IdSchema,
  scope: z.literal("opening-three"),
  chapterIds: z.array(IdSchema),
  generatedAt: TimestampSchema,
  sourceVersions: z
    .array(
      z.object({
        chapterId: IdSchema,
        documentId: IdSchema.nullable(),
        documentVersionId: IdSchema.nullable(),
      }),
    )
    .default([]),
  score: z.number().min(0).max(100),
  metrics: z.object({
    availableChapters: z.number().int().nonnegative(),
    checkedChapters: z.number().int().nonnegative(),
    manuscriptCharacters: z.number().int().nonnegative(),
    averageChapterCharacters: z.number().nonnegative(),
    briefsCompleted: z.number().int().nonnegative(),
    chaptersWithHook: z.number().int().nonnegative(),
    /** Objective coverage counts added after the first report format. */
    chaptersWithConflict: z.number().int().nonnegative().default(0),
    chaptersWithPayoff: z.number().int().nonnegative().default(0),
    chaptersMeetingTarget: z.number().int().nonnegative().default(0),
    targetWordsPerChapter: z.number().int().positive().nullable().default(null),
    targetCompletionRate: z.number().nonnegative().nullable().default(null),
  }),
  issues: z.array(NovelCheckIssueSchema),
});
export type OpeningThreeCheckReport = z.infer<
  typeof OpeningThreeCheckReportSchema
>;
export const OpeningThreeCheckReportHistorySchema = z.array(
  OpeningThreeCheckReportSchema,
);
export type OpeningThreeCheckReportHistory = z.infer<
  typeof OpeningThreeCheckReportHistorySchema
>;

export const OpeningCheckAuditEventTypeSchema = z.enum([
  "report_generated",
  "issue_decided",
  "candidate_decided",
]);
export type OpeningCheckAuditEventType = z.infer<
  typeof OpeningCheckAuditEventTypeSchema
>;

export const OpeningCheckAuditRecordSchema = z.object({
  id: IdSchema,
  projectId: IdSchema,
  reportId: IdSchema.nullable(),
  issueId: IdSchema.nullable(),
  proposalId: IdSchema.nullable(),
  runId: IdSchema.nullable(),
  eventType: OpeningCheckAuditEventTypeSchema,
  action: z.string().min(1).max(100),
  before: z.record(z.string(), z.unknown()).nullable(),
  after: z.record(z.string(), z.unknown()).nullable(),
  createdAt: TimestampSchema,
});
export type OpeningCheckAuditRecord = z.infer<
  typeof OpeningCheckAuditRecordSchema
>;

export const OpeningCheckAuditHistorySchema = z.array(
  OpeningCheckAuditRecordSchema,
);
export type OpeningCheckAuditHistory = z.infer<
  typeof OpeningCheckAuditHistorySchema
>;

export const PlatformMetricSchema = z.object({
  id: IdSchema,
  projectId: IdSchema,
  platform: z.string().min(1).max(200),
  chapter: z.string().min(1).max(300),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  words: z.number().int().nonnegative(),
  views: z.number().int().nonnegative().nullable(),
  likes: z.number().int().nonnegative().nullable(),
  comments: z.number().int().nonnegative().nullable(),
  source: z.literal("csv"),
  updatedAt: TimestampSchema,
});
export type PlatformMetricDto = z.infer<typeof PlatformMetricSchema>;

export const UpsertPlatformMetricsRequestSchema = z.object({
  records: z
    .array(
      PlatformMetricSchema.omit({ id: true, projectId: true, updatedAt: true }),
    )
    .min(1)
    .max(10_000),
  /** Number of non-empty rows in the source file before in-file de-duplication. */
  sourceRows: z.number().int().nonnegative().max(10_000).optional(),
});
export type UpsertPlatformMetricsRequest = z.infer<
  typeof UpsertPlatformMetricsRequestSchema
>;

export const PlatformMetricsImportResponseSchema = z.object({
  records: z.array(PlatformMetricSchema),
  added: z.number().int().nonnegative(),
  replaced: z.number().int().nonnegative(),
  sourceRows: z.number().int().nonnegative(),
  duplicateRows: z.number().int().nonnegative(),
  importId: IdSchema,
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/u),
});
export type PlatformMetricsImportResponse = z.infer<
  typeof PlatformMetricsImportResponseSchema
>;

export const PlatformMetricImportAuditSchema = z.object({
  id: IdSchema,
  projectId: IdSchema,
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/u),
  sourceRows: z.number().int().nonnegative(),
  duplicateRows: z.number().int().nonnegative(),
  addedCount: z.number().int().nonnegative(),
  replacedCount: z.number().int().nonnegative(),
  status: z.enum(["active", "rolled_back"]),
  createdAt: TimestampSchema,
  rolledBackAt: TimestampSchema.nullable(),
});
export type PlatformMetricImportAuditDto = z.infer<
  typeof PlatformMetricImportAuditSchema
>;

export const PlatformMetricReportSchema = z.object({
  projectId: IdSchema,
  source: z.literal("csv"),
  sourceLabel: z.string().min(1),
  dateSemantics: z.literal("source_calendar_date"),
  timezone: z.string().min(1),
  metricDefinitions: z.object({
    words: z.string().min(1),
    views: z.string().min(1),
    likes: z.string().min(1),
    comments: z.string().min(1),
  }),
  recordCount: z.number().int().nonnegative(),
  viewSampleCount: z.number().int().nonnegative(),
  likesSampleCount: z.number().int().nonnegative(),
  commentsSampleCount: z.number().int().nonnegative(),
  minimumRecommendedSamples: z.number().int().positive(),
  sampleSufficient: z.boolean(),
  sampleNote: z.string().min(1),
  dateFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/u)
    .nullable(),
  dateTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/u)
    .nullable(),
  recordedDays: z.number().int().nonnegative(),
  missingDays: z.number().int().nonnegative(),
  importCount: z.number().int().nonnegative(),
  latestImportAt: TimestampSchema.nullable(),
  latestSourceHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/u)
    .nullable(),
  generatedAt: TimestampSchema,
});
export type PlatformMetricReportDto = z.infer<
  typeof PlatformMetricReportSchema
>;

export const PublishRecordStatusSchema = z.enum([
  "published",
  "scheduled",
  "draft",
]);
export const PublishRecordSchema = z.object({
  id: IdSchema,
  projectId: IdSchema,
  platform: z.string().min(1).max(200),
  chapter: z.string().min(1).max(300),
  publishedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  url: z.string().url().nullable(),
  status: PublishRecordStatusSchema,
  exportBatchId: IdSchema.nullable(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type PublishRecordDto = z.infer<typeof PublishRecordSchema>;

export const CreatePublishRecordRequestSchema = PublishRecordSchema.omit({
  id: true,
  projectId: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  exportBatchId: IdSchema.nullable().default(null),
});
export type CreatePublishRecordRequest = z.infer<
  typeof CreatePublishRecordRequestSchema
>;

export const UpdatePublishRecordRequestSchema =
  CreatePublishRecordRequestSchema.extend({
    expectedUpdatedAt: TimestampSchema,
  });
export type UpdatePublishRecordRequest = z.infer<
  typeof UpdatePublishRecordRequestSchema
>;
