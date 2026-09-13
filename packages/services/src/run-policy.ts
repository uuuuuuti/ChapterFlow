import {
  EffectivePolicySchema,
  MIN_VIABLE_PARTIAL_CHARACTERS,
  ModelExecutionPolicySchema,
  resolveEffectivePolicy,
  type EffectivePolicy,
  type ModelExecutionPolicy,
  type RunAvailableAction,
} from "@narralume/contracts";
import type { NarrativeRunStep, RunSnapshot } from "@narralume/domain";
import {
  SqliteAssignmentRepository,
  SqliteDocumentRepository,
  type SqliteProjectRepository,
  type SqliteRunRepository,
  type NarrativeDatabase,
} from "@narralume/persistence";

import { ServiceError } from "./service-error.js";

export class RunServiceError extends ServiceError {
  constructor(code: string, message: string, statusCode: number) {
    super(code, message, statusCode);
    this.name = "RunServiceError";
  }
}

/** Keep the order stable so task detail responses and the disabled-action
 * explanation do not jump around as a run changes state. */
const ALL_RUN_ACTIONS: readonly RunAvailableAction[] = [
  "pause",
  "resume",
  "cancel",
  "accept_plan",
  "switch_to_manual",
  "accept_manuscript",
  "request_revision",
  "discard_manuscript",
  "use_partial",
  "regenerate",
  "retry_chapter",
];

export function runProductProjection(
  snapshot: RunSnapshot,
  streamAttempts: readonly {
    stepId: string;
    attempt: number;
    content: string;
    status: "streaming" | "completed" | "interrupted";
    updatedAt: string;
  }[] = [],
  context: {
    parentTask?: { kind: "autopilot"; id: string } | null;
  } = {},
) {
  const succeeded = (kind: NarrativeRunStep["kind"]) =>
    [...snapshot.steps]
      .reverse()
      .find((step) => step.kind === kind && step.status === "succeeded")
      ?.outputArtifact ?? null;
  const reason = latestAwaitReason(snapshot);
  const foundation = succeeded("foundation.stage");
  const webNovel = succeeded("webnovel.stage");
  const canonCandidate = succeeded("canon.stage");
  const edit = succeeded("edit.stage");
  const cocreate = succeeded("cocreate.stage");
  const adoption = succeeded("adoption.commit");
  const imported = succeeded("import.stage");
  const settlement = succeeded("chapter.settle");
  const commit = succeeded("chapter.commit");
  const partial = [...streamAttempts]
    .reverse()
    .find((stream) => stream.status === "interrupted");
  const partialCharacters = partial ? [...partial.content].length : 0;
  let availableActions: RunAvailableAction[] = [];
  if (snapshot.run.status === "awaiting_user") {
    if (reason === "scene_plan_approval_required") {
      availableActions = ["accept_plan", "switch_to_manual", "cancel"];
    } else if (reason === "chapter_commit_approval_required") {
      availableActions = [
        "accept_manuscript",
        "request_revision",
        "discard_manuscript",
        "cancel",
      ];
    } else if (reason === "settlement_conflict_requires_resolution") {
      availableActions = ["cancel"];
    } else if (
      [
        "critical_review_unresolved",
        "critical_deterministic_issue_unresolved",
        "deterministic_quality_gate_blocked",
        "quality_gate_incomplete",
        "quality_gate_blocked",
        "quality_gate_version_mismatch",
        "semantic_review_blocked",
        "revision_limit_reached",
      ].includes(reason ?? "")
    ) {
      availableActions = ["request_revision", "cancel"];
    } else {
      // 未知等待原因一律允许恢复：等待本身已持久化，resume 只是解除停靠。
      availableActions = ["resume", "cancel"];
    }
  } else if (snapshot.run.status === "paused") {
    availableActions = ["resume", "cancel"];
  } else if (snapshot.run.status === "failed_recoverable") {
    availableActions = ["cancel"];
    if (partial) {
      availableActions = ["regenerate", ...availableActions];
      if (partialCharacters >= MIN_VIABLE_PARTIAL_CHARACTERS) {
        availableActions = ["use_partial", ...availableActions];
      }
    }
  } else if (snapshot.run.status === "failed") {
    // 终态 failed 没有可恢复的步骤语义；章节任务的重开入口 = 新建同章节
    // run（与写作台「重试本章」同一语义），其余配方的现场留在运行中心
    // 排查，不给误导性按钮。
    availableActions =
      snapshot.run.recipe === "chapter-production" &&
      snapshot.run.targetOutlineNodeId !== null &&
      !context.parentTask
        ? ["retry_chapter"]
        : [];
  } else if (["pending", "running"].includes(snapshot.run.status)) {
    availableActions = ["pause", "cancel"];
  }
  const actionAvailability = ALL_RUN_ACTIONS.map((action) => ({
    action,
    available: availableActions.includes(action),
    reasonCode: availableActions.includes(action)
      ? null
      : unavailableActionReason(
          action,
          snapshot,
          reason,
          partial,
          partialCharacters,
          context,
        ),
  }));
  return {
    origin: isRecord(snapshot.run.policy.origin)
      ? snapshot.run.policy.origin
      : null,
    result: {
      planCandidate: succeeded("scene.plan"),
      manuscriptCandidate:
        succeeded("revision.generate") ?? succeeded("draft.generate"),
      reviewSummary: succeeded("semantic.review"),
      settlementCandidate: settlement,
      canonChangeSetId:
        committedChangeSetId(snapshot) ??
        stringValue(adoption, "canonChangeSetId"),
      foundationCandidateSetId: stringValue(foundation, "candidateSetId"),
      webNovelCandidateSetId: stringValue(webNovel, "candidateSetId"),
      canonCandidateSetId: stringValue(canonCandidate, "candidateSetId"),
      editProposalId: stringValue(edit, "proposalId"),
      cocreateTurnId: stringValue(cocreate, "turnId"),
      cocreateSwipeId: stringValue(cocreate, "swipeId"),
      sceneAdoptionId: stringValue(adoption, "id"),
      documentId:
        stringValue(commit, "documentId") ??
        stringValue(adoption, "documentId") ??
        stringValue(edit, "documentId"),
      documentVersionId:
        stringValue(commit, "versionId") ??
        stringValue(adoption, "documentVersionId"),
      importBatchId: stringValue(imported, "batchId"),
      partialRecovery: partial
        ? {
            stepId: partial.stepId,
            attempt: partial.attempt,
            characters: partialCharacters,
            canAdopt: partialCharacters >= MIN_VIABLE_PARTIAL_CHARACTERS,
          }
        : null,
    },
    availableActions,
    actionAvailability,
  };
}

function unavailableActionReason(
  action: RunAvailableAction,
  snapshot: RunSnapshot,
  awaitReason: string | null,
  partial:
    | {
        stepId: string;
        attempt: number;
        content: string;
        status: "streaming" | "completed" | "interrupted";
        updatedAt: string;
      }
    | undefined,
  partialCharacters: number,
  context: { parentTask?: { kind: "autopilot"; id: string } | null },
): string {
  const status = snapshot.run.status;
  const terminal = ["completed", "cancelled"].includes(status);

  if (action === "retry_chapter") {
    if (context.parentTask) return "run.retry.parent_task";
    if (
      snapshot.run.recipe !== "chapter-production" ||
      snapshot.run.targetOutlineNodeId === null
    ) {
      return "run.retry.recipe";
    }
    if (status !== "failed") return "run.retry.status";
  }

  if (terminal) return "run.status.terminal";
  if (status === "failed" && action !== "retry_chapter") {
    return "run.status.terminal";
  }
  if (action === "pause") {
    return status === "paused" ? "run.status.not_running" : "run.action.status";
  }
  if (action === "resume") {
    return status === "paused" ? "run.action.status" : "run.status.not_paused";
  }
  if (action === "use_partial" || action === "regenerate") {
    if (status !== "failed_recoverable") return "run.action.status";
    if (!partial) return "run.partial.unavailable";
    if (
      action === "use_partial" &&
      partialCharacters < MIN_VIABLE_PARTIAL_CHARACTERS
    ) {
      return "run.partial.not_viable";
    }
  }
  if (status === "awaiting_user") {
    return awaitReason ? "run.await_reason.mismatch" : "run.action.status";
  }
  return "run.action.status";
}

export function requireWritingAssignment(
  database: NarrativeDatabase,
  environment: Readonly<Record<string, string | undefined>>,
): void {
  const resolved = new SqliteAssignmentRepository(database).resolve("writing");
  if (!resolved) {
    throw new RunServiceError(
      "model.assignment.unavailable",
      "Configure an available default generation model first",
      422,
    );
  }
  if (!credentialConfigured(resolved.provider.credentialRef, environment)) {
    throw new RunServiceError(
      "model.credential.missing",
      "The model configuration is missing a server-side API key",
      422,
    );
  }
}

/**
 * Non-throwing probe for background features that must never block manual
 * writing when no model is configured (e.g. auto settlement runs).
 */
export function hasWritingAssignment(
  database: NarrativeDatabase,
  environment: Readonly<Record<string, string | undefined>>,
): boolean {
  const resolved = new SqliteAssignmentRepository(database).resolve("writing");
  return (
    Boolean(resolved) &&
    credentialConfigured(resolved!.provider.credentialRef, environment)
  );
}

/**
 * Builds the persisted run.policy: known ModelExecutionPolicy fields are
 * split out and fully resolved via resolveEffectivePolicy, everything else
 * (chapterApproved, sessionId, recipe-specific knobs like
 * replyMaxOutputTokens, …) is kept as runtime metadata alongside the
 * effective policy. explicitPolicyFields preserves which values the caller
 * actually supplied so provider timeout defaults are not shadowed by policy
 * defaults during dispatch.
 */
export function withRuntimeModelPolicy(
  policy: Readonly<Record<string, unknown>>,
  environment: Readonly<Record<string, string | undefined>>,
): Readonly<Record<string, unknown>> {
  if (
    EffectivePolicySchema.safeParse(policy).success &&
    Array.isArray(policy.explicitPolicyFields)
  )
    return policy;
  const policyInput: Record<string, unknown> = {};
  const runtimeFields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(policy)) {
    if (value === undefined) continue;
    if (key in ModelExecutionPolicySchema.shape) policyInput[key] = value;
    else runtimeFields[key] = value;
  }
  const { effectivePolicy } = resolveEffectivePolicy(
    policyInput as ModelExecutionPolicy,
  );
  const pricing = parsePricing(environment.NARRATIVE_MODEL_PRICING_JSON);
  return {
    ...effectivePolicy,
    ...runtimeFields,
    explicitPolicyFields: Object.keys(policyInput).sort(),
    ...(pricing && runtimeFields.modelPricingUsdPerMillion === undefined
      ? { modelPricingUsdPerMillion: pricing }
      : {}),
  };
}

/**
 * Recovers the effective policy persisted inside run.policy. Returns null for
 * runs created before policy resolution was introduced.
 */
export function extractEffectivePolicy(
  policy: Readonly<Record<string, unknown>>,
): EffectivePolicy | null {
  const parsed = EffectivePolicySchema.safeParse(policy);
  return parsed.success ? parsed.data : null;
}

/**
 * Flags missing optional model capabilities at run creation so the UI can
 * nudge setup without blocking the run. Embedding intentionally has no
 * implicit fallback to the generation model.
 */
export function computeSetupHint(
  assignments: SqliteAssignmentRepository,
): "embedding_not_configured" | undefined {
  const embeddingConfigured = assignments.resolve("embedding") !== null;
  if (!embeddingConfigured) return "embedding_not_configured";
  return undefined;
}

/**
 * Run-scoped access must prove the caller's project context: a run id from
 * another project is indistinguishable from a missing run (404), so
 * cross-project detail reads and control actions are both rejected.
 */
export function requireRunInProject(
  runs: SqliteRunRepository,
  runId: string,
  projectId: string,
  projects?: SqliteProjectRepository,
): RunSnapshot {
  const snapshot = runs.getSnapshot(runId);
  if (
    snapshot.run.projectId !== projectId ||
    (projects !== undefined && projects.get(projectId) === null)
  ) {
    throw new RunServiceError("run.not_found", "Run not found", 404);
  }
  return snapshot;
}

export function requireAwaitReason(
  snapshot: RunSnapshot,
  expected: string,
): void {
  if (
    snapshot.run.status !== "awaiting_user" ||
    latestAwaitReason(snapshot) !== expected
  ) {
    throw new RunServiceError(
      "run.action.not_available",
      `The run cannot perform this action right now; expected await reason: ${expected}`,
      409,
    );
  }
}

/**
 * The browser checks the draft before showing an approval action, but the
 * server must repeat that check immediately before turning the approval into
 * a commit permission. This keeps a second tab or a direct API caller from
 * approving an AI manuscript over a newer local draft.
 */
export function requireManuscriptAcceptanceSafe(
  database: NarrativeDatabase,
  snapshot: RunSnapshot,
): void {
  const context =
    [...snapshot.steps]
      .reverse()
      .find(
        (step) =>
          step.kind === "context.compile" && step.status === "succeeded",
      )?.outputArtifact ?? null;
  const documents = new SqliteDocumentRepository(database);
  const documentId = stringValue(context, "baseDocumentId");
  const document = documentId
    ? documents.get(snapshot.run.projectId, documentId)
    : snapshot.run.targetOutlineNodeId
      ? documents.getByOutlineNodeId(
          snapshot.run.projectId,
          snapshot.run.targetOutlineNodeId,
        )
      : null;
  if (!document) return;

  const expectedVersionId = stringValue(context, "baseVersionId");
  if (context && document.currentVersionId !== expectedVersionId) {
    throw new RunServiceError(
      "run.accept_manuscript.version_conflict",
      "The manuscript changed while this task was running; refresh the chapter before accepting it",
      409,
    );
  }

  const draft = documents.getDraft(snapshot.run.projectId, document.id);
  if (!draft) return;
  const base = expectedVersionId
    ? documents.getVersion(
        snapshot.run.projectId,
        document.id,
        expectedVersionId,
      )
    : null;
  const draftMatchesBase = Boolean(
    context &&
    base &&
    draft.baseVersionId === expectedVersionId &&
    draft.contentHash === base.contentHash,
  );
  if (!draftMatchesBase) {
    throw new RunServiceError(
      "run.accept_manuscript.draft.conflict",
      "The manuscript has a newer local draft; save or discard it before accepting this task",
      409,
    );
  }
}

export function requireViablePartial(content: string): void {
  if ([...content].length < MIN_VIABLE_PARTIAL_CHARACTERS) {
    throw new RunServiceError(
      "run.stream.too_short",
      `The partial manuscript is shorter than ${MIN_VIABLE_PARTIAL_CHARACTERS} characters; it can only be discarded or regenerated`,
      422,
    );
  }
}

export function isTerminalSessionStatus(status: string): boolean {
  return ["completed", "cancelled"].includes(status);
}

export function latestAwaitReason(snapshot: RunSnapshot): string | null {
  const event = [...snapshot.events]
    .reverse()
    .find((candidate) => candidate.type === "run.awaiting_user");
  return typeof event?.payload.reason === "string"
    ? event.payload.reason
    : null;
}

export function committedChangeSetId(snapshot: RunSnapshot): string | null {
  const output = [...snapshot.steps]
    .reverse()
    .find(
      (step) => step.kind === "chapter.commit" && step.status === "succeeded",
    )?.outputArtifact;
  return typeof output?.changeSetId === "string" ? output.changeSetId : null;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function credentialConfigured(
  credentialRef: string,
  environment: Readonly<Record<string, string | undefined>>,
): boolean {
  const ref = credentialRef;
  if (ref.startsWith("env:")) {
    return Boolean(environment[ref.slice("env:".length)]?.trim());
  }
  return ref.trim().length > 0;
}

function stringValue(
  value: Readonly<Record<string, unknown>> | null,
  key: string,
): string | null {
  return typeof value?.[key] === "string" ? value[key] : null;
}

function parsePricing(
  value: string | undefined,
): Record<string, unknown> | null {
  if (!value?.trim()) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
