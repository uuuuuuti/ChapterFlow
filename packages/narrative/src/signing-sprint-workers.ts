import {
  sha256Hex,
  type KnowledgeCardSourceRef,
  type NarrativeRunStep,
  type RunBudgetUsage,
  type RunSnapshot,
  type SigningSprintTask,
} from "@narralume/domain";
import { SigningSprintTaskSchema } from "@narralume/contracts";
import type {
  StepExecutionResult,
  StepWorker,
  WorkerRegistry,
} from "@narralume/harness";
import {
  SqliteOfficialKnowledgeRepository,
  SqliteProjectRepository,
  SqliteSigningSprintRepository,
  SqliteStoryRepository,
  SqliteWebNovelRepository,
  type NarrativeDatabase,
} from "@narralume/persistence";

import type { NarrativeModelClient } from "./model-client.js";
import {
  SIGNING_SPRINT_MODEL_CONTRACT,
  SigningSprintModelResultSchema,
  signingSprintModelValidator,
} from "./signing-sprint-schemas.js";
import { instructionsFor } from "./prompt-language.js";
import { requireActiveProject } from "./project-guard.js";

interface SigningSprintContextArtifact extends Readonly<
  Record<string, unknown>
> {
  task: SigningSprintTask;
  instruction: string;
  baseWorkflowVersion: number;
  sourceRefs: KnowledgeCardSourceRef[];
  prompt: string;
}

export class SigningSprintWorkerSuite {
  private readonly projects: SqliteProjectRepository;
  private readonly story: SqliteStoryRepository;
  private readonly webNovel: SqliteWebNovelRepository;
  private readonly workflows: SqliteSigningSprintRepository;
  private readonly knowledge: SqliteOfficialKnowledgeRepository;

  constructor(
    private readonly database: NarrativeDatabase,
    private readonly model: NarrativeModelClient,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.projects = new SqliteProjectRepository(database);
    this.story = new SqliteStoryRepository(database);
    this.webNovel = new SqliteWebNovelRepository(database);
    this.workflows = new SqliteSigningSprintRepository(database);
    this.knowledge = new SqliteOfficialKnowledgeRepository(database);
  }

  registry(): WorkerRegistry {
    return {
      "sprint.context": this.worker(this.compileContext.bind(this)),
      "sprint.generate": this.worker(this.generateCandidate.bind(this)),
      "sprint.stage": this.worker(this.stageCandidate.bind(this)),
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
    const workflow = this.workflows.ensure(
      project.id,
      this.now().toISOString(),
    );
    const task = SigningSprintTaskSchema.parse(
      policyString(snapshot.run.policy, "signingSprintTask"),
    );
    const instruction = policyString(
      snapshot.run.policy,
      "signingSprintInstruction",
    );
    const profile = this.webNovel.getBookProfile(project.id);
    const intent = this.story.getAuthorIntent(project.id);
    const stage = stageForTask(task);
    const cards = this.knowledge.retrieve(stage, profile?.genre ?? null, 12);
    const sourceRefs = uniqueSourceRefs(
      cards.flatMap((card) => card.sourceRefs),
    );
    const outline = this.story
      .listOutline(project.id)
      .slice(0, 120)
      .map((node) => ({
        id: node.id,
        kind: node.kind,
        title: node.title,
        summary: node.summary,
        goal: node.goal,
        conflict: node.conflict,
        outcome: node.outcome,
        metadata: node.metadata,
      }));
    const packet = {
      task,
      instruction,
      project: {
        id: project.id,
        title: project.title,
        premise: project.premise,
        language: project.language,
      },
      currentWorkflow: workflow,
      bookProfile: profile,
      authorIntent: intent,
      outline,
      officialKnowledge: cards.map((card) => ({
        id: card.id,
        title: card.title,
        principle: card.principle,
        why: card.why,
        signals: card.signals,
        antiPatterns: card.antiPatterns,
        suggestions: card.suggestions,
        sourceRefs: card.sourceRefs,
      })),
      taskGuidance: taskGuidance(task),
    };
    return {
      artifactKind: "signing-sprint-context",
      output: {
        task,
        instruction,
        baseWorkflowVersion: workflow.version,
        sourceRefs,
        contextFingerprint: sha256Hex(JSON.stringify(packet)),
        prompt: JSON.stringify(packet),
      } satisfies SigningSprintContextArtifact,
      usage: zeroUsage(),
    };
  }

  private async generateCandidate(
    snapshot: RunSnapshot,
    step: NarrativeRunStep,
    signal: AbortSignal,
  ): Promise<StepExecutionResult> {
    const context = contextArtifact(
      requiredArtifact(snapshot, "sprint.context"),
    );
    const project = this.projects.get(snapshot.run.projectId);
    const result = await this.model.structured(
      snapshot.run,
      step,
      "signing-sprint",
      {
        instructions: instructionsFor(project?.language ?? null, {
          "zh-CN": [
            "你是 ChapterFlow 的快速开书编辑。输出只能是结构化 JSON 候选，不能直接改数据库，也不能声称签约成功或给出签约概率。",
            "严格遵守 taskGuidance；payload 必须匹配当前任务对应的字段。候选要具体、可执行，并说明取舍。",
            "官方知识只能作为带来源的事实或指导；ChapterFlow 的推断必须写成观察、信号或建议，不得伪装成官方规则。",
            "如果规则内容可能变化，请明确写‘请以当前番茄官方规则为准’，不要编造固定数字。",
          ],
          en: [
            "You are ChapterFlow's quick-start editor. Return only structured JSON; never mutate the database or claim signing success or a signing probability.",
            "Follow taskGuidance exactly. The payload must match the current task and be concrete, reviewable, and explicit about tradeoffs.",
            "Official knowledge may only be used as sourced fact or guidance; ChapterFlow inferences must be marked as observations, signals, or suggestions.",
            "When a rule may change, say to check the current official Tomato Novel rules and do not invent fixed numbers.",
          ],
        }),
        messages: [{ role: "user", content: context.prompt }],
        reasoningEffort: "medium",
        maxOutputTokens: policyNumber(
          snapshot.run.policy,
          "signingSprintMaxOutputTokens",
          7_000,
        ),
      },
      SIGNING_SPRINT_MODEL_CONTRACT,
      signingSprintModelValidator(),
      signal,
    );
    return {
      artifactKind: "signing-sprint-model-result",
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
    void step;
    const context = contextArtifact(
      requiredArtifact(snapshot, "sprint.context"),
    );
    const generated = SigningSprintModelResultSchema.parse(
      requiredArtifact(snapshot, "sprint.generate"),
    );
    const candidate = this.workflows.insertCandidate({
      id: `${snapshot.run.id}:candidate`,
      workflowId: this.workflows.require(snapshot.run.projectId).id,
      projectId: snapshot.run.projectId,
      task: generated.task,
      status: "candidate",
      payload: generated.payload,
      rationale: `${generated.summary}\n${generated.rationale}`,
      provenance: {
        kind: "model",
        sourceRefs: context.sourceRefs,
        runId: snapshot.run.id,
      },
      baseWorkflowVersion: context.baseWorkflowVersion,
      createdAt: this.now().toISOString(),
      decidedAt: null,
    });
    return {
      artifactKind: "signing-sprint-candidate",
      output: {
        candidateId: candidate.id,
        task: candidate.task,
        status: candidate.status,
      },
      usage: zeroUsage(),
    };
  }
}

function stageForTask(task: SigningSprintTask): string {
  if (task === "BrainstormBookDirection") return "direction";
  if (task === "RefineBookPositioning" || task === "EvaluatePositioning")
    return "positioning";
  if (task === "GenerateBookPackaging" || task === "EvaluateBookPackaging")
    return "packaging";
  if (task === "GenerateOpeningBlueprint" || task === "EvaluateOpening")
    return "opening";
  if (task === "SigningReadinessReview") return "readiness";
  return "writing";
}

function taskGuidance(task: SigningSprintTask): string {
  switch (task) {
    case "BrainstormBookDirection":
      return "给出一个可比较的开书方向：题材、读者、核心情绪、主角种子、钩子和差异化。";
    case "RefineBookPositioning":
      return "完善一句话故事、核心创意、卖点、读者、主角目标、阻力、机制、核心冲突和短中长期空间。";
    case "EvaluatePositioning":
      return "评价当前定位的优势、风险、可持续性和需要作者决定的事项。";
    case "GenerateBookPackaging":
      return "生成 3 到 5 个真正不同方向的书名、简介、标签、宣传语和封面 brief 候选。";
    case "EvaluateBookPackaging":
      return "检查包装是否与定位和开篇承诺一致，给出可定位的改进建议。";
    case "GenerateOpeningBlueprint":
      return "生成读者期待、开篇钩子、前三章和第一阶段计划；前三章是 ChapterFlow 方法，不是官方硬规则。";
    case "EvaluateOpening":
      return "根据已有开篇检查信号和正文上下文给出编辑建议，指出具体位置，不做签约保证。";
    case "GenerateChapterFromIntent":
      return "根据定位和开篇计划生成一章的可审阅写作意图，供已有章节写作流程继续处理。";
    case "SigningReadinessReview":
      return "检查资料、内容准备度、一致性和官方规则匹配情况，输出可以准备提交或建议先处理问题。";
  }
}

function contextArtifact(
  artifact: Readonly<Record<string, unknown>>,
): SigningSprintContextArtifact {
  if (
    typeof artifact.task !== "string" ||
    typeof artifact.instruction !== "string" ||
    typeof artifact.baseWorkflowVersion !== "number" ||
    typeof artifact.prompt !== "string"
  ) {
    throw permanent(
      "artifact.invalid",
      "Invalid Signing Sprint context artifact",
    );
  }
  return {
    ...artifact,
    task: SigningSprintTaskSchema.parse(artifact.task),
    instruction: artifact.instruction,
    baseWorkflowVersion: artifact.baseWorkflowVersion,
    sourceRefs: Array.isArray(artifact.sourceRefs)
      ? (artifact.sourceRefs as KnowledgeCardSourceRef[])
      : [],
    prompt: artifact.prompt,
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

function policyString(
  policy: Readonly<Record<string, unknown>>,
  key: string,
): string {
  const value = policy[key];
  if (typeof value !== "string" || !value.trim())
    throw permanent("policy.value.invalid", `Run policy is missing ${key}`);
  return value;
}

function policyNumber(
  policy: Readonly<Record<string, unknown>>,
  key: string,
  fallback: number,
): number {
  const value = policy[key];
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback;
}

function uniqueSourceRefs(
  refs: readonly KnowledgeCardSourceRef[],
): KnowledgeCardSourceRef[] {
  return [...new Map(refs.map((ref) => [ref.sourceId, ref])).values()];
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
