import {
  CreateCanonEntityRequestSchema,
  UpdateCompassRequestSchema,
  resolveEffectivePolicy,
  type EffectivePolicy,
  type ModelExecutionPolicy,
} from "@narralume/contracts";
import {
  createCanonEntity,
  effectiveManuscriptCharacterCount,
} from "@narralume/domain";
import type {
  AutopilotRunLink,
  AutopilotSession,
  RunSnapshot,
} from "@narralume/domain";
import { buildFoundationRecipe } from "@narralume/harness";
import {
  type SqliteAutomationRepository,
  type SqliteCanonRepository,
  type SqliteDocumentRepository,
  type SqliteProjectRepository,
  type SqliteReviewRepository,
  type SqliteRunRepository,
  type SqliteStoryRepository,
  type NarrativeDatabase,
} from "@narralume/persistence";
import { z } from "zod";

import { randomUuid } from "./internal/crypto.js";
import {
  isRecord,
  runProductProjection,
  withRuntimeModelPolicy,
} from "./run-policy.js";
import { ServiceError } from "./service-error.js";

export class AutomationServiceError extends ServiceError {
  constructor(code: string, message: string, statusCode: number) {
    super(code, message, statusCode);
    this.name = "AutomationServiceError";
  }
}

const REVIEW_BLOCK_REASONS = new Set([
  "semantic_review_blocked",
  "quality_gate_blocked",
]);

const REVIEW_REPAIR_REASONS = new Set([
  "critical_review_unresolved",
  "critical_deterministic_issue_unresolved",
  "deterministic_quality_gate_blocked",
  "quality_gate_incomplete",
  "quality_gate_version_mismatch",
  "revision_limit_reached",
]);

const IntentCandidatePayloadSchema = z.object({
  promise: z.string().min(1),
  themes: z.array(z.string()),
  audience: z.string().nullable(),
  tone: z.string().nullable(),
  boundaries: z.array(z.string()),
  endingDirection: z.string().nullable(),
  currentFocus: z.string().nullable(),
});

const FoundationPlanCandidatePayloadSchema = z.object({
  key: z.string().trim().min(1),
  title: z.string().min(1),
  rationale: z.string().min(1),
  angle: z.string().min(1),
  riskNotes: z.array(z.string()),
  intent: IntentCandidatePayloadSchema,
  compass: UpdateCompassRequestSchema,
  entities: z.array(CreateCanonEntityRequestSchema).min(1),
  baseline: z.object({
    intentUpdatedAt: z.string().nullable(),
    compassVersion: z.number().int().nonnegative().nullable(),
  }),
});

/** 从会话 chapterPolicy 还原生效策略（含创建时显式字段与停靠模式）。 */
export function resolveSessionEffectivePolicy(
  session: Pick<AutopilotSession, "chapterPolicy">,
): EffectivePolicy & {
  explicitPolicyFields?: string[];
  planningMode?: "auto" | "confirm";
  origin?: Readonly<Record<string, unknown>> | null;
} {
  const effectivePolicy = resolveEffectivePolicy(
    session.chapterPolicy as ModelExecutionPolicy,
  ).effectivePolicy;
  // chapterPolicy 的运行时字段是宽松 Record，这里逐字段校形后收窄。
  const raw = session.chapterPolicy as Readonly<Record<string, unknown>>;
  const explicitPolicyFields: string[] | undefined = Array.isArray(
    raw.explicitPolicyFields,
  )
    ? (raw.explicitPolicyFields as string[])
    : undefined;
  const planningMode: "auto" | "confirm" | undefined =
    raw.planningMode === "auto" || raw.planningMode === "confirm"
      ? raw.planningMode
      : undefined;
  const origin: Readonly<Record<string, unknown>> | null | undefined = isRecord(
    raw.origin,
  )
    ? raw.origin
    : raw.origin === null
      ? null
      : undefined;
  const resolved: EffectivePolicy & {
    explicitPolicyFields?: string[];
    planningMode?: "auto" | "confirm";
    origin?: Readonly<Record<string, unknown>> | null;
  } = { ...effectivePolicy };
  if (explicitPolicyFields)
    resolved.explicitPolicyFields = explicitPolicyFields;
  if (planningMode) resolved.planningMode = planningMode;
  if (origin !== undefined) resolved.origin = origin;
  return resolved;
}

export function createFoundationRun(input: {
  runs: SqliteRunRepository;
  runId: string;
  projectId: string;
  rootOutlineNodeId: string | null;
  braindump: string;
  preferences: Readonly<Record<string, unknown>>;
  policy: Readonly<Record<string, unknown>>;
  origin?: {
    surface: string;
    documentId: string | null;
    selection: { start: number; end: number } | null;
  };
  environment: Readonly<Record<string, string | undefined>>;
  now: string;
}) {
  const recipe = buildFoundationRecipe(input.runId);
  return input.runs.create({
    id: input.runId,
    projectId: input.projectId,
    recipe: recipe.name,
    recipeVersion: recipe.version,
    mode: "manual",
    targetOutlineNodeId: input.rootOutlineNodeId,
    policy: withRuntimeModelPolicy(
      {
        // Foundation returns three comparable plans in one structured value.
        // Keep the run's context/output ceiling aligned with the configured
        // DeepSeek-V4-Flash channel; the old 16K/8K pair truncated valid JSON
        // before the candidate set could be staged.
        contextWindow: 128_000,
        foundationMaxOutputTokens: 32_000,
        ...input.policy,
        braindump: input.braindump,
        preferences: input.preferences,
        origin: input.origin ?? {
          surface: "autopilot",
          documentId: null,
          selection: null,
        },
      },
      input.environment,
    ),
    steps: recipe.steps,
    now: input.now,
  });
}

export function resolveSessionFailure(
  automation: SqliteAutomationRepository,
  runs: SqliteRunRepository,
  story: SqliteStoryRepository,
  reviews: SqliteReviewRepository,
  sessionId: string,
  action: "retry-current" | "skip-chapter" | "replan" | "stop",
): void {
  const session = automation.requireSession(sessionId);
  const now = new Date().toISOString();
  const link = session.currentRunId
    ? automation.findRunLink(session.currentRunId)
    : ([...automation.listRunLinks(sessionId)]
        .reverse()
        .find(
          (candidate) =>
            (candidate.role === "chapter" ||
              candidate.role === "closing-review") &&
            ["failed", "completed"].includes(candidate.outcome ?? "") &&
            (candidate.role === "chapter" ||
              session.lastError?.code === "batch_review.blocked" ||
              session.lastError?.code === "batch_review.missing" ||
              session.lastError?.runId === candidate.runId),
        ) ?? null);
  const isClosingReview = link?.role === "closing-review";
  if (isClosingReview && !session.currentRunId) {
    if (!["retry-current", "replan", "stop"].includes(action)) {
      throw new AutomationServiceError(
        "autopilot.resolution.unsafe",
        "A blocked batch review can only be retried, replanned, or stopped",
        409,
      );
    }
    if (action === "retry-current" && link) {
      // A completed blocking review has already been processed. Mark only the
      // link outcome so the next coordinator pass can create a new review;
      // the original run, artifact, and evidence remain immutable history.
      automation.reopenClosingReview(sessionId, link.runId, now);
    }
    if (action === "stop") {
      automation.setSessionStatus(sessionId, "cancelled", now, {
        code: "session.stopped",
      });
      return;
    }
    if (action === "replan") {
      automation.requestSessionControl(sessionId, "replan", now);
    }
    automation.setSessionStatus(sessionId, "running", now);
    return;
  }
  if (session.currentRunId) {
    const child = runs.getSnapshot(session.currentRunId).run;
    if (
      !["failed", "cancelled", "awaiting_user", "paused"].includes(child.status)
    ) {
      throw new AutomationServiceError(
        "autopilot.resolution.unsafe",
        "A resolution is only allowed when the chapter has failed, is paused, or is waiting for the author",
        409,
      );
    }
    if (!["failed", "cancelled", "completed"].includes(child.status)) {
      runs.setRunStatus(child.id, "cancelled", now, "session_resolved");
    }
    reviews.supersedeRunRevisionProposals(child.id, now);
    automation.markRunProcessed(sessionId, child.id, action, now);
  }
  if (link?.outlineNodeId && !isClosingReview) {
    story.updateOutlineStatus(
      session.projectId,
      link.outlineNodeId,
      action === "skip-chapter" || action === "replan"
        ? "abandoned"
        : "planned",
      now,
    );
  }
  if (action === "stop") {
    automation.setSessionStatus(sessionId, "cancelled", now, {
      code: "session.stopped",
    });
    return;
  }
  if (action === "skip-chapter" && !isClosingReview) {
    automation.recordChapterOutcome(sessionId, "skipped", now);
  }
  if (action === "replan") {
    automation.requestSessionControl(sessionId, "replan", now);
  }
  automation.setSessionStatus(sessionId, "running", now);
}

/** Requests cancellation for an active child and completes parked sessions
 * immediately. Returns the run that should be interrupted when work is active. */
export function requestSessionCancellation(
  automation: SqliteAutomationRepository,
  runs: SqliteRunRepository,
  story: SqliteStoryRepository,
  reviews: SqliteReviewRepository,
  sessionId: string,
  now: string,
): string | null {
  const session = automation.requireSession(sessionId);
  if (["completed", "cancelled"].includes(session.status)) return null;
  automation.requestSessionControl(sessionId, "cancel", now);
  if (!session.currentRunId) {
    automation.setSessionStatus(sessionId, "cancelled", now);
    return null;
  }
  const child = runs.getSnapshot(session.currentRunId).run;
  reviews.supersedeRunRevisionProposals(child.id, now);
  if (child.status === "running") {
    if (!child.cancelRequested) runs.requestCancel(child.id, now);
    return child.id;
  }
  if (!["failed", "cancelled", "completed"].includes(child.status)) {
    runs.setRunStatus(child.id, "cancelled", now, "session_cancelled");
  }
  const outcome = child.status === "completed" ? "completed" : "cancelled";
  automation.markRunProcessed(sessionId, child.id, outcome, now);
  const link = automation.findRunLink(child.id);
  if (link?.role === "chapter" && link.outlineNodeId) {
    if (child.status === "completed") {
      automation.recordChapterOutcome(sessionId, "completed", now);
    } else {
      story.updateOutlineStatus(
        session.projectId,
        link.outlineNodeId,
        "planned",
        now,
      );
    }
  }
  automation.setSessionStatus(sessionId, "cancelled", now);
  return null;
}

/**
 * 采纳地基候选：intent/compass 走基线防覆盖检查（生成后人工改过的内容
 * 不被旧候选覆盖），canon 实体按 (type,name) 去重插入。editedPayload 为
 * 用户在采纳前编辑过的载荷；不传则用候选当前载荷。
 */
export function adoptCandidate(
  database: NarrativeDatabase,
  automation: SqliteAutomationRepository,
  projects: SqliteProjectRepository,
  story: SqliteStoryRepository,
  canon: SqliteCanonRepository,
  candidateId: string,
  editedPayload?: Readonly<Record<string, unknown>>,
  expectedUpdatedAt?: string,
) {
  return database.transaction(() => {
    const candidate = automation.requireCandidate(candidateId);
    if (candidate.status !== "pending") return candidate;
    if (
      expectedUpdatedAt !== undefined &&
      candidate.updatedAt !== expectedUpdatedAt
    ) {
      throw new AutomationServiceError(
        "foundation_candidate.version.conflict",
        "The foundation candidate changed after it was opened; refresh before deciding",
        409,
      );
    }
    const payload =
      editedPayload ?? candidate.editedPayload ?? candidate.payload;
    const now = new Date().toISOString();
    let adoptedRefType: string;
    let adoptedRefId: string;
    if (candidate.kind === "plan") {
      const input = FoundationPlanCandidatePayloadSchema.parse(payload);
      const currentIntent = story.getAuthorIntent(candidate.projectId);
      const currentCompass = automation.getCompass(candidate.projectId);
      // A plan is one atomic route through the foundation. Both source
      // documents must still match the generation baseline before any part
      // of the route is written.
      if (
        (currentIntent?.updatedAt ?? null) !==
        baselineValue(candidate.payload, "intentUpdatedAt")
      ) {
        throw new AutomationServiceError(
          "foundation_candidate.intent.stale",
          "The author intent changed after the plan was generated; keep the current content and regenerate the plans",
          409,
        );
      }
      if (
        (currentCompass?.version ?? null) !==
        baselineValue(candidate.payload, "compassVersion")
      ) {
        throw new AutomationServiceError(
          "foundation_candidate.compass.stale",
          "The story compass changed after the plan was generated; keep the current content and regenerate the plans",
          409,
        );
      }
      const locked = new Set(currentIntent?.lockedFields ?? []);
      story.upsertAuthorIntent({
        projectId: candidate.projectId,
        promise: locked.has("promise")
          ? (currentIntent?.promise ?? null)
          : input.intent.promise,
        themes: locked.has("themes")
          ? (currentIntent?.themes ?? [])
          : input.intent.themes,
        audience: locked.has("audience")
          ? (currentIntent?.audience ?? null)
          : input.intent.audience,
        tone: locked.has("tone")
          ? (currentIntent?.tone ?? null)
          : input.intent.tone,
        boundaries: locked.has("boundaries")
          ? (currentIntent?.boundaries ?? [])
          : input.intent.boundaries,
        endingDirection: locked.has("endingDirection")
          ? (currentIntent?.endingDirection ?? null)
          : input.intent.endingDirection,
        currentFocus: locked.has("currentFocus")
          ? (currentIntent?.currentFocus ?? null)
          : input.intent.currentFocus,
        lockedFields: currentIntent?.lockedFields ?? [],
        updatedAt: now,
      });
      automation.upsertCompass({
        projectId: candidate.projectId,
        ...input.compass,
        version: currentCompass?.version ?? 1,
        updatedAt: now,
      });
      for (const entityInput of input.entities) {
        const existing = canon
          .listEntities(candidate.projectId, { includeRetired: true })
          .find(
            (entity) =>
              entity.type === entityInput.type &&
              entity.name === entityInput.name,
          );
        if (!existing) {
          canon.insertEntity(
            createCanonEntity({
              id: randomUuid(),
              projectId: candidate.projectId,
              type: entityInput.type,
              name: entityInput.name,
              aliases: entityInput.aliases,
              description: entityInput.description ?? null,
              attributes: entityInput.attributes,
              now,
            }),
          );
        }
      }
      adoptedRefType = "foundation_plan";
      adoptedRefId = candidate.id;
      const project = projects.get(candidate.projectId);
      if (!project) {
        throw new AutomationServiceError(
          "project.not_found",
          "Project not found",
          404,
        );
      }
      if (project.phase === "idea") {
        projects.update({ ...project, phase: "foundation", updatedAt: now });
      }
      const adopted = automation.resolveCandidate(candidateId, {
        status: "adopted",
        ...(editedPayload ? { editedPayload } : {}),
        adoptedRefType,
        adoptedRefId,
        ...(expectedUpdatedAt ? { expectedUpdatedAt } : {}),
        now,
      });
      // Comparable plans are mutually exclusive. Resolving one closes the
      // remaining routes so another tab cannot later commit a second world.
      automation.discardPendingCandidates(candidate.setId, now);
      return adopted;
    } else if (candidate.kind === "intent") {
      const input = IntentCandidatePayloadSchema.parse(payload);
      const current = story.getAuthorIntent(candidate.projectId);
      // 候选保存了生成时的意图基线；生成后人工修改过的意图不能被旧候选覆盖。
      if (
        (current?.updatedAt ?? null) !==
        baselineValue(candidate.payload, "intentUpdatedAt")
      ) {
        throw new AutomationServiceError(
          "foundation_candidate.intent.stale",
          "The author intent changed after the candidate was generated; keep the current content and regenerate the candidate",
          409,
        );
      }
      const locked = new Set(current?.lockedFields ?? []);
      story.upsertAuthorIntent({
        projectId: candidate.projectId,
        promise: locked.has("promise")
          ? (current?.promise ?? null)
          : input.promise,
        themes: locked.has("themes") ? (current?.themes ?? []) : input.themes,
        audience: locked.has("audience")
          ? (current?.audience ?? null)
          : input.audience,
        tone: locked.has("tone") ? (current?.tone ?? null) : input.tone,
        boundaries: locked.has("boundaries")
          ? (current?.boundaries ?? [])
          : input.boundaries,
        endingDirection: locked.has("endingDirection")
          ? (current?.endingDirection ?? null)
          : input.endingDirection,
        currentFocus: locked.has("currentFocus")
          ? (current?.currentFocus ?? null)
          : input.currentFocus,
        lockedFields: current?.lockedFields ?? [],
        updatedAt: now,
      });
      adoptedRefType = "author_intent";
      adoptedRefId = candidate.projectId;
    } else if (candidate.kind === "compass") {
      const input = UpdateCompassRequestSchema.parse(payload);
      const currentCompass = automation.getCompass(candidate.projectId);
      // 候选保存了生成时的指南针版本；生成后人工修改过的指南针不能被旧候选覆盖。
      if (
        (currentCompass?.version ?? null) !==
        baselineValue(candidate.payload, "compassVersion")
      ) {
        throw new AutomationServiceError(
          "foundation_candidate.compass.stale",
          "The story compass changed after the candidate was generated; keep the current content and regenerate the candidate",
          409,
        );
      }
      const compass = automation.upsertCompass({
        projectId: candidate.projectId,
        ...input,
        version: currentCompass?.version ?? 1,
        updatedAt: now,
      });
      adoptedRefType = "story_compass";
      adoptedRefId = compass.projectId;
    } else {
      const input = CreateCanonEntityRequestSchema.parse(payload);
      const existing = canon
        .listEntities(candidate.projectId, { includeRetired: true })
        .find(
          (entity) => entity.type === input.type && entity.name === input.name,
        );
      const entity =
        existing ??
        canon.insertEntity(
          createCanonEntity({
            id: randomUuid(),
            projectId: candidate.projectId,
            type: input.type,
            name: input.name,
            aliases: input.aliases,
            description: input.description ?? null,
            attributes: input.attributes,
            now,
          }),
        );
      adoptedRefType = "canon_entity";
      adoptedRefId = entity.id;
    }
    const project = projects.get(candidate.projectId);
    if (!project) {
      throw new AutomationServiceError(
        "project.not_found",
        "Project not found",
        404,
      );
    }
    if (project.phase === "idea") {
      projects.update({ ...project, phase: "foundation", updatedAt: now });
    }
    return automation.resolveCandidate(candidateId, {
      status: "adopted",
      ...(editedPayload ? { editedPayload } : {}),
      adoptedRefType,
      adoptedRefId,
      ...(expectedUpdatedAt ? { expectedUpdatedAt } : {}),
      now,
    });
  });
}

export function sessionProductProjection(
  session: AutopilotSession,
  runs: SqliteRunRepository,
  story: SqliteStoryRepository,
  links: readonly AutopilotRunLink[] = [],
  documents?: SqliteDocumentRepository,
) {
  const child = session.currentRunId
    ? runs.getSnapshot(session.currentRunId)
    : null;
  const currentNode = session.currentOutlineNodeId
    ? story.getOutlineNode(session.projectId, session.currentOutlineNodeId)
    : null;
  const stopReason = sessionStopReason(session, child);
  const availableActions = sessionAvailableActions(
    session.status,
    stopReason,
    child?.run.status ?? null,
  );
  // A retry or an author-requested revision deliberately keeps every run link
  // as audit history, but the product projection must show one effective row
  // per outline chapter.  Rendering the raw links made one chapter appear as
  // several chapters in the continuous-creation page and inflated its batch
  // counters.  The newest link is the current attempt; the helper still uses
  // older links to report the retry count.
  const latestChapterLinks = new Map<string, AutopilotRunLink>();
  for (const link of links) {
    if (link.role !== "chapter") continue;
    const key = link.outlineNodeId ?? `run:${link.runId}`;
    const previous = latestChapterLinks.get(key);
    if (!previous || link.sequence > previous.sequence) {
      latestChapterLinks.set(key, link);
    }
  }
  const chapterResults = [...latestChapterLinks.values()]
    .sort((left, right) => left.sequence - right.sequence)
    .map((link) => projectChapterResult(session, link, links, runs, documents));
  const latestBatchReview =
    [...links]
      .filter((link) => link.role === "closing-review")
      .sort((left, right) => right.sequence - left.sequence)
      .map((link) =>
        runs.getRun(link.runId) ? runs.getSnapshot(link.runId) : null,
      )
      .filter((snapshot): snapshot is NonNullable<typeof snapshot> =>
        Boolean(snapshot),
      )
      .map(
        (snapshot) =>
          [...snapshot.steps]
            .reverse()
            .find(
              (step) =>
                step.kind === "batch.review" && step.status === "succeeded",
            )?.outputArtifact ?? null,
      )
      .find((artifact): artifact is Record<string, unknown> =>
        Boolean(artifact),
      ) ?? null;
  const currentBatchEvidence = documents
    ? currentFirstFiveEvidence(session, story, documents)
    : null;
  const batchReview =
    latestBatchReview &&
    currentBatchEvidence &&
    !sameBatchEvidence(latestBatchReview.chapters, currentBatchEvidence)
      ? { ...latestBatchReview, stale: true }
      : latestBatchReview;
  return {
    origin: isRecord(session.chapterPolicy.origin)
      ? session.chapterPolicy.origin
      : null,
    approvalMode: session.mode === "autopilot" ? "continuous" : "per_chapter",
    currentChapter: currentNode
      ? {
          id: currentNode.id,
          title: currentNode.title,
          runId: session.currentRunId,
        }
      : null,
    stopReason,
    availableActions,
    chapterResults,
    batchReview,
  };
}

function projectChapterResult(
  session: AutopilotSession,
  link: AutopilotRunLink,
  links: readonly AutopilotRunLink[],
  runs: SqliteRunRepository,
  documents?: SqliteDocumentRepository,
) {
  const snapshot = runs.getRun(link.runId)
    ? runs.getSnapshot(link.runId)
    : null;
  const manuscript = snapshot
    ? ([...snapshot.steps]
        .reverse()
        .find(
          (step) =>
            step.status === "succeeded" &&
            (step.kind === "revision.generate" ||
              step.kind === "draft.generate"),
        )?.outputArtifact ?? null)
    : null;
  const review = snapshot
    ? ([...snapshot.steps]
        .reverse()
        .find(
          (step) =>
            step.status === "succeeded" &&
            (step.kind === "semantic.review" ||
              step.kind === "deterministic.check"),
        )?.outputArtifact ?? null)
    : null;
  const currentDocument =
    documents && link.outlineNodeId
      ? documents.getByOutlineNodeId(session.projectId, link.outlineNodeId)
      : null;
  const currentVersion = currentDocument?.currentVersionId
    ? documents?.getVersion(
        session.projectId,
        currentDocument.id,
        currentDocument.currentVersionId,
      )
    : null;
  const actualWords = currentVersion
    ? effectiveManuscriptCharacterCount(currentVersion.content)
    : manuscript
      ? (numberField(manuscript, "characters") ??
        (typeof manuscript.content === "string"
          ? effectiveManuscriptCharacterCount(manuscript.content)
          : null))
      : null;
  const scores = review ? numericScores(review.scores) : [];
  const checkScore = scores.length
    ? Math.round(
        (scores.reduce((sum, value) => sum + value, 0) / scores.length) * 10,
      ) / 10
    : null;
  const qualityVerdict = review ? stringField(review, "verdict") : null;
  const targetWords = numberField(
    session.chapterPolicy,
    "targetWordsPerChapter",
  );
  const previousAttempts = links.filter(
    (candidate) =>
      candidate.role === "chapter" &&
      candidate.outlineNodeId === link.outlineNodeId &&
      candidate.sequence < link.sequence,
  ).length;
  const stepRetries = snapshot
    ? snapshot.steps.reduce(
        (sum, step) => sum + Math.max(0, step.attempt - 1),
        0,
      )
    : 0;
  const error = snapshot
    ? ([...snapshot.steps].reverse().find((step) => step.error)?.error ?? null)
    : null;
  const actionAvailability = snapshot
    ? runProductProjection(snapshot, [], {
        parentTask: { kind: "autopilot", id: session.id },
      }).actionAvailability
    : [];
  return {
    runId: link.runId,
    outlineNodeId: link.outlineNodeId,
    sequence: link.sequence,
    status: link.outcome ?? snapshot?.run.status ?? "pending",
    targetWords,
    actualWords,
    checkScore,
    qualityVerdict:
      qualityVerdict === "pass" ||
      qualityVerdict === "revise" ||
      qualityVerdict === "block"
        ? qualityVerdict
        : null,
    retryCount: previousAttempts + stepRetries,
    error,
    actionAvailability,
  };
}

type CurrentBatchEvidence = {
  outlineNodeId: string;
  documentId: string;
  versionId: string;
  contentHash: string;
};

function currentFirstFiveEvidence(
  session: AutopilotSession,
  story: SqliteStoryRepository,
  documents: SqliteDocumentRepository,
): CurrentBatchEvidence[] | null {
  const chapters = story
    .listOutline(session.projectId)
    .filter((node) => node.kind === "chapter")
    .slice(0, 5);
  if (chapters.length !== 5) return null;
  const evidence: CurrentBatchEvidence[] = [];
  for (const chapter of chapters) {
    const document = documents.getByOutlineNodeId(
      session.projectId,
      chapter.id,
    );
    if (!document?.currentVersionId) return null;
    const version = documents.getVersion(
      session.projectId,
      document.id,
      document.currentVersionId,
    );
    if (!version) return null;
    evidence.push({
      outlineNodeId: chapter.id,
      documentId: document.id,
      versionId: version.id,
      contentHash: version.contentHash,
    });
  }
  return evidence;
}

function sameBatchEvidence(
  value: unknown,
  expected: readonly CurrentBatchEvidence[],
): boolean {
  if (!Array.isArray(value) || value.length !== expected.length) return false;
  return value.every((entry, index) => {
    if (!isRecord(entry)) return false;
    const wanted = expected[index];
    if (!wanted) return false;
    return (
      entry.outlineNodeId === wanted.outlineNodeId &&
      entry.documentId === wanted.documentId &&
      entry.versionId === wanted.versionId &&
      entry.contentHash === wanted.contentHash
    );
  });
}

function numberField(
  record: Readonly<Record<string, unknown>>,
  key: string,
): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringField(
  record: Readonly<Record<string, unknown>>,
  key: string,
): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function numericScores(value: unknown): number[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.values(value).filter(
    (score): score is number =>
      typeof score === "number" && Number.isFinite(score),
  );
}

/** The parent session owns its parked reason. The child may later be paused or
 * cancelled, so reading only its newest status event can replace the decision
 * the author was originally asked to make. */
export function sessionStopReason(
  session: AutopilotSession,
  child: RunSnapshot | null,
): string | null {
  const errorCode =
    typeof session.lastError?.code === "string" ? session.lastError.code : null;
  const parkedReason =
    typeof session.lastError?.reason === "string"
      ? session.lastError.reason
      : null;
  if (session.status === "awaiting_user" && parkedReason) return parkedReason;
  if (errorCode === "child.fatal") return errorCode;
  return child ? latestRunReason(child) : errorCode;
}

export function sessionAvailableActions(
  status: AutopilotSession["status"],
  stopReason: string | null,
  childStatus: RunSnapshot["run"]["status"] | null = null,
): string[] {
  if (["pending", "planning", "running"].includes(status)) {
    return ["pause", "cancel"];
  }
  if (status === "paused") return ["resume", "cancel"];
  if (status === "failed") {
    return ["retry-current", "skip-chapter", "replan", "stop"];
  }
  if (status !== "awaiting_user") return [];
  if (stopReason === "child.fatal") {
    return ["retry-current", "skip-chapter", "replan", "stop"];
  }
  if (stopReason === "chapter_commit_approval_required") {
    return ["accept_manuscript", "request_revision", "cancel"];
  }
  if (
    stopReason === "batch_review.blocked" ||
    stopReason === "batch_review.missing"
  ) {
    return ["retry-current", "cancel"];
  }
  if (stopReason && REVIEW_BLOCK_REASONS.has(stopReason)) {
    if (["failed", "cancelled"].includes(childStatus ?? "")) {
      return ["retry-current", "cancel"];
    }
    return [
      "keep_manuscript",
      ...(childStatus === "paused" ? [] : ["request_revision"]),
      "retry-current",
      "cancel",
    ];
  }
  if (stopReason && REVIEW_REPAIR_REASONS.has(stopReason)) {
    return ["request_revision", "retry-current", "cancel"];
  }
  if (stopReason === "scene_plan_approval_required") {
    return ["accept_plan", "cancel"];
  }
  return ["cancel"];
}

export function currentBlockingReview(
  session: AutopilotSession,
  runs: SqliteRunRepository,
  reviews: SqliteReviewRepository,
) {
  if (!session.currentRunId) return null;
  const snapshot = runs.getSnapshot(session.currentRunId);
  const reason = sessionStopReason(session, snapshot);
  if (!reason || !REVIEW_BLOCK_REASONS.has(reason)) return null;
  return (
    [...reviews.listReports(snapshot.run.id)]
      .reverse()
      .find((report) => report.verdict === "block") ?? null
  );
}

export function keepBlockedManuscript(input: {
  automation: SqliteAutomationRepository;
  runs: SqliteRunRepository;
  reviews: SqliteReviewRepository;
  sessionId: string;
  now: string;
}): void {
  const session = input.automation.requireSession(input.sessionId);
  if (!session.currentRunId || session.status !== "awaiting_user") {
    throw new AutomationServiceError(
      "autopilot.review.not_awaiting_decision",
      "The writing session is not waiting for an author review decision",
      409,
    );
  }
  const snapshot = input.runs.getSnapshot(session.currentRunId);
  if (!["awaiting_user", "paused"].includes(snapshot.run.status)) {
    throw new AutomationServiceError(
      "autopilot.review.not_awaiting_decision",
      "The blocked manuscript is no longer available for an author decision",
      409,
    );
  }
  const reason = sessionStopReason(session, snapshot);
  const review = currentBlockingReview(session, input.runs, input.reviews);
  if (!reason || !REVIEW_BLOCK_REASONS.has(reason) || !review) {
    throw new AutomationServiceError(
      "autopilot.review.not_blocked",
      "The current manuscript is not blocked by an author-decision review",
      409,
    );
  }
  const blockingIssues = review.issues.filter(
    (issue) => issue.requiresAuthorDecision,
  );
  if (blockingIssues.length === 0) {
    throw new AutomationServiceError(
      "autopilot.review.decision_evidence_missing",
      "The blocking review has no persisted author-decision issues",
      409,
    );
  }
  for (const issue of blockingIssues) {
    const existing = input.reviews.getLatestIssueDecision(
      session.projectId,
      issue.id,
    );
    if (existing) {
      if (existing.action === "intentional_keep") continue;
      throw new AutomationServiceError(
        "autopilot.review.issue_already_decided",
        "A blocking review issue already has a different author decision",
        409,
      );
    }
    input.reviews.decideIssue({
      id: randomUuid(),
      projectId: session.projectId,
      issueId: issue.id,
      action: "intentional_keep",
      note: null,
      expectedStatus: "open",
      now: input.now,
    });
  }
  input.runs.mergePolicy(
    snapshot.run.id,
    { reviewOverrideStepId: review.stepId },
    input.now,
  );
  input.runs.resume(snapshot.run.id, input.now);
  input.automation.resumeSession(session.id, input.now);
}

/** 最近一次 run 状态事件的原因；没有事件时退回 run 状态本身。 */
export function latestRunReason(snapshot: RunSnapshot): string | null {
  const event = [...snapshot.events]
    .reverse()
    .find((candidate) => candidate.type === `run.${snapshot.run.status}`);
  return typeof event?.payload.reason === "string"
    ? event.payload.reason
    : snapshot.run.status;
}

/** 读取候选生成时保存的基线值；缺失时返回 null（等价于“生成时尚不存在”）。 */
function baselineValue(
  payload: Readonly<Record<string, unknown>>,
  key: string,
): string | number | null {
  const baseline = payload.baseline;
  if (!isRecord(baseline)) return null;
  const value = baseline[key];
  return typeof value === "string" || typeof value === "number" ? value : null;
}
