import { z } from "zod";
import type { JsonSchemaContract, StructuredValidator } from "@narralume/llm";

import {
  BookDirectionSchema,
  BookPackagingSchema,
  BookPositioningSchema,
  OpeningBlueprintSchema,
  OpeningReviewSchema,
  SigningReadinessReportSchema,
  SigningSprintTaskSchema,
} from "@narralume/contracts";
import { ChapterIntentPlanSchema } from "./web-novel-candidate-schemas.js";

const EvaluationSchema = z
  .object({
    strengths: z.array(z.string().trim().min(1).max(2_000)).max(20),
    concerns: z.array(z.string().trim().min(1).max(2_000)).max(20),
    suggestions: z.array(z.string().trim().min(1).max(2_000)).max(20),
    officialMatches: z.array(z.string().trim().min(1).max(2_000)).max(20),
  })
  .strict();

const OpeningReviewPayloadSchema = OpeningReviewSchema;

// Persisted workflows may contain an older, partial opening plan, so the
// shared contract remains backward-compatible.  A newly generated candidate
// must nevertheless always provide the complete three-chapter method.
const OpeningBlueprintCandidateSchema = OpeningBlueprintSchema.extend({
  firstThreeChapters: OpeningBlueprintSchema.shape.firstThreeChapters
    .min(3)
    .max(3),
});

const PackagingPayloadSchema = z
  .object({ candidates: z.array(BookPackagingSchema).min(3).max(5) })
  .strict();

export const SigningSprintModelResultSchema = z
  .object({
    task: SigningSprintTaskSchema,
    summary: z.string().trim().min(1).max(10_000),
    rationale: z.string().trim().min(1).max(10_000),
    payload: z.record(z.string(), z.unknown()),
  })
  .strict()
  .superRefine((value, context) => {
    const schema =
      value.task === "BrainstormBookDirection"
        ? BookDirectionSchema
        : value.task === "RefineBookPositioning"
          ? BookPositioningSchema
          : value.task === "GenerateBookPackaging"
            ? PackagingPayloadSchema
            : value.task === "GenerateOpeningBlueprint"
              ? OpeningBlueprintCandidateSchema
              : value.task === "EvaluateOpening"
                ? OpeningReviewPayloadSchema
                : value.task === "SigningReadinessReview"
                  ? SigningReadinessReportSchema
                  : value.task === "GenerateChapterFromIntent"
                    ? ChapterIntentPlanSchema
                    : EvaluationSchema;
    const parsed = schema.safeParse(value.payload);
    if (!parsed.success) {
      context.addIssue({
        code: "custom",
        path: ["payload"],
        message: parsed.error.issues
          .slice(0, 4)
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; "),
      });
    }
  });
export type SigningSprintModelResult = z.infer<
  typeof SigningSprintModelResultSchema
>;

export const SIGNING_SPRINT_MODEL_CONTRACT: JsonSchemaContract = {
  name: "signing_sprint_candidate",
  description:
    "A reviewable quick-start candidate. It must carry a task, a rationale, and a structured payload; never mutate the project.",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["task", "summary", "rationale", "payload"],
    properties: {
      task: {
        type: "string",
        enum: [
          "BrainstormBookDirection",
          "RefineBookPositioning",
          "EvaluatePositioning",
          "GenerateBookPackaging",
          "EvaluateBookPackaging",
          "GenerateOpeningBlueprint",
          "EvaluateOpening",
          "GenerateChapterFromIntent",
          "SigningReadinessReview",
        ],
      },
      summary: { type: "string", minLength: 1, maxLength: 10_000 },
      rationale: { type: "string", minLength: 1, maxLength: 10_000 },
      payload: { type: "object", additionalProperties: true },
    },
  },
};

export function signingSprintModelValidator(): StructuredValidator<SigningSprintModelResult> {
  return (value) => {
    const parsed = SigningSprintModelResultSchema.safeParse(value);
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
