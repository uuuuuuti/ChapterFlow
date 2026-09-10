import { z } from "zod";

import { CanonCandidateEvidenceSchema } from "./canon-candidate.js";
import { RunOriginSchema } from "./run.js";

const IdSchema = z.string().trim().min(1).max(300);
const TimestampSchema = z.string().min(1);
const JsonObjectSchema = z.record(z.string(), z.unknown());

export const WebNovelCandidateKindSchema = z.enum(["profile", "brief"]);
export type WebNovelCandidateKind = z.infer<typeof WebNovelCandidateKindSchema>;

export const WebNovelCandidateEvidenceSchema = CanonCandidateEvidenceSchema;
export type WebNovelCandidateEvidence = z.infer<
  typeof WebNovelCandidateEvidenceSchema
>;

export const WebNovelCandidateDecisionSchema = z.object({
  action: z.enum(["apply", "reject"]),
  result: JsonObjectSchema.nullable(),
  decidedAt: TimestampSchema,
});

export const WebNovelCandidateItemSchema = z.object({
  id: IdSchema,
  operation: z.literal("update"),
  title: z.string(),
  rationale: z.string(),
  impact: z.array(z.string()),
  before: JsonObjectSchema.nullable(),
  after: JsonObjectSchema,
  evidence: z.array(WebNovelCandidateEvidenceSchema).max(8).default([]),
  requiresLockedConfirmation: z.boolean(),
  decision: WebNovelCandidateDecisionSchema.nullable(),
});
export type WebNovelCandidateItemDto = z.infer<
  typeof WebNovelCandidateItemSchema
>;

export const WebNovelCandidateSetSchema = z.object({
  id: IdSchema,
  projectId: IdSchema,
  runId: IdSchema,
  stepId: IdSchema,
  kind: WebNovelCandidateKindSchema,
  outlineNodeId: IdSchema.nullable(),
  instruction: z.string(),
  summary: z.string(),
  sourceProfileVersion: z.number().int().nonnegative().nullable(),
  sourceBriefVersion: z.number().int().nonnegative().nullable(),
  sourceDocumentId: IdSchema.nullable(),
  sourceDocumentVersionId: IdSchema.nullable(),
  sourceOutlineUpdatedAt: TimestampSchema.nullable(),
  baseFingerprint: z.string(),
  currentFingerprint: z.string(),
  stale: z.boolean(),
  status: z.enum(["candidate", "partially_applied", "applied", "rejected"]),
  items: z.array(WebNovelCandidateItemSchema),
  createdAt: TimestampSchema,
  decidedAt: TimestampSchema.nullable(),
});
export type WebNovelCandidateSetDto = z.infer<
  typeof WebNovelCandidateSetSchema
>;

export const CreateWebNovelCandidateRequestSchema = z
  .object({
    requestId: z.string().uuid(),
    kind: WebNovelCandidateKindSchema,
    outlineNodeId: IdSchema.nullable().optional(),
    instruction: z.string().trim().min(1).max(20_000),
    origin: RunOriginSchema.nullable().optional(),
  })
  .strict();
export type CreateWebNovelCandidateRequest = z.infer<
  typeof CreateWebNovelCandidateRequestSchema
>;

export const WebNovelCandidateRunAcceptedSchema = z.object({
  runId: IdSchema,
  idempotentReplay: z.boolean(),
});

export const DecideWebNovelCandidateItemRequestSchema = z.object({
  action: z.enum(["apply", "reject"]),
  confirmLocked: z.boolean().default(false),
});
export type DecideWebNovelCandidateItemRequest = z.infer<
  typeof DecideWebNovelCandidateItemRequestSchema
>;

export const DecideWebNovelCandidateItemResponseSchema = z.object({
  candidateSet: WebNovelCandidateSetSchema,
  item: WebNovelCandidateItemSchema,
});
