import { sha256Hex } from "@narralume/domain";
import type {
  NarrativeRunStep,
  RunBudgetUsage,
  RunSnapshot,
} from "@narralume/domain";
import {
  WebNovelCandidateKindSchema,
  type WebNovelCandidateKind,
} from "@narralume/contracts";
import type {
  StepExecutionResult,
  StepWorker,
  WorkerRegistry,
} from "@narralume/harness";
import {
  SqliteCanonRepository,
  SqliteDocumentRepository,
  SqliteNarrativeStateRepository,
  SqliteProjectRepository,
  SqliteStoryRepository,
  SqliteWebNovelCandidateRepository,
  SqliteWebNovelRepository,
  type NarrativeDatabase,
} from "@narralume/persistence";

import { instructionsFor } from "./prompt-language.js";
import type { NarrativeModelClient } from "./model-client.js";
import {
  WEB_NOVEL_CANDIDATE_MODEL_CONTRACT,
  WebNovelCandidateModelResultSchema,
  webNovelCandidateModelValidator,
} from "./web-novel-candidate-schemas.js";
import { requireActiveProject } from "./project-guard.js";

interface WebNovelCandidateContextArtifact extends Readonly<
  Record<string, unknown>
> {
  kind: WebNovelCandidateKind;
  outlineNodeId: string | null;
  instruction: string;
  current: Record<string, unknown> | null;
  baseFingerprint: string;
  sourceProfileVersion: number | null;
  sourceBriefVersion: number | null;
  sourceDocumentId: string | null;
  sourceDocumentVersionId: string | null;
  sourceOutlineUpdatedAt: string | null;
  evidenceIndex: Record<string, readonly string[]>;
  prompt: string;
}

export class WebNovelCandidateWorkerSuite {
  private readonly candidates: SqliteWebNovelCandidateRepository;
  private readonly documents: SqliteDocumentRepository;
  private readonly canon: SqliteCanonRepository;
  private readonly projects: SqliteProjectRepository;
  private readonly story: SqliteStoryRepository;
  private readonly webNovel: SqliteWebNovelRepository;

  constructor(
    private readonly database: NarrativeDatabase,
    private readonly model: NarrativeModelClient,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.candidates = new SqliteWebNovelCandidateRepository(database);
    this.documents = new SqliteDocumentRepository(database);
    this.canon = new SqliteCanonRepository(database);
    this.projects = new SqliteProjectRepository(database);
    this.story = new SqliteStoryRepository(database);
    this.webNovel = new SqliteWebNovelRepository(database);
  }

  registry(): WorkerRegistry {
    return {
      "webnovel.context": this.worker(this.compileContext.bind(this)),
      "webnovel.candidate": this.worker(this.generateCandidate.bind(this)),
      "webnovel.stage": this.worker(this.stageCandidate.bind(this)),
    };
  }

  private worker(
    execute: (
      snapshot: RunSnapshot,
      step: NarrativeRunStep,
      signal: AbortSignal,
    ) => Promise<StepExecutionResult>,
  ): StepWorker {
    return {
      execute: (snapshot, step, signal) => {
        requireActiveProject(this.database, snapshot.run.projectId);
        return execute(snapshot, step, signal);
      },
    };
  }

  private async compileContext(
    snapshot: RunSnapshot,
  ): Promise<StepExecutionResult> {
    const project = this.projects.get(snapshot.run.projectId);
    if (!project) throw permanent("project.not_found", "Project not found");
    const kind = WebNovelCandidateKindSchema.parse(
      policyString(snapshot.run.policy, "webNovelCandidateKind"),
    );
    const instruction = policyString(
      snapshot.run.policy,
      "webNovelCandidateInstruction",
    );
    const outlineNodeId = nullableString(snapshot.run.policy.outlineNodeId);
    if (kind === "brief" && !outlineNodeId) {
      throw permanent(
        "webnovel.brief.outline_required",
        "A chapter brief candidate requires an outline node",
      );
    }
    const node = outlineNodeId
      ? this.story.getOutlineNode(project.id, outlineNodeId)
      : null;
    if (kind === "brief" && !node) {
      throw permanent(
        "outline.not_found",
        "The target outline node no longer exists",
      );
    }
    const profile = this.webNovel.getBookProfile(project.id);
    const brief = outlineNodeId
      ? this.webNovel.getChapterBrief(project.id, outlineNodeId)
      : null;
    const current =
      kind === "profile" ? profileToObject(profile) : briefToObject(brief);
    const document = outlineNodeId
      ? this.documents
          .list(project.id)
          .find((item) => item.outlineNodeId === outlineNodeId)
      : null;
    const sourceDocumentVersionId =
      brief?.documentVersionId ?? document?.currentVersionId ?? null;
    const entities = this.canon.listEntities(project.id, {
      includeRetired: true,
    });
    const state = new SqliteNarrativeStateRepository(
      this.database,
      this.canon,
      this.story,
    );
    const facts = this.canon.listEffectiveFacts(project.id, {
      includeCandidates: true,
    });
    const relationships = state.listCurrentRelationships(project.id);
    const timeline = state.listTimeline(project.id);
    const foreshadows = state.listForeshadows(project.id);
    const outline = this.story.listOutline(project.id);
    const evidenceIndex: Record<string, readonly string[]> = {
      outline: outline.map((item) => item.id),
      entity: entities.map((item) => item.id),
      fact: facts.map((item) => item.id),
      relation: relationships.map((item) => item.id),
      timeline: timeline.map((item) => item.id),
      foreshadow: foreshadows.map((item) => item.id),
      document: document ? [document.id] : [],
      profile: [project.id],
      brief: brief ? [brief.id] : [],
    };
    const packet = {
      task: { kind, outlineNodeId, instruction },
      project: {
        id: project.id,
        title: project.title,
        premise: project.premise,
        language: project.language,
      },
      currentProfile: profile,
      currentBrief: brief,
      targetOutline: node
        ? {
            id: node.id,
            title: node.title,
            summary: node.summary,
            goal: node.goal,
            conflict: node.conflict,
            outcome: node.outcome,
            updatedAt: node.updatedAt,
          }
        : null,
      supportingIndex: {
        outline: outline.slice(0, 200).map((item) => ({
          id: item.id,
          kind: item.kind,
          title: item.title,
          summary: item.summary,
          goal: item.goal,
          conflict: item.conflict,
          outcome: item.outcome,
        })),
        entities: entities.slice(0, 200).map((item) => ({
          id: item.id,
          type: item.type,
          name: item.name,
          description: item.description,
        })),
        facts: facts.slice(0, 200).map((item) => ({
          id: item.id,
          subjectId: item.subjectId,
          predicate: item.predicate,
          value: item.value ?? null,
        })),
      },
      evidenceIndex,
    };
    const baseFingerprint = sha256Hex(stableJson(current));
    return {
      artifactKind: "web-novel-context",
      output: {
        kind,
        outlineNodeId,
        instruction,
        current,
        baseFingerprint,
        sourceProfileVersion: profile?.version ?? null,
        sourceBriefVersion: brief?.version ?? null,
        sourceDocumentId: document?.id ?? null,
        sourceDocumentVersionId,
        sourceOutlineUpdatedAt: node?.updatedAt ?? null,
        evidenceIndex,
        prompt: JSON.stringify(packet),
      } satisfies WebNovelCandidateContextArtifact,
      usage: zeroUsage(),
    };
  }

  private async generateCandidate(
    snapshot: RunSnapshot,
    step: NarrativeRunStep,
    signal: AbortSignal,
  ): Promise<StepExecutionResult> {
    const context = contextArtifact(
      requiredArtifact(snapshot, "webnovel.context"),
    );
    const result = await this.model.structured(
      snapshot.run,
      step,
      "web-novel-planning",
      {
        instructions: instructionsFor(
          this.projects.get(snapshot.run.projectId)?.language ?? null,
          {
            "zh-CN": [
              "你是 ChapterFlow 的网文规划编辑。只根据提供的作品资料，生成可逐项审阅的作品档案或章节简报候选。",
              "绝不能直接写入数据库，也不能声称候选已经生效。每项必须有理由、影响和真实来源证据。",
              "afterJson 只放要修改的可编辑字段，不得包含 id、projectId、version、updatedAt、outlineNodeId 或 documentVersionId。",
              "引用来源时只能使用 evidenceIndex 中出现的真实 ID；不要编造 ID。",
              "profile 候选只能修改题材、读者、承诺、风格、结局方向、视角、更新节奏、目标字数、边界、世界规则和长线弧光；brief 候选只能修改目标、冲突、回报、钩子、人物、伏笔、时间线、目标字数和节奏。",
            ],
            en: [
              "You are ChapterFlow's web-novel planning editor. Using only the supplied project material, generate reviewable profile or chapter-brief candidates.",
              "Never write to the database or claim that a candidate is already active. Every item needs rationale, impact, and real evidence.",
              "afterJson contains only editable changed fields; never include ids, projectId, version, timestamps, outlineNodeId, or documentVersionId.",
              "Evidence IDs must come from evidenceIndex. Never invent IDs.",
              "Profile candidates may edit only profile planning fields; brief candidates may edit only goal, conflict, payoff, hook, links, target words, and pacing.",
            ],
          },
        ),
        messages: [{ role: "user", content: context.prompt }],
        reasoningEffort: "medium",
        maxOutputTokens: policyNumber(
          snapshot.run.policy,
          "webNovelCandidateMaxOutputTokens",
          6_000,
        ),
      },
      WEB_NOVEL_CANDIDATE_MODEL_CONTRACT,
      webNovelCandidateModelValidator(context.kind, context.evidenceIndex),
      signal,
    );
    return {
      artifactKind: "web-novel-candidate",
      output: {
        ...result.value,
        generation: { mode: result.mode, attempts: result.attempts },
      },
      usage: result.usage,
    };
  }

  private async stageCandidate(
    snapshot: RunSnapshot,
    step: NarrativeRunStep,
  ): Promise<StepExecutionResult> {
    const context = contextArtifact(
      requiredArtifact(snapshot, "webnovel.context"),
    );
    const generatedArtifact = requiredArtifact(snapshot, "webnovel.candidate");
    const generated = WebNovelCandidateModelResultSchema.parse({
      summary: generatedArtifact.summary,
      items: generatedArtifact.items,
    });
    const setId = `${snapshot.run.id}:web-novel-candidate-set`;
    const detail = this.candidates.stageCandidateSet({
      id: setId,
      projectId: snapshot.run.projectId,
      runId: snapshot.run.id,
      stepId: step.id,
      kind: context.kind,
      outlineNodeId: context.outlineNodeId,
      instruction: context.instruction,
      summary: generated.summary,
      sourceProfileVersion: context.sourceProfileVersion,
      sourceBriefVersion: context.sourceBriefVersion,
      sourceDocumentId: context.sourceDocumentId,
      sourceDocumentVersionId: context.sourceDocumentVersionId,
      sourceOutlineUpdatedAt: context.sourceOutlineUpdatedAt,
      baseFingerprint: context.baseFingerprint,
      items: generated.items.map((item, index) => ({
        id: `${setId}:item:${index}`,
        title: item.title,
        rationale: item.rationale,
        impact: item.impact,
        before: context.current,
        after: parseObject(item.afterJson),
        evidence: item.evidence,
        requiresLockedConfirmation: item.requiresLockedConfirmation,
      })),
      now: this.now().toISOString(),
    });
    return {
      artifactKind: "web-novel-candidate-set",
      output: {
        candidateSetId: detail.set.id,
        kind: context.kind,
        itemCount: detail.items.length,
      },
      usage: zeroUsage(),
    };
  }
}

function contextArtifact(
  value: Readonly<Record<string, unknown>>,
): WebNovelCandidateContextArtifact {
  const kind = WebNovelCandidateKindSchema.parse(value.kind);
  return {
    kind,
    outlineNodeId: nullableString(value.outlineNodeId),
    instruction: stringField(value, "instruction"),
    current: value.current === null ? null : recordValue(value.current),
    baseFingerprint: stringField(value, "baseFingerprint"),
    sourceProfileVersion: nullableNumber(value.sourceProfileVersion),
    sourceBriefVersion: nullableNumber(value.sourceBriefVersion),
    sourceDocumentId: nullableString(value.sourceDocumentId),
    sourceDocumentVersionId: nullableString(value.sourceDocumentVersionId),
    sourceOutlineUpdatedAt: nullableString(value.sourceOutlineUpdatedAt),
    evidenceIndex: recordOfStringArrays(value.evidenceIndex),
    prompt: stringField(value, "prompt"),
  };
}

function profileToObject(
  value: ReturnType<SqliteWebNovelRepository["getBookProfile"]>,
): Record<string, unknown> | null {
  if (!value) return emptyProfileObject();
  const { projectId, version, updatedAt, ...editable } = value;
  void projectId;
  void version;
  void updatedAt;
  return editable;
}

function briefToObject(
  value: ReturnType<SqliteWebNovelRepository["getChapterBrief"]>,
): Record<string, unknown> | null {
  if (!value) return emptyBriefObject();
  const {
    id,
    projectId,
    outlineNodeId,
    documentVersionId,
    version,
    createdAt,
    updatedAt,
    ...editable
  } = value;
  void id;
  void projectId;
  void outlineNodeId;
  void documentVersionId;
  void version;
  void createdAt;
  void updatedAt;
  return editable;
}

function emptyProfileObject(): Record<string, unknown> {
  return {
    presetId: null,
    genre: null,
    audience: null,
    promise: null,
    tone: null,
    endingDirection: null,
    pov: null,
    updateCadence: null,
    targetWordsPerChapter: null,
    boundaries: [],
    worldRules: [],
    arcNotes: [],
  };
}

function emptyBriefObject(): Record<string, unknown> {
  return {
    goal: null,
    conflict: null,
    payoff: null,
    hook: null,
    characterIds: [],
    foreshadowIds: [],
    timelineIds: [],
    targetWords: null,
    pacing: "steady",
  };
}

function requiredArtifact(
  snapshot: RunSnapshot,
  kind: NarrativeRunStep["kind"],
): Readonly<Record<string, unknown>> {
  const artifact = [...snapshot.steps]
    .reverse()
    .find(
      (candidate) =>
        candidate.kind === kind && candidate.status === "succeeded",
    )?.outputArtifact;
  if (!artifact)
    throw permanent("artifact.missing", `Missing artifact for step ${kind}`);
  return artifact;
}

function policyNumber(
  policy: Readonly<Record<string, unknown>>,
  key: string,
  fallback: number,
): number {
  const value = policy[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function policyString(
  policy: Readonly<Record<string, unknown>>,
  key: string,
): string {
  const value = policy[key];
  if (typeof value !== "string" || !value.trim())
    throw permanent("policy.value.invalid", `Run policy is missing ${key}`);
  return value;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function recordOfStringArrays(
  value: unknown,
): Record<string, readonly string[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      Array.isArray(entry)
        ? entry.filter((item): item is string => typeof item === "string")
        : [],
    ]),
  );
}

function parseObject(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);
    return recordValue(parsed) ?? {};
  } catch {
    throw permanent(
      "model.output.invalid",
      "The candidate afterJson is not valid JSON",
    );
  }
}

function stringField(
  value: Readonly<Record<string, unknown>>,
  key: string,
): string {
  const entry = value[key];
  if (typeof entry !== "string" || !entry.trim())
    throw permanent("artifact.value.invalid", `Artifact is missing ${key}`);
  return entry;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
    .join(",")}}`;
}

function zeroUsage(): RunBudgetUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    calls: 0,
    costUsd: 0,
    wallTimeMs: 0,
  };
}

function permanent(code: string, message: string): Error {
  const error = new Error(message) as Error & {
    code: string;
    retryable: boolean;
  };
  error.code = code;
  error.retryable = false;
  return error;
}
