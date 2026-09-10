import { WebNovelCandidateEvidenceSchema } from "@narralume/contracts";
import type { JsonSchemaContract, StructuredValidator } from "@narralume/llm";
import { z } from "zod";

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
