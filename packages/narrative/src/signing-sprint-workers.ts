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
  SqliteDocumentRepository,
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
  private readonly documents: SqliteDocumentRepository;
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
    this.documents = new SqliteDocumentRepository(database);
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
    const cards = retrieveKnowledgeForTask(
      this.knowledge,
      task,
      profile?.genre ?? null,
      12,
    );
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
    const manuscript = this.story
      .listOutline(project.id)
      .filter((node) => node.kind === "chapter")
      .slice(0, 3)
      .flatMap((node) => {
        const document = this.documents.getByOutlineNodeId(project.id, node.id);
        if (!document?.currentVersionId) return [];
        const version = this.documents.getVersion(
          project.id,
          document.id,
          document.currentVersionId,
        );
        return version
          ? [
              {
                chapterId: node.id,
                title: node.title,
                content: version.content.slice(0, 40_000),
                versionId: version.id,
              },
            ]
          : [];
      });
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
      manuscript,
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
    const generatedArtifact = requiredArtifact(snapshot, "sprint.generate");
    // Generation metadata is kept on the run artifact for observability, but
    // it is not part of the model contract that must be persisted as a
    // candidate.  Strip it before applying the strict payload validator.
    const generated = SigningSprintModelResultSchema.parse(
      Object.fromEntries(
        Object.entries(generatedArtifact).filter(
          ([key]) => key !== "generation",
        ),
      ),
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

function retrieveKnowledgeForTask(
  repository: SqliteOfficialKnowledgeRepository,
  task: SigningSprintTask,
  genre: string | null,
  limit: number,
) {
  const stages = stagesForTask(task);
  const cards = new Map<
    string,
    ReturnType<typeof repository.retrieve>[number]
  >();
  for (const stage of stages) {
    for (const card of repository.retrieve(stage, genre, limit)) {
      if (!cards.has(card.id)) cards.set(card.id, card);
      if (cards.size >= limit) return [...cards.values()];
    }
  }
  return [...cards.values()];
}

function stagesForTask(task: SigningSprintTask): string[] {
  switch (task) {
    case "GenerateBookPackaging":
    case "EvaluateBookPackaging":
      return ["packaging", "positioning"];
    case "GenerateOpeningBlueprint":
      return ["opening", "positioning"];
    case "EvaluateOpening":
      return ["opening", "positioning"];
    default:
      return [stageForTask(task)];
  }
}

function taskGuidance(task: SigningSprintTask): string {
  switch (task) {
    case "BrainstormBookDirection":
      return "payload 必须严格只使用这些字段且类型完全匹配：premise(string)、genre(string|null)、audience(string|null)、coreEmotion(string|null)、protagonistSeed(string|null)、hook(string|null)、differentiation(string[])。给出一个可比较的开书方向：题材、读者、核心情绪、主角种子、钩子和差异化。";
    case "RefineBookPositioning":
      return "payload 必须严格只使用这些字段且类型完全匹配：oneLineStory(string)、coreIdea(string)、sellingPoints(string[])、emotionalPayoff(string)、readerProfile(string)、protagonistDesire(string)、obstacle(string)、mechanism(string)、coreConflict(string)、longTermExpectation(string)、sustainability({shortTermAppeal:string,midTermExpansion:string,longTermSpace:string})、riskNotes(string[])。不要把 protagonistDesire、obstacle 或 mechanism 拆成对象，不要使用 targetAudience、coreObstacle、midTermScalability、longTermStorySpace 等别名。完善一句话故事、核心创意、卖点、读者、主角目标、阻力、机制、核心冲突和短中长期空间。";
    case "EvaluatePositioning":
      return "payload 必须严格只使用 strengths(string[])、concerns(string[])、suggestions(string[])、officialMatches(string[]) 四个字段，不要添加或改名。评价当前定位的优势、风险、可持续性和需要作者决定的事项。";
    case "GenerateBookPackaging":
      return "payload 必须严格只使用 candidates(string[] object)，数量 3 到 5；每个候选严格只使用 title(string)、titleDirection(string)、description(string)、genre(string|null)、tags(string[])、tagline(string|null)、coverBrief(string|null)、rationale(string) 八个字段，不要改名或添加字段。生成 3 到 5 个真正不同方向的书名、简介、标签、宣传语和封面 brief 候选。";
    case "EvaluateBookPackaging":
      return "payload 必须严格只使用 strengths(string[])、concerns(string[])、suggestions(string[])、officialMatches(string[]) 四个字段，不要添加或改名。检查包装是否与定位和开篇承诺一致，给出可定位的改进建议。";
    case "GenerateOpeningBlueprint":
      return "payload 必须严格只使用 readerPromise(string)、openingHook(string)、expectation(string)、informationRevealPlan(string[])、firstThreeChapters(恰好 3 个章节对象)、firstArcTitle(string)、firstArcGoal(string)、firstArcConflict(string)、firstArcPayoff(string)、firstArcChapters(至少 3 个章节对象)、riskNotes(string[])。每个章节对象严格只使用 index(integer)、title(string)、purpose(string)、protagonistAction(string)、conflict(string)、readerExpectation(string)、emotionTarget(string)、hook(string)、payoff(string)、targetWords(integer|null)。不要使用 chapters、arcChapters、readerPromiseOperations 等别名；前三章是 ChapterFlow 方法，不是官方硬规则。";
    case "EvaluateOpening":
      return "payload 必须严格只使用 summary(string)、strengths(string[])、issues(array)、officialMatches(string[])。每个 issues 对象严格只使用 code(string)、title(string)、problem(string)、impact(string)、suggestion(string)、locations(string[])、evidence(string[])、source(official 或 chapterflow)、sourceRefs(array)，并且每个问题至少有一个具体 locations（例如‘第 1 章 · 第 2 段’）。根据已有开篇检查信号和正文上下文给出编辑建议，不做签约保证。";
    case "GenerateChapterFromIntent":
      return "payload 只能包含 Chapter Intent 字段：purpose、secondaryPurposes、readerExpectation、emotionTarget、emotionCurve、goal、conflict、readerPromiseOperations、payoff、payoffStrength、hook、hookType、hookStrength、informationGain、endingPull、sceneStructure、characterIds、foreshadowIds、timelineIds、targetWords、pacing；字段类型和枚举必须匹配上下文中的 Chapter Intent 约束，不要输出 prose/content/body/text。根据定位和开篇计划生成一章的可审阅写作意图，供已有章节写作流程继续处理。";
    case "SigningReadinessReview":
      return "payload 必须严格只使用 status(ready_to_prepare_submission 或 needs_attention)、headline(string)、issues(array)、checks(object)、generatedAt(string)。issues 对象严格只使用 code、title、severity(info|warning|error)、source(official|chapterflow)、detail、evidence(string[])、locations(string[])、suggestions(string[])、sourceRefs(array)；checks 严格只使用 metadata、content、openingQuality、consistency、officialMatching、technicalSafety，各值按上下文枚举。只能输出准备度预检，不得出现签约概率、分数、保证签约或官方评分。检查资料、内容准备度、一致性和官方规则匹配情况。";
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
