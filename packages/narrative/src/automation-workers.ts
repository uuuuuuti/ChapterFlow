import {
  effectiveManuscriptCharacterCount,
  randomUuid,
  sha256Hex,
} from "@narralume/domain";

import {
  createOutlineNode,
  type NarrativeRunStep,
  type OutlineNode,
  type RunBudgetUsage,
  type RunSnapshot,
} from "@narralume/domain";
import type {
  StepExecutionResult,
  StepWorker,
  WorkerRegistry,
} from "@narralume/harness";
import {
  promptDefaultInstructions,
  promptInvariants,
} from "@narralume/harness";
import {
  SqliteAutomationRepository,
  SqliteCanonRepository,
  SqliteDocumentRepository,
  SqliteNarrativeStateRepository,
  SqliteProjectRepository,
  SqliteReaderPromiseRepository,
  SqliteStoryRepository,
  SqliteTemplateRepository,
  SqliteWebNovelRepository,
  type NarrativeDatabase,
} from "@narralume/persistence";

import type { NarrativeModelClient } from "./model-client.js";
import {
  automationValidator,
  BATCH_REVIEW_CONTRACT,
  BatchReviewResultSchema,
  FOUNDATION_CONTRACT,
  FoundationGenerationArtifactSchema,
  FoundationProposalSchema,
  PLANNING_REVIEW_CONTRACT,
  PlanningReviewResultSchema,
  ROLLING_OUTLINE_CONTRACT,
  RollingOutlineProposalSchema,
  rollingOutlineValidator,
  STEER_CLASSIFICATION_CONTRACT,
  SteerClassificationResultSchema,
} from "./automation-schemas.js";
import { fingerprint } from "./canon-candidate-context.js";
import {
  authoredInstructions,
  instructionsFor,
  promptLanguageOf,
} from "./prompt-language.js";
import { StoryStatePacketBuilder } from "./story-state-packet.js";
import {
  requireActiveProject,
  requireActiveRunCommit,
} from "./project-guard.js";

export class AutomationWorkerSuite {
  private readonly automation: SqliteAutomationRepository;
  private readonly projects: SqliteProjectRepository;
  private readonly story: SqliteStoryRepository;
  private readonly canon: SqliteCanonRepository;
  private readonly documents: SqliteDocumentRepository;
  private readonly state: SqliteNarrativeStateRepository;
  private readonly templates: SqliteTemplateRepository;
  private readonly webNovel: SqliteWebNovelRepository;
  private readonly readerPromises: SqliteReaderPromiseRepository;
  private readonly storyState: StoryStatePacketBuilder;

  constructor(
    private readonly database: NarrativeDatabase,
    private readonly model: NarrativeModelClient,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.automation = new SqliteAutomationRepository(database);
    this.projects = new SqliteProjectRepository(database);
    this.story = new SqliteStoryRepository(database);
    this.canon = new SqliteCanonRepository(database);
    this.documents = new SqliteDocumentRepository(database);
    this.state = new SqliteNarrativeStateRepository(
      database,
      this.canon,
      this.story,
    );
    this.templates = new SqliteTemplateRepository(database);
    this.webNovel = new SqliteWebNovelRepository(database);
    this.readerPromises = new SqliteReaderPromiseRepository(database);
    this.storyState = new StoryStatePacketBuilder(
      this.canon,
      this.state,
      this.story,
    );
  }

  /** 替换式指令组装：模板生效内容（override ?? 官方默认）整体替换写作层，
   *  结构不变量由代码追加，不受模板影响。 */
  private authoredInstructions(projectId: string, key: string): string {
    return authoredInstructions({
      language: promptLanguageOf(
        this.projects.get(projectId)?.language ?? null,
      ),
      templateContent: this.templates.getByKey(key)?.effectiveContent ?? null,
      fallback: promptDefaultInstructions(key),
      invariants: promptInvariants(key),
    });
  }

  registry(): WorkerRegistry {
    return {
      "foundation.generate": this.worker(this.generateFoundation.bind(this)),
      "foundation.stage": this.worker(this.stageFoundation.bind(this)),
      "outline.generate": this.worker(this.generateOutline.bind(this)),
      "outline.commit": this.worker(this.commitOutline.bind(this)),
      "steer.classify": this.worker(this.classifySteer.bind(this)),
      "arc.review": this.worker(this.reviewArc.bind(this)),
      "volume.review": this.worker(this.reviewVolume.bind(this)),
      "batch.review": this.worker(this.reviewBatch.bind(this)),
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

  private async generateFoundation(
    snapshot: RunSnapshot,
    step: NarrativeRunStep,
    signal: AbortSignal,
  ): Promise<StepExecutionResult> {
    const project = this.projects.get(snapshot.run.projectId);
    if (!project) throw permanent("project.not_found", "Project not found");
    const braindump = policyString(snapshot.run.policy, "braindump");
    const preferences = policyRecord(snapshot.run.policy, "preferences");
    const creativePreferences = {
      genre: preferences.genre ?? null,
      audience: preferences.audience ?? null,
      tone: preferences.tone ?? null,
    };
    const planningTarget = {
      chapters: policyNumber(preferences, "targetChapters", 12),
      wordsPerChapter: policyNumber(preferences, "wordsPerChapter", 2_500),
      volumes: policyNumber(preferences, "volumes", 1),
    };
    const baseline = {
      intentUpdatedAt:
        this.story.getAuthorIntent(snapshot.run.projectId)?.updatedAt ?? null,
      compassVersion:
        this.automation.getCompass(snapshot.run.projectId)?.version ?? null,
    };
    const result = await this.model.structured(
      snapshot.run,
      step,
      "book-foundation",
      {
        instructions: this.authoredInstructions(
          project.id,
          "prompt.book-foundation",
        ),
        messages: [
          {
            role: "user",
            content: [
              `作品暂定名：${project.title}`,
              project.premise ? `已有命题：${project.premise}` : "",
              `作者素材：\n${braindump}`,
              `创作偏好：${JSON.stringify(creativePreferences)}`,
              `规划规模（仅写入故事指南针 compass.target）：${JSON.stringify(planningTarget)}`,
              "严格给出恰好三份可以横向比较的完整建书方案。三份方案必须有明确不同的叙事角度、核心承诺和主要风险；每份方案都要包含完整的 intent、compass、entities，作者最终只会选择其中一份。",
              "为保证结构化响应一次完成：每份方案最多 8 个 entities、4 条 longLines、4 个 themes、4 个 themeQuestions、4 条 boundaries/constraints、2 条 riskNotes；所有字符串保持短而具体，禁止重复解释或输出 JSON 之外的文字。",
            ]
              .filter(Boolean)
              .join("\n\n"),
          },
        ],
        reasoningEffort: "low",
        maxOutputTokens: policyNumber(
          snapshot.run.policy,
          "foundationMaxOutputTokens",
          8_000,
        ),
      },
      FOUNDATION_CONTRACT,
      automationValidator(FoundationProposalSchema),
      signal,
    );
    return {
      artifactKind: "foundation-proposal",
      output: {
        plans: result.value.plans.map((plan) => ({
          ...plan,
          compass: { ...plan.compass, target: planningTarget },
        })),
        baseline,
        generation: { mode: result.mode, attempts: result.attempts },
      },
      usage: result.usage,
    };
  }

  private async stageFoundation(
    snapshot: RunSnapshot,
  ): Promise<StepExecutionResult> {
    const proposal = FoundationGenerationArtifactSchema.parse(
      requiredArtifact(snapshot, "foundation.generate"),
    );
    const setId = `${snapshot.run.id}:foundation-set`;
    const now = this.now().toISOString();
    const candidates = proposal.plans.map((plan, index) => ({
      id: `${setId}:plan:${index}:${plan.key}`,
      kind: "plan" as const,
      label: `方案${index + 1} · ${plan.title}`,
      payload: {
        ...plan,
        baseline: proposal.baseline,
      },
    }));
    const detail = this.automation.stageCandidateSet({
      id: setId,
      projectId: snapshot.run.projectId,
      sourceRunId: snapshot.run.id,
      title: "三案对比 · 选择你的故事路线",
      candidates,
      now,
    });
    return {
      artifactKind: "foundation-candidate-set",
      output: {
        candidateSetId: detail.set.id,
        candidateCount: detail.candidates.length,
        rationale: proposal.plans.map((plan) => plan.rationale).join("\n\n"),
      },
      usage: zeroUsage(),
    };
  }

  private async generateOutline(
    snapshot: RunSnapshot,
    step: NarrativeRunStep,
    signal: AbortSignal,
  ): Promise<StepExecutionResult> {
    const sessionId = policyString(snapshot.run.policy, "sessionId");
    const session = this.automation.requireSession(sessionId);
    const project = this.projects.get(session.projectId);
    if (!project) throw permanent("project.not_found", "Project not found");
    const compass = this.automation.getCompass(session.projectId);
    const intent = this.story.getAuthorIntent(session.projectId);
    const outline = this.story.listOutline(session.projectId);
    const readerPromiseState = this.readerPromises.listViews(
      session.projectId,
      {
        view: "open",
        currentChapterIndex: this.readerPromises.latestChapterIndex(
          session.projectId,
        ),
      },
    );
    const plannedPromiseActions = outline
      .filter((node) => node.kind === "chapter")
      .flatMap((node) => {
        const brief = this.webNovel.getChapterBrief(session.projectId, node.id);
        return brief && brief.readerPromiseOperations.length > 0
          ? [
              {
                chapterId: node.id,
                chapterTitle: node.title,
                operations: brief.readerPromiseOperations,
              },
            ]
          : [];
      });
    const existingChapterIntents = outline
      .filter((node) => node.kind === "chapter")
      .flatMap((node) => {
        const brief = this.webNovel.getChapterBrief(session.projectId, node.id);
        return brief
          ? [
              {
                chapterId: node.id,
                chapterTitle: node.title,
                purpose: brief.purpose,
                secondaryPurposes: brief.secondaryPurposes,
                readerExpectation: brief.readerExpectation,
                emotionTarget: brief.emotionTarget,
                emotionCurve: brief.emotionCurve,
                goal: brief.goal,
                conflict: brief.conflict,
                payoff: brief.payoff,
                payoffStrength: brief.payoffStrength,
                hook: brief.hook,
                hookType: brief.hookType,
                hookStrength: brief.hookStrength,
                informationGain: brief.informationGain,
                endingPull: brief.endingPull,
                sceneStructure: brief.sceneStructure,
                readerPromiseOperations: brief.readerPromiseOperations,
              },
            ]
          : [];
      })
      .slice(-50);
    const summaries = outline
      .filter((node) => node.kind === "chapter" && node.status === "committed")
      .map((node) => ({
        title: node.title,
        summary:
          this.state.latestSummary(session.projectId, "chapter", node.id)
            ?.summary ?? node.summary,
      }));
    const steers = this.automation
      .listSteers(sessionId)
      .filter((steer) =>
        ["classified", "applied", "awaiting_confirmation"].includes(
          steer.status,
        ),
      )
      .map((steer) => ({
        content: steer.content,
        classification: steer.classification,
        status: steer.status,
      }));
    const continuationState = this.storyState.build({
      projectId: session.projectId,
      audience: "author",
      maxTimelineEvents: 120,
      maxRelationships: 120,
    });
    const remaining = Math.max(
      1,
      session.targetChapters - session.completedChapters,
    );
    const windowSize = Math.min(session.windowSize, remaining);
    const result = await this.model.structured(
      snapshot.run,
      step,
      "rolling-outline",
      {
        instructions: instructionsFor(project.language, {
          "zh-CN": [
            "你是长篇小说滚动规划师。只详细规划当前可见窗口，不要一次冻结整部长篇。",
            "计划必须承接已提交章节，兑现指南针，尊重作者锁定意图与 steer。",
            "每章要有目标、阻力、转折、结果、事件、时间、地点、人物、信息揭示、章尾钩子、禁改事实和目标字数；结果必须推动因果链。",
            "请为每章填充 location、informationRevealed、lockedFacts、foreshadowSeeds、characterNames、targetWords；这些字段会保存为正式章纲，不能省略或写成空泛占位。",
            "同时为每章规划 Chapter Intent：主目的、读者期待、情绪目标/曲线、回报/钩子强度、信息增量、结尾牵引、场景结构，以及需要 OPEN/ADVANCE/PAYOFF 的 Reader Promise。Reader Promise 只能引用已给出的真实 ID；新 OPEN 用 promiseId=null 并填写 title。若开放 Reader Promise 列表为空，操作只能省略或只写 OPEN（promiseId=null 且 title 非空），绝不能写 ADVANCE/PAYOFF；ADVANCE/PAYOFF 的 promiseId 必须逐字复制开放列表中的 ID，不存在可推进的 Promise 就不要输出该操作。",
          ],
          en: [
            "You are the rolling planner of a long-form novel. Plan only the currently visible window in detail; never freeze an entire long novel at once.",
            "The plan must continue from committed chapters, honor the compass, and respect the author's locked intent and steers.",
            "Each chapter needs a goal, resistance, turn, outcome, event, time, location, characters, information revealed, closing hook, immutable facts, and a target word count; outcomes must advance the causal chain.",
            "Fill location, informationRevealed, lockedFacts, foreshadowSeeds, characterNames, and targetWords for every chapter. These fields are persisted as the formal brief, so do not omit them or use empty placeholders.",
            "Also plan a Chapter Intent for every chapter: primary purpose, reader expectation, emotion target/curve, payoff/hook strengths, information gain, ending pull, scene structure, and Reader Promise OPEN/ADVANCE/PAYOFF operations. Use only real promise IDs from the supplied state; a new OPEN uses promiseId=null with a title. If the open Reader Promise list is empty, omit operations or use only OPEN with promiseId=null and a non-empty title; never emit ADVANCE/PAYOFF. For ADVANCE/PAYOFF, copy a promiseId exactly from the supplied open list; if no Promise can be advanced, omit that operation.",
          ],
        }),
        messages: [
          {
            role: "user",
            content: [
              `作品：${project.title}`,
              `指南针：${JSON.stringify(compass)}`,
              `作者意图：${JSON.stringify(intent)}`,
              `现有大纲：${JSON.stringify(outline.map(compactOutline))}`,
              `已提交摘要：${JSON.stringify(summaries)}`,
              `开放 Reader Promise（含年龄与最近推进）：${JSON.stringify(readerPromiseState)}`,
              `已有章节计划中的 Promise 兑现/推进安排：${JSON.stringify(plannedPromiseActions)}`,
              `已有章节 Chapter Intent（含目的、期待、回报与场景结构）：${JSON.stringify(existingChapterIntents)}`,
              `<author-continuation-state>\n${continuationState.sources
                .map((source) => `${source.label}\n${source.content}`)
                .join("\n\n")}\n</author-continuation-state>`,
              `待考虑 steer：${JSON.stringify(steers)}`,
              `本次详细规划 ${windowSize} 章，并给出下一弧骨架。`,
            ].join("\n\n"),
          },
        ],
        // DeepSeek V4 spends the output budget on hidden reasoning when a
        // structured review uses low/high effort. This report needs a
        // complete JSON verdict and already has deterministic grounding, so
        // explicitly disable reasoning for the batch-review call.
        reasoningEffort: "none",
        maxOutputTokens: policyNumber(
          snapshot.run.policy,
          "planningMaxOutputTokens",
          10_000,
        ),
      },
      ROLLING_OUTLINE_CONTRACT,
      rollingOutlineValidator(
        readerPromiseState.promises.map((promise) => promise.id),
      ),
      signal,
    );
    const value = {
      ...result.value,
      chapters: result.value.chapters.slice(0, windowSize),
    };
    return {
      artifactKind: "rolling-outline-proposal",
      output: {
        ...value,
        generation: {
          mode: result.mode,
          attempts: result.attempts,
          // 保存生成时的大纲基线；commit 时比对，防止后台规划覆盖期间的人工编辑。
          outlineFingerprint: outlineFingerprint(outline),
        },
      },
      usage: result.usage,
    };
  }

  private async commitOutline(
    snapshot: RunSnapshot,
  ): Promise<StepExecutionResult> {
    const artifact = requiredArtifact(snapshot, "outline.generate");
    const plan = RollingOutlineProposalSchema.parse(artifact);
    const baseline =
      isRecord(artifact) &&
      isRecord(artifact.generation) &&
      typeof artifact.generation.outlineFingerprint === "string"
        ? artifact.generation.outlineFingerprint
        : null;
    const sessionId = policyString(snapshot.run.policy, "sessionId");
    const session = this.automation.requireSession(sessionId);
    const now = this.now().toISOString();
    const result = this.database.transaction(() => {
      const outline = this.story.listOutline(session.projectId);
      // 生成后大纲若被人工编辑（骨架弧详情、结构、章节变动），旧方案必须显式失效，
      // 不能用旧方案无条件覆盖作者的修改或按漂移后的结构追加章节。
      if (!baseline || outlineFingerprint(outline) !== baseline) {
        throw permanent(
          "outline.baseline.conflict",
          "The outline was changed by other edits after rolling planning; this plan is stale, please plan again",
        );
      }
      const root = outline.find((node) => node.kind === "book");
      if (!root)
        throw permanent(
          "outline.root.missing",
          "Project is missing the book root node",
        );
      let volume = latestNode(outline, "volume");
      if (!volume) {
        volume = this.story.insertOutlineNode(
          createOutlineNode({
            id: `${snapshot.run.id}:volume`,
            projectId: session.projectId,
            parent: root,
            kind: "volume",
            ordinal: nextOrdinal(outline, root.id),
            title: plan.volume.title,
            summary: plan.volume.summary,
            goal: plan.volume.goal,
            metadata: { detail: "active", sourceRunId: snapshot.run.id },
            now,
          }),
        );
      }
      const volumeChildren = this.story.listOutlineChildren(
        session.projectId,
        volume.id,
      );
      const existingArcTitles = new Set(
        volumeChildren
          .filter((node) => node.kind === "arc")
          .map((node) => node.title),
      );
      let arc = volumeChildren.find(
        (node) =>
          node.kind === "arc" &&
          node.metadata.detail === "skeleton" &&
          this.story.listOutlineChildren(session.projectId, node.id).length ===
            0,
      );
      if (arc) {
        existingArcTitles.delete(arc.title);
        const arcTitle = uniqueSiblingTitle(
          plan.arc.title,
          existingArcTitles,
          "续弧",
        );
        arc = this.story.updateOutlineDetails(
          session.projectId,
          arc.id,
          {
            title: arcTitle,
            summary: plan.arc.summary,
            goal: plan.arc.goal,
            conflict: plan.arc.conflict,
            outcome: plan.arc.outcome,
            metadata: { detail: "active", sourceRunId: snapshot.run.id },
          },
          now,
        );
        existingArcTitles.add(arcTitle);
      } else {
        const arcTitle = uniqueSiblingTitle(
          plan.arc.title,
          existingArcTitles,
          "续弧",
        );
        arc = this.story.insertOutlineNode(
          createOutlineNode({
            id: `${snapshot.run.id}:arc`,
            projectId: session.projectId,
            parent: volume,
            kind: "arc",
            ordinal: nextOrdinal(volumeChildren, volume.id),
            title: arcTitle,
            summary: plan.arc.summary,
            goal: plan.arc.goal,
            conflict: plan.arc.conflict,
            outcome: plan.arc.outcome,
            metadata: { detail: "active", sourceRunId: snapshot.run.id },
            now,
          }),
        );
        existingArcTitles.add(arcTitle);
      }
      const entities = this.canon.listEntities(session.projectId);
      const profile = this.webNovel.getBookProfile(session.projectId);
      const compass = this.automation.getCompass(session.projectId);
      const defaultTargetWords =
        profile?.targetWordsPerChapter ??
        compass?.target.wordsPerChapter ??
        2_500;
      const defaultLockedFacts = [
        ...(profile?.worldRules ?? []),
        ...(profile?.boundaries ?? []),
      ].filter(
        (value, index, values) =>
          value.trim() && values.indexOf(value) === index,
      );
      const existingChapters = this.story.listOutlineChildren(
        session.projectId,
        arc.id,
      );
      const chapterTitles = new Set(existingChapters.map((node) => node.title));
      const chapterIds: string[] = [];
      plan.chapters.forEach((chapter, index) => {
        const id = `${snapshot.run.id}:chapter:${index}`;
        const existing = this.story.getOutlineNode(session.projectId, id);
        if (existing) {
          chapterIds.push(existing.id);
          ensureChapterBrief(this.webNovel, existing, defaultTargetWords, now);
          return;
        }
        const pov = chapter.povName
          ? entities.find(
              (entity) =>
                entity.name === chapter.povName ||
                entity.aliases.includes(chapter.povName!),
            )
          : null;
        const node = this.story.insertOutlineNode(
          createOutlineNode({
            id,
            projectId: session.projectId,
            parent: arc!,
            kind: "chapter",
            ordinal: nextOrdinal(existingChapters, arc!.id) + index,
            title: uniqueSiblingTitle(chapter.title, chapterTitles),
            summary: chapter.summary,
            goal: chapter.goal,
            conflict: chapter.conflict,
            outcome: chapter.outcome,
            povEntityId: pov?.id ?? null,
            storyTime: chapter.storyTime,
            metadata: {
              hook: chapter.hook,
              sourceRunId: snapshot.run.id,
              planningRationale: plan.rationale,
              chapterBrief: chapterBriefMetadata(
                chapter,
                chapter.povName ? [chapter.povName] : [],
                defaultTargetWords,
                defaultLockedFacts,
              ),
            },
            now,
          }),
        );
        this.webNovel.upsertChapterBrief(session.projectId, node.id, {
          goal: chapter.goal,
          conflict: chapter.conflict,
          payoff: chapter.outcome,
          hook: chapter.hook,
          purpose: chapter.purpose ?? "progress",
          secondaryPurposes: chapter.secondaryPurposes ?? [],
          readerExpectation: chapter.readerExpectation ?? null,
          emotionTarget: chapter.emotionTarget ?? null,
          emotionCurve: chapter.emotionCurve ?? [],
          readerPromiseOperations: chapter.readerPromiseOperations ?? [],
          payoffStrength: chapter.payoffStrength ?? 0,
          hookType: chapter.hookType ?? null,
          hookStrength: chapter.hookStrength ?? 0,
          informationGain: chapter.informationGain ?? 0,
          endingPull: chapter.endingPull ?? 0,
          sceneStructure: chapter.sceneStructure ?? [],
          characterIds: pov ? [pov.id] : [],
          foreshadowIds: [],
          timelineIds: [],
          targetWords: chapter.targetWords ?? defaultTargetWords,
          pacing: "cliffhanger",
          expectedVersion: null,
          now,
        });
        chapterTitles.add(node.title);
        chapterIds.push(node.id);
      });
      let nextArcId: string | null = null;
      if (
        plan.nextArc &&
        session.completedChapters + chapterIds.length < session.targetChapters
      ) {
        const nextId = `${snapshot.run.id}:next-arc`;
        const existing = this.story.getOutlineNode(session.projectId, nextId);
        const nextArcTitle = uniqueSiblingTitle(
          plan.nextArc.title,
          new Set(
            this.story
              .listOutlineChildren(session.projectId, volume.id)
              .filter((node) => node.kind === "arc")
              .map((node) => node.title),
          ),
          "续弧",
        );
        const nextArc =
          existing ??
          this.story.insertOutlineNode(
            createOutlineNode({
              id: nextId,
              projectId: session.projectId,
              parent: volume,
              kind: "arc",
              ordinal: nextOrdinal(
                this.story.listOutlineChildren(session.projectId, volume.id),
                volume.id,
              ),
              title: nextArcTitle,
              summary: plan.nextArc.summary,
              goal: plan.nextArc.goal,
              metadata: { detail: "skeleton", sourceRunId: snapshot.run.id },
              now,
            }),
          );
        nextArcId = nextArc.id;
      }
      const project = this.projects.get(session.projectId);
      if (project && ["idea", "foundation"].includes(project.phase)) {
        this.projects.update({
          ...project,
          phase: "outlining",
          updatedAt: now,
        });
      }
      return { volumeId: volume.id, arcId: arc.id, chapterIds, nextArcId };
    });
    return {
      artifactKind: "rolling-outline-commit",
      output: result,
      usage: zeroUsage(),
    };
  }

  private async classifySteer(
    snapshot: RunSnapshot,
    step: NarrativeRunStep,
    signal: AbortSignal,
  ): Promise<StepExecutionResult> {
    const steerId = policyString(snapshot.run.policy, "steerId");
    const steer = this.automation.requireSteer(steerId);
    const session = steer.sessionId
      ? this.automation.requireSession(steer.sessionId)
      : null;
    const result = await this.model.structured(
      snapshot.run,
      step,
      "steer-classification",
      {
        instructions: instructionsFor(
          this.projects.get(snapshot.run.projectId)?.language ?? null,
          {
            "zh-CN": [
              "你是小说生产 harness 的 steer 仲裁器，只分类影响范围，不创作正文。",
              "立即影响仅用于作者明确要求停止或改变正在生成的内容；涉及既有正文或正典要提高风险。",
              "输出必须选择唯一分类和最早安全生效边界。",
            ],
            en: [
              "You are the steer arbitrator of the novel production harness; classify impact scope only and never write prose.",
              "Immediate impact applies only when the author explicitly asks to stop or change content being generated; anything touching existing prose or canon raises the risk.",
              "The output must choose exactly one classification and the earliest safe effective boundary.",
            ],
          },
        ),
        messages: [
          {
            role: "user",
            content: `运行状态：${session?.status ?? "无会话"}\n作者 steer：${steer.content}`,
          },
        ],
        reasoningEffort: "low",
        maxOutputTokens: 1_200,
      },
      STEER_CLASSIFICATION_CONTRACT,
      automationValidator(SteerClassificationResultSchema),
      signal,
    );
    const classified = this.database.transaction(() => {
      requireActiveRunCommit(
        this.database,
        snapshot.run.id,
        snapshot.run.projectId,
        signal,
      );
      return this.automation.classifySteer(steer.id, {
        ...result.value,
        now: this.now().toISOString(),
      });
    });
    return {
      artifactKind: "steer-classification",
      output: {
        steerId: classified.id,
        classification: classified.classification,
        effectiveBoundary: classified.effectiveBoundary,
        rationale: classified.rationale,
        risk: classified.risk,
        generation: { mode: result.mode, attempts: result.attempts },
      },
      usage: result.usage,
    };
  }

  private reviewArc(
    snapshot: RunSnapshot,
    step: NarrativeRunStep,
    signal: AbortSignal,
  ): Promise<StepExecutionResult> {
    return this.reviewScope(snapshot, step, signal, "arc");
  }

  private reviewVolume(
    snapshot: RunSnapshot,
    step: NarrativeRunStep,
    signal: AbortSignal,
  ): Promise<StepExecutionResult> {
    return this.reviewScope(snapshot, step, signal, "volume");
  }

  /**
   * Jointly reviews the exact five current manuscript versions selected by
   * the autopilot coordinator. The evidence envelope is read back from
   * SQLite immediately before the model call, so a stale/replaced version
   * cannot silently receive a review that belongs to another draft.
   */
  private async reviewBatch(
    snapshot: RunSnapshot,
    step: NarrativeRunStep,
    signal: AbortSignal,
  ): Promise<StepExecutionResult> {
    const sessionId = policyString(snapshot.run.policy, "sessionId");
    const chapters = loadBatchReviewChapters(
      snapshot,
      this.documents,
      this.story,
    );
    const source = chapters.map(({ content, ...evidence }) => ({
      ...evidence,
      chapterGoal: evidence.goal,
      chapterConflict: evidence.conflict,
      chapterOutcome: evidence.outcome,
      content: batchReviewText(content, evidence.ordinal),
    }));
    const result = await this.model.structured(
      snapshot.run,
      step,
      "batch-review",
      {
        instructions: instructionsFor(
          this.projects.get(snapshot.run.projectId)?.language ?? null,
          {
            "zh-CN": [
              "你是首发批次的联合审阅编辑。只审阅下面准确列出的五个当前正文版本，不得用旧稿、章纲或模型印象替代正文证据。",
              "检查五章之间的因果衔接、人物知情范围、时间线、能力代价、地点/物品/伤势状态、已确认设定和章纲兑现。",
              "verdict=block 只用于必须返工才能首发的问题；只有没有 block 才能 pass 或 warning。最多输出 12 个最重要的问题、8 条建议；每个问题字段保持简短。每个问题必须标明 chapterOrdinal，并从对应正文逐字复制同一段连续原文作为 evidenceQuote（不超过 300 字）；禁止改写、概括、拼接、使用省略号或引用其他章节。若无法复制到逐字连续原文，就不要输出该问题。正文中的 [C章-P段] 只是定位标记，不要写进 evidenceQuote。",
              "必须返回严格 JSON，不写分析过程，不改写正文，不通过修改锁定设定来掩盖矛盾。",
            ],
            en: [
              "You are the joint reviewer for a first-release batch. Review only the five exact current manuscript versions listed below; never substitute an old draft, outline, or model impression for prose evidence.",
              "Check cross-chapter causality, character knowledge boundaries, timeline, ability costs, location/item/injury state, confirmed canon, and chapter-brief payoff.",
              "Use verdict=block only for issues that must be fixed before release; pass or warning is allowed only when there are no block issues. Return at most 12 most important issues and 8 recommendations, with short fields. Every issue must name chapterOrdinal and copy one exact contiguous quote from the same chapter, at most 300 characters; never paraphrase, concatenate, add ellipses, or quote another chapter. If an exact quote cannot be copied, omit the issue. [Cchapter-Pparagraph] markers are for locating text only and must not appear in evidenceQuote.",
              "Return strict JSON only. Do not rewrite prose or hide a contradiction by changing locked facts.",
            ],
          },
        ),
        messages: [
          {
            role: "user",
            content: `五章当前版本证据：\n${JSON.stringify(source)}`,
          },
        ],
        // Batch review is a compact evidence report, not a prose generation
        // task. Keep it below the general review ceiling so a provider cannot
        // spend repair attempts producing an unbounded issue list and leave
        // the voyage without a verdict.
        // DeepSeek V4 spends the output budget on hidden reasoning when a
        // structured review uses low/high effort. This report needs a
        // complete JSON verdict and already has deterministic grounding, so
        // explicitly disable reasoning for this batch-review call.
        reasoningEffort: "none",
        maxOutputTokens: Math.min(
          policyNumber(snapshot.run.policy, "reviewMaxOutputTokens", 4_000),
          8_000,
        ),
      },
      BATCH_REVIEW_CONTRACT,
      automationValidator(BatchReviewResultSchema),
      signal,
    );
    const groundedIssues: Array<Record<string, unknown>> = [];
    const droppedIssues: Array<Record<string, unknown>> = [];
    result.value.issues.forEach((issue, index) => {
      const chapter = chapters[issue.chapterOrdinal - 1];
      if (!chapter) {
        throw permanent(
          "batch_review.evidence.chapter_invalid",
          `Batch review issue ${index + 1} references an unknown chapter`,
        );
      }
      try {
        const grounded = groundBatchQuote(
          chapter.content,
          issue.evidenceQuote,
          issue.chapterOrdinal,
        );
        groundedIssues.push({
          id: `${step.id}:issue:${index}`,
          severity: issue.severity,
          category: issue.category,
          message: issue.message,
          rationale: issue.rationale,
          chapterOrdinal: issue.chapterOrdinal,
          outlineNodeId: chapter.outlineNodeId,
          documentId: chapter.documentId,
          documentVersionId: chapter.versionId,
          contentHash: chapter.contentHash,
          evidence: grounded,
        });
      } catch {
        // A model claim without an exact quote is not an issue we can put in
        // the acceptance record. Keep a bounded diagnostic so the author can
        // see that the model output was discarded instead of mistaking it for
        // grounded evidence.
        droppedIssues.push({
          index: index + 1,
          chapterOrdinal: issue.chapterOrdinal,
          category: issue.category,
          message: issue.message,
          reason: "evidenceQuote_not_found_in_current_version",
        });
      }
    });
    const groundedVerdict = groundedIssues.some(
      (issue) => issue.severity === "block",
    )
      ? "block"
      : groundedIssues.length > 0 || droppedIssues.length > 0
        ? "warning"
        : result.value.verdict === "pass"
          ? "pass"
          : "warning";
    const summary =
      droppedIssues.length > 0
        ? `${result.value.summary}（${droppedIssues.length} 条未能在当前正文逐字定位的模型问题未计入审阅结果。）`
        : result.value.summary;
    const sourceHash = sha256(
      JSON.stringify({
        chapters: chapters.map((chapter) => {
          const { content, ...evidence } = chapter;
          void content;
          return evidence;
        }),
        result: result.value,
        groundedIssues,
        droppedIssues,
      }),
    );
    const reviewState = {
      kind: "first-five-joint-review",
      sessionId,
      verdict: groundedVerdict,
      modelVerdict: result.value.verdict,
      summary,
      scores: result.value.scores,
      recommendations: result.value.recommendations,
      chapters: chapters.map((chapter) => {
        const { content, ...evidence } = chapter;
        void content;
        return evidence;
      }),
      issues: groundedIssues,
      groundingDiagnostics: {
        droppedIssueCount: droppedIssues.length,
        droppedIssues,
      },
      sourceHash,
    };
    const now = this.now().toISOString();
    this.database.transaction(() => {
      requireActiveRunCommit(
        this.database,
        snapshot.run.id,
        snapshot.run.projectId,
        signal,
      );
      this.state.upsertSummary({
        id: `${snapshot.run.id}:batch-review`,
        projectId: snapshot.run.projectId,
        scopeType: "session",
        scopeId: sessionId,
        summary,
        stateDelta: reviewState,
        sourceHash,
        createdAt: now,
      });
    });
    return {
      artifactKind: "batch-review",
      output: {
        ...reviewState,
        generation: { mode: result.mode, attempts: result.attempts },
      },
      usage: result.usage,
    };
  }

  private async reviewScope(
    snapshot: RunSnapshot,
    step: NarrativeRunStep,
    signal: AbortSignal,
    scopeType: "arc" | "volume",
  ): Promise<StepExecutionResult> {
    const sessionId = policyString(snapshot.run.policy, "sessionId");
    const nodeId = policyString(
      snapshot.run.policy,
      scopeType === "arc" ? "arcId" : "volumeId",
    );
    const node = this.story.requireOutlineNode(snapshot.run.projectId, nodeId);
    if (node.kind !== scopeType) {
      throw permanent(
        "planning_review.scope.invalid",
        `Planning review target kind ${node.kind} is not ${scopeType}`,
      );
    }
    const outline = this.story.listOutline(snapshot.run.projectId);
    const chapters = outline.filter(
      (candidate) =>
        candidate.kind === "chapter" &&
        (candidate.parentId === node.id ||
          (scopeType === "volume" &&
            outline.some(
              (parent) =>
                parent.id === candidate.parentId && parent.parentId === node.id,
            ))),
    );
    const evidence = chapters.map((chapter) => ({
      title: chapter.title,
      status: chapter.status,
      summary:
        this.state.latestSummary(snapshot.run.projectId, "chapter", chapter.id)
          ?.summary ?? chapter.summary,
    }));
    const source = JSON.stringify(evidence);
    const result = await this.model.structured(
      snapshot.run,
      step,
      `${scopeType}-review`,
      {
        instructions: instructionsFor(
          this.projects.get(snapshot.run.projectId)?.language ?? null,
          {
            "zh-CN": [
              `你是长篇小说${scopeType === "arc" ? "故事弧" : "卷"}复盘编辑。`,
              "基于章节摘要评估承诺兑现、因果、人物弧、节奏和连续性。建议服务于下一滚动窗口，不改写已提交事实。",
            ],
            en: [
              `You are the retrospective editor of a long-form novel ${scopeType === "arc" ? "story arc" : "volume"}.`,
              "Assess promise fulfillment, causality, character arcs, pacing, and continuity from chapter summaries. Suggestions serve the next rolling window and never rewrite committed facts.",
            ],
          },
        ),
        messages: [
          {
            role: "user",
            content: [
              `范围：${node.title}`,
              `指南针：${JSON.stringify(this.automation.getCompass(snapshot.run.projectId))}`,
              `章节证据：${source}`,
            ].join("\n\n"),
          },
        ],
        reasoningEffort: "low",
        maxOutputTokens: 4_000,
      },
      PLANNING_REVIEW_CONTRACT,
      automationValidator(PlanningReviewResultSchema),
      signal,
    );
    const now = this.now().toISOString();
    const sourceHash = sha256(source);
    this.database.transaction(() => {
      requireActiveRunCommit(
        this.database,
        snapshot.run.id,
        snapshot.run.projectId,
        signal,
      );
      this.automation.insertPlanningReview({
        id: step.id,
        projectId: snapshot.run.projectId,
        sessionId,
        runId: snapshot.run.id,
        scopeType,
        outlineNodeId: node.id,
        summary: result.value.summary,
        scores: result.value.scores,
        recommendations: result.value.recommendations,
        sourceHash,
        createdAt: now,
      });
      this.state.upsertSummary({
        id: `${step.id}:summary`,
        projectId: snapshot.run.projectId,
        scopeType,
        scopeId: node.id,
        summary: result.value.summary,
        stateDelta: {
          recommendations: result.value.recommendations,
          compassAdjustments: result.value.compassAdjustments,
        },
        sourceHash,
        createdAt: now,
      });
    });
    return {
      artifactKind: `${scopeType}-review`,
      output: {
        ...result.value,
        outlineNodeId: node.id,
        sourceHash,
        generation: { mode: result.mode, attempts: result.attempts },
      },
      usage: result.usage,
    };
  }
}

function requiredArtifact(
  snapshot: RunSnapshot,
  kind: NarrativeRunStep["kind"],
): Record<string, unknown> {
  const artifact = snapshot.steps.find(
    (step) => step.kind === kind && step.status === "succeeded",
  )?.outputArtifact;
  if (!artifact)
    throw permanent("artifact.missing", `Missing ${kind} artifact`);
  return { ...artifact };
}

function compactOutline(node: OutlineNode) {
  return {
    id: node.id,
    parentId: node.parentId,
    kind: node.kind,
    title: node.title,
    summary: node.summary,
    status: node.status,
    metadata: node.metadata,
  };
}

function latestNode(
  outline: readonly OutlineNode[],
  kind: OutlineNode["kind"],
): OutlineNode | null {
  return [...outline].reverse().find((node) => node.kind === kind) ?? null;
}

function nextOrdinal(nodes: readonly OutlineNode[], parentId: string): number {
  return (
    Math.max(
      -1,
      ...nodes
        .filter((node) => node.parentId === parentId)
        .map((node) => node.ordinal),
    ) + 1
  );
}

/**
 * Outline titles are author-facing identifiers. A repeated model title must
 * not make two persisted arcs/chapters indistinguishable in the library or
 * export table, so retain the model wording and add a deterministic suffix.
 */
function uniqueSiblingTitle(
  requested: string,
  existingTitles: ReadonlySet<string>,
  suffix = "续章",
): string {
  const base = requested.trim() || "未命名章节";
  const normalized = new Set(
    [...existingTitles].map((title) => title.trim().toLocaleLowerCase()),
  );
  if (!normalized.has(base.toLocaleLowerCase())) return base;
  for (let ordinal = 2; ordinal < 10_000; ordinal += 1) {
    const candidate = `${base} · ${suffix}${ordinal}`;
    if (!normalized.has(candidate.toLocaleLowerCase())) return candidate;
  }
  return `${base} · ${randomUuid().slice(0, 8)}`;
}

type PlannedChapterBriefInput = {
  summary: string;
  goal: string;
  conflict: string;
  outcome: string;
  hook: string;
  povName: string | null;
  storyTime: string | null;
  location?: string | null | undefined;
  informationRevealed?: string[] | undefined;
  lockedFacts?: string[] | undefined;
  foreshadowSeeds?: string[] | undefined;
  characterNames?: string[] | undefined;
  targetWords?: number | undefined;
  purpose?:
    | "setup"
    | "progress"
    | "conflict"
    | "reveal"
    | "payoff"
    | "turning_point"
    | "relationship"
    | "worldbuilding"
    | "transition"
    | "climax"
    | undefined;
  secondaryPurposes?: PlannedChapterBriefInput["purpose"][] | undefined;
  readerExpectation?: string | null | undefined;
  emotionTarget?: string | null | undefined;
  emotionCurve?: Array<{ label: string; intensity: number }> | undefined;
  readerPromiseOperations?:
    | Array<{
        action: "OPEN" | "ADVANCE" | "PAYOFF";
        promiseId: string | null;
        title: string | null;
        note: string | null;
      }>
    | undefined;
  payoffStrength?: number | undefined;
  hookType?: string | null | undefined;
  hookStrength?: number | undefined;
  informationGain?: number | undefined;
  endingPull?: number | undefined;
  sceneStructure?:
    | Array<{
        order: number;
        purpose: PlannedChapterBriefInput["purpose"];
        beat: string;
        payoff: string | null;
      }>
    | undefined;
};

function chapterBriefMetadata(
  chapter: PlannedChapterBriefInput,
  fallbackCharacters: readonly string[],
  defaultTargetWords: number,
  defaultLockedFacts: readonly string[],
): Record<string, unknown> {
  const informationRevealed = nonEmptyStrings(
    chapter.informationRevealed ?? [],
  );
  const lockedFacts = nonEmptyStrings(
    chapter.lockedFacts ?? defaultLockedFacts,
  );
  return {
    event: chapter.summary,
    location: chapter.location ?? null,
    storyTime: chapter.storyTime,
    characters: nonEmptyStrings(chapter.characterNames ?? fallbackCharacters),
    informationRevealed:
      informationRevealed.length > 0 ? informationRevealed : [chapter.outcome],
    foreshadowSeeds: nonEmptyStrings(chapter.foreshadowSeeds ?? []),
    lockedFacts:
      lockedFacts.length > 0
        ? lockedFacts
        : ["本章目标、冲突、结果与章尾牵引属于已确认章纲约束"],
    targetWords:
      typeof chapter.targetWords === "number" && chapter.targetWords > 0
        ? Math.floor(chapter.targetWords)
        : defaultTargetWords,
  };
}

function ensureChapterBrief(
  webNovel: SqliteWebNovelRepository,
  node: OutlineNode,
  defaultTargetWords: number,
  now: string,
): void {
  if (webNovel.getChapterBrief(node.projectId, node.id)) return;
  const metadata = isRecord(node.metadata.chapterBrief)
    ? node.metadata.chapterBrief
    : {};
  const targetWords =
    typeof metadata.targetWords === "number" && metadata.targetWords > 0
      ? Math.floor(metadata.targetWords)
      : defaultTargetWords;
  webNovel.upsertChapterBrief(node.projectId, node.id, {
    goal: node.goal,
    conflict: node.conflict,
    payoff: node.outcome,
    hook: typeof node.metadata.hook === "string" ? node.metadata.hook : null,
    characterIds: node.povEntityId ? [node.povEntityId] : [],
    foreshadowIds: [],
    timelineIds: [],
    targetWords,
    pacing: "cliffhanger",
    expectedVersion: null,
    now,
  });
}

function nonEmptyStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is string =>
          typeof entry === "string" && entry.trim().length > 0,
      )
    : [];
}

interface BatchReviewChapter {
  ordinal: number;
  outlineNodeId: string;
  title: string;
  goal: string | null;
  conflict: string | null;
  outcome: string | null;
  hook: string;
  documentId: string;
  versionId: string;
  contentHash: string;
  characters: number;
  content: string;
}

function loadBatchReviewChapters(
  snapshot: RunSnapshot,
  documents: SqliteDocumentRepository,
  story: SqliteStoryRepository,
): BatchReviewChapter[] {
  const raw = snapshot.run.policy.batchChapterEvidence;
  if (!Array.isArray(raw) || raw.length !== 5) {
    throw permanent(
      "batch_review.evidence.invalid",
      "The first-five joint review requires exactly five chapter versions",
    );
  }
  return raw.map((entry, index) => {
    if (!isRecord(entry)) {
      throw permanent(
        "batch_review.evidence.invalid",
        `Batch review evidence ${index + 1} is not an object`,
      );
    }
    const outlineNodeId = stringValue(entry.outlineNodeId);
    const documentId = stringValue(entry.documentId);
    const versionId = stringValue(entry.versionId);
    const contentHash = stringValue(entry.contentHash);
    if (!outlineNodeId || !documentId || !versionId || !contentHash) {
      throw permanent(
        "batch_review.evidence.invalid",
        `Batch review evidence ${index + 1} is missing a version identity`,
      );
    }
    const node = story.requireOutlineNode(
      snapshot.run.projectId,
      outlineNodeId,
    );
    if (node.kind !== "chapter") {
      throw permanent(
        "batch_review.evidence.not_chapter",
        `Batch review evidence ${index + 1} is not a chapter`,
      );
    }
    const document = documents.get(snapshot.run.projectId, documentId);
    if (
      !document ||
      document.kind !== "chapter" ||
      document.outlineNodeId !== outlineNodeId ||
      document.currentVersionId !== versionId
    ) {
      throw permanent(
        "batch_review.evidence.stale",
        `The current document version for chapter ${index + 1} changed before review`,
      );
    }
    const version = documents.getVersion(
      snapshot.run.projectId,
      documentId,
      versionId,
    );
    if (!version || version.contentHash !== contentHash) {
      throw permanent(
        "batch_review.evidence.stale",
        `The selected document version for chapter ${index + 1} is unavailable`,
      );
    }
    return {
      ordinal: index + 1,
      outlineNodeId,
      title: node.title,
      goal: node.goal,
      conflict: node.conflict,
      outcome: node.outcome,
      hook: typeof node.metadata.hook === "string" ? node.metadata.hook : "",
      documentId,
      versionId,
      contentHash,
      characters: effectiveManuscriptCharacterCount(version.content),
      content: version.content,
    };
  });
}

function groundBatchQuote(
  content: string,
  requestedQuote: string,
  chapterOrdinal: number,
): { quote: string; paragraphOrdinal: number; start: number } {
  const paragraphs = content.split(/\n\s*\n/u);
  let cursor = 0;
  for (const [index, paragraph] of paragraphs.entries()) {
    const paragraphStart = content.indexOf(paragraph, cursor);
    const exactStart = paragraph.indexOf(requestedQuote);
    if (exactStart >= 0) {
      return {
        quote: requestedQuote,
        paragraphOrdinal: index + 1,
        start: paragraphStart + exactStart,
      };
    }
    const normalizedSpan = normalizedQuoteSpan(paragraph, requestedQuote);
    if (normalizedSpan) {
      return {
        quote: paragraph.slice(normalizedSpan.start, normalizedSpan.end),
        paragraphOrdinal: index + 1,
        start: paragraphStart + normalizedSpan.start,
      };
    }
    cursor = paragraphStart + paragraph.length;
  }
  throw permanent(
    "batch_review.evidence.unmatched",
    "The joint review returned a quote that does not occur in the selected current version",
    {
      chapterOrdinal,
      requestedQuote: requestedQuote.slice(0, 1_000),
    },
  );
}

function batchReviewText(content: string, chapterOrdinal: number): string {
  return content
    .split(/\n\s*\n/u)
    .map(
      (paragraph, index) => `[C${chapterOrdinal}-P${index + 1}]\n${paragraph}`,
    )
    .join("\n\n");
}

function normalizedQuoteSpan(
  text: string,
  requested: string,
): { start: number; end: number } | null {
  const wanted = Array.from(requested.replace(/\s+/gu, ""))
    .map(normalizeQuoteChar)
    .join("");
  if (!wanted) return null;
  let normalized = "";
  const offsets: number[] = [];
  for (let offset = 0; offset < text.length;) {
    const codePoint = text.codePointAt(offset);
    if (codePoint === undefined) break;
    const character = String.fromCodePoint(codePoint);
    offset += character.length;
    if (/\s/u.test(character)) continue;
    normalized += normalizeQuoteChar(character);
    offsets.push(offset - character.length);
  }
  const start = normalized.indexOf(wanted);
  if (start < 0) return null;
  const endIndex = start + wanted.length - 1;
  return {
    start: offsets[start]!,
    end:
      offsets[endIndex]! +
      Array.from(text.slice(offsets[endIndex]!))[0]!.length,
  };
}

function normalizeQuoteChar(value: string): string {
  return value
    .replace(/[“”]/gu, '"')
    .replace(/[‘’]/gu, "'")
    .replace(/：/gu, ":")
    .replace(/，/gu, ",")
    .replace(/。/gu, ".");
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function policyString(
  policy: Readonly<Record<string, unknown>>,
  key: string,
): string {
  const value = policy[key];
  if (typeof value !== "string" || !value.trim()) {
    throw permanent("run.policy.invalid", `Run policy is missing ${key}`);
  }
  return value;
}

function policyRecord(
  policy: Readonly<Record<string, unknown>>,
  key: string,
): Record<string, unknown> {
  const value = policy[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
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

function zeroUsage(): RunBudgetUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    calls: 0,
    costUsd: 0,
    wallTimeMs: 0,
  };
}

function sha256(value: string): string {
  return sha256Hex(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

/** 大纲结构指纹：覆盖节点身份、层级、排序、详情与 updatedAt，任何人工编辑都会改变它。 */
function outlineFingerprint(outline: readonly OutlineNode[]): string {
  return fingerprint(
    outline
      .map((node) => ({
        id: node.id,
        parentId: node.parentId,
        kind: node.kind,
        ordinal: node.ordinal,
        title: node.title,
        summary: node.summary,
        goal: node.goal,
        conflict: node.conflict,
        outcome: node.outcome,
        status: node.status,
        updatedAt: node.updatedAt,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  );
}

function permanent(
  code: string,
  message: string,
  details?: Record<string, unknown>,
) {
  return { code, message, retryable: false, ...(details ? { details } : {}) };
}
