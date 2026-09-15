import {
  analyzeOpeningText,
  createCanonEntity,
  createDocument,
  createOutlineNode,
  randomUuid,
  sha256Hex,
  type CanonEntity,
  type ChapterEmotionTarget,
  type ChapterHookType,
  type ChapterPurpose,
  type KnowledgeCard,
  type KnowledgeCardSourceRef,
  type OfficialSource,
  type OpeningChapterBlueprint,
  type OpeningSignalReport,
  type ReaderPromiseOperation,
  type Project,
  type ReadinessIssue,
  type SigningReadinessReport,
  type SigningSprintCandidate,
  type SigningSprintState,
  type SigningSprintStep,
  type SigningSprintTask,
} from "@narralume/domain";
import {
  BookDirectionSchema,
  BookPackagingSchema,
  BookPositioningSchema,
  ChapterBriefSnapshotSchema,
  CreateSigningSprintRequestSchema,
  DecideSigningSprintCandidateRequestSchema,
  KnowledgeCardSchema,
  OfficialKnowledgeQuerySchema,
  OfficialSourceQuerySchema,
  OfficialSourceSchema,
  OpeningBlueprintSchema,
  OpeningSignalReportSchema,
  SigningReadinessReportSchema,
  SigningSprintCandidateSchema,
  SigningSprintTaskSchema,
  SigningSprintWorkflowSchema,
  StartSigningSprintAiRequestSchema,
  UpdateSigningSprintRequestSchema,
} from "@narralume/contracts";
import { buildSigningSprintRecipe } from "@narralume/harness";
import {
  SqliteCanonRepository,
  SqliteDocumentRepository,
  SqliteOfficialKnowledgeRepository,
  SqliteProjectRepository,
  SqliteReaderPromiseRepository,
  SqliteRunRepository,
  SqliteSigningSprintRepository,
  SqliteStoryRepository,
  SqliteWebNovelRepository,
  type NarrativeDatabase,
} from "@narralume/persistence";
import { z } from "zod";

import {
  hashRequest,
  requireWritingAssignment,
  withRuntimeModelPolicy,
} from "./index.js";
import type { RunCoordinator, RouteApp } from "./index.js";
import { seedOfficialKnowledge } from "./official-knowledge.js";

const ProjectParamsSchema = z.object({ projectId: z.string().trim().min(1) });
const CandidateParamsSchema = ProjectParamsSchema.extend({
  candidateId: z.string().trim().min(1),
});
const SourceParamsSchema = z.object({ sourceId: z.string().trim().min(1) });
const ChapterIntentPlanPayloadSchema =
  ChapterBriefSnapshotSchema.partial().strict();
const OpeningBlueprintCandidatePayloadSchema = OpeningBlueprintSchema.extend({
  firstThreeChapters: OpeningBlueprintSchema.shape.firstThreeChapters
    .min(3)
    .max(3),
  firstArcChapters: OpeningBlueprintSchema.shape.firstArcChapters.min(3),
});

export interface RegisterSigningSprintRouteOptions {
  runCoordinator: RunCoordinator;
  enableBackgroundWorker: boolean;
  environment: Readonly<Record<string, string | undefined>>;
}

/** Author-facing quick-start API plus the small developer knowledge surface. */
export function registerSigningSprintRoutes(
  app: RouteApp,
  database: NarrativeDatabase,
  options: RegisterSigningSprintRouteOptions,
): void {
  seedOfficialKnowledge(database);
  const projects = new SqliteProjectRepository(database);
  const canon = new SqliteCanonRepository(database);
  const workflows = new SqliteSigningSprintRepository(database);
  const knowledge = new SqliteOfficialKnowledgeRepository(database);
  const story = new SqliteStoryRepository(database);
  const planning = new SqliteWebNovelRepository(database);
  const documents = new SqliteDocumentRepository(database);
  const runs = new SqliteRunRepository(database);

  app.route("GET", "/api/official-knowledge/sources", async (request) => {
    const query = OfficialSourceQuerySchema.parse(request.query);
    return knowledge
      .listSources({
        ...(query.status ? { status: query.status } : {}),
        ...(query.sourceType ? { sourceType: query.sourceType } : {}),
      })
      .map((source) => OfficialSourceSchema.parse(source));
  });

  app.route("GET", "/api/official-knowledge/cards", async (request) => {
    const query = OfficialKnowledgeQuerySchema.parse(request.query);
    return knowledge
      .listCards({
        ...(query.stage ? { stage: query.stage } : {}),
        ...(query.genre ? { genre: query.genre } : {}),
        ...(query.status ? { status: query.status } : {}),
        limit: query.limit,
      })
      .map((card) => KnowledgeCardSchema.parse(card));
  });

  app.route("GET", "/api/official-knowledge/cards/:cardId", async (request) => {
    const cardId = z
      .object({ cardId: z.string().trim().min(1) })
      .parse(request.params).cardId;
    return KnowledgeCardSchema.parse(knowledge.requireCard(cardId));
  });

  app.route(
    "POST",
    "/api/official-knowledge/cards/:cardId/disable",
    async (request) => {
      const cardId = z
        .object({ cardId: z.string().trim().min(1) })
        .parse(request.params).cardId;
      return KnowledgeCardSchema.parse(
        knowledge.setCardStatus(cardId, "DISABLED", new Date().toISOString()),
      );
    },
  );

  app.route(
    "POST",
    "/api/official-knowledge/cards/:cardId/activate",
    async (request) => {
      const cardId = z
        .object({ cardId: z.string().trim().min(1) })
        .parse(request.params).cardId;
      const card = knowledge.requireCard(cardId);
      const inactiveRefs = card.sourceRefs.filter(
        (ref) => knowledge.getSource(ref.sourceId)?.status !== "ACTIVE",
      );
      if (inactiveRefs.length > 0) {
        throw new SigningSprintRouteError(
          "official_knowledge.card_source_inactive",
          "A knowledge card can only be activated when every cited official source version is active",
          422,
        );
      }
      return KnowledgeCardSchema.parse(
        knowledge.setCardStatus(cardId, "ACTIVE", new Date().toISOString()),
      );
    },
  );

  app.route(
    "POST",
    "/api/official-knowledge/sources/:sourceId/disable",
    async (request) => {
      const { sourceId } = SourceParamsSchema.parse(request.params);
      return OfficialSourceSchema.parse(
        knowledge.disableSource(sourceId, new Date().toISOString()),
      );
    },
  );

  app.route(
    "POST",
    "/api/official-knowledge/sources/:sourceId/activate",
    async (request) => {
      const { sourceId } = SourceParamsSchema.parse(request.params);
      return OfficialSourceSchema.parse(
        knowledge.activateSource(sourceId, new Date().toISOString()),
      );
    },
  );

  app.route(
    "POST",
    "/api/official-knowledge/sources/:sourceId/refresh",
    async (request) => {
      const { sourceId } = SourceParamsSchema.parse(request.params);
      const source = knowledge.requireSource(sourceId);
      assertOfficialSourceUrl(source.url);
      const now = new Date().toISOString();
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8_000);
        const response = await fetch(source.url, {
          signal: controller.signal,
          headers: { accept: "text/html, text/plain;q=0.9" },
        }).finally(() => clearTimeout(timer));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const length = Number(response.headers.get("content-length") ?? 0);
        if (length > 2_000_000) throw new Error("response exceeds 2 MB");
        const content = await response.text();
        if (!content.trim()) throw new Error("response is empty");
        const contentHash = sha256Hex(content);
        const requestedCandidateId = randomUuid();
        const candidate = knowledge.insertSource({
          ...source,
          id: requestedCandidateId,
          retrievedAt: now,
          contentHash,
          sourceVersion: `candidate-${now.slice(0, 10)}-${contentHash.slice(0, 8)}`,
          status: "CANDIDATE",
          createdAt: now,
          updatedAt: now,
        });
        const candidateCards =
          candidate.id === requestedCandidateId
            ? cloneKnowledgeCardsForSourceVersion(
                knowledge,
                source,
                candidate,
                now,
              )
            : [];
        return {
          status: "review_required",
          source: OfficialSourceSchema.parse(candidate),
          knowledgeCards: candidateCards.map((card) =>
            KnowledgeCardSchema.parse(card),
          ),
          message:
            "已抓取新版本候选，并为现有相关知识生成待核对卡片；请先核对来源与卡片，再分别决定是否启用。ChapterFlow 不会静默改变已激活知识。",
        };
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        const failureHash = sha256Hex(`${source.url}\0${detail}`);
        const failedCandidate = knowledge.insertSource({
          ...source,
          id: randomUuid(),
          retrievedAt: now,
          contentHash: failureHash,
          sourceVersion: `fetch-failed-${now.slice(0, 10)}-${failureHash.slice(0, 8)}`,
          status: "FETCH_FAILED",
          summary: `${source.summary} 本次抓取失败：${detail.slice(0, 300)}`,
          createdAt: now,
          updatedAt: now,
        });
        return {
          status: "fetch_failed",
          source: OfficialSourceSchema.parse(failedCandidate),
          message:
            "官方来源抓取失败，已保留原激活版本；请稍后重试或手动打开官方页面核对。",
        };
      }
    },
  );

  app.route(
    "POST",
    "/api/official-knowledge/sources/:sourceId/versions",
    async (request) => {
      const { sourceId } = SourceParamsSchema.parse(request.params);
      const base = knowledge.requireSource(sourceId);
      const input = OfficialSourceSchema.omit({
        id: true,
        sourceKey: true,
        platform: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      })
        .extend({ sourceVersion: z.string().trim().min(1).max(100) })
        .parse(request.body);
      assertOfficialSourceUrl(input.url);
      const now = new Date().toISOString();
      const candidate = knowledge.insertSource({
        id: randomUuid(),
        sourceKey: base.sourceKey,
        platform: "fanqienovel",
        url: input.url,
        title: input.title,
        sourceType: input.sourceType,
        publishedAt: input.publishedAt,
        retrievedAt: input.retrievedAt,
        contentHash: input.contentHash,
        status: "CANDIDATE",
        applicableStages: input.applicableStages,
        applicableGenres: input.applicableGenres,
        authorityType: input.authorityType,
        summary: input.summary,
        sourceVersion: input.sourceVersion,
        createdAt: now,
        updatedAt: now,
      });
      return { status: 201, body: OfficialSourceSchema.parse(candidate) };
    },
  );

  app.route(
    "GET",
    "/api/projects/:projectId/signing-sprint",
    async (request) => {
      const { projectId } = ProjectParamsSchema.parse(request.params);
      requireProject(projects, projectId);
      const workflow = workflows.ensure(projectId, new Date().toISOString());
      return workflowResponse(workflow, workflows, knowledge);
    },
  );

  app.route(
    "POST",
    "/api/projects/:projectId/signing-sprint",
    async (request) => {
      const { projectId } = ProjectParamsSchema.parse(request.params);
      const project = requireProject(projects, projectId);
      const input = CreateSigningSprintRequestSchema.parse(request.body ?? {});
      const now = new Date().toISOString();
      const workflow = workflows.ensure(projectId, now);
      const changed = database.transaction(() => {
        if (input.title?.trim() || input.premise !== undefined) {
          projects.update({
            ...project,
            title: input.title?.trim() || project.title,
            premise:
              input.premise === undefined ? project.premise : input.premise,
            updatedAt: now,
          });
        }
        const profile = planning.ensureBookProfile(projectId, now);
        const direction = {
          ...workflow.state.direction,
          premise: input.premise ?? project.premise ?? "",
          genre: input.genre ?? profile.genre,
          audience: input.audience ?? profile.audience,
          coreEmotion: input.coreEmotion ?? profile.promise,
          protagonistSeed: workflow.state.direction?.protagonistSeed ?? null,
          hook: workflow.state.direction?.hook ?? null,
          differentiation: workflow.state.direction?.differentiation ?? [],
        };
        const next = workflows.update(workflow.id, {
          expectedVersion: workflow.version,
          state: { direction },
          now,
        });
        updateProfile(planning, projectId, profile, {
          genre: input.genre === undefined ? profile.genre : input.genre,
          audience:
            input.audience === undefined ? profile.audience : input.audience,
          promise:
            input.coreEmotion === undefined
              ? profile.promise
              : input.coreEmotion,
          now,
        });
        return next;
      });
      return workflowResponse(changed, workflows, knowledge);
    },
  );

  app.route(
    "PATCH",
    "/api/projects/:projectId/signing-sprint",
    async (request) => {
      const { projectId } = ProjectParamsSchema.parse(request.params);
      requireProject(projects, projectId);
      const input = UpdateSigningSprintRequestSchema.parse(request.body);
      const current = workflows.require(projectId);
      const now = new Date().toISOString();
      const state = input.state
        ? {
            ...(input.state.direction === undefined
              ? {}
              : { direction: input.state.direction }),
            ...(input.state.positioning === undefined
              ? {}
              : { positioning: input.state.positioning }),
            ...(input.state.storyEngine === undefined
              ? {}
              : { storyEngine: input.state.storyEngine }),
            ...(input.state.packaging === undefined
              ? {}
              : { packaging: input.state.packaging }),
            ...(input.state.selectedPackagingId === undefined
              ? {}
              : { selectedPackagingId: input.state.selectedPackagingId }),
            ...(input.state.openingBlueprint === undefined
              ? {}
              : { openingBlueprint: input.state.openingBlueprint }),
            ...(input.state.openingCheck === undefined
              ? {}
              : { openingCheck: input.state.openingCheck }),
            ...(input.state.readiness === undefined
              ? {}
              : { readiness: input.state.readiness }),
          }
        : undefined;
      const next = database.transaction(() => {
        const updated = workflows.update(current.id, {
          expectedVersion: input.expectedVersion,
          ...(input.currentStep === undefined
            ? {}
            : { currentStep: input.currentStep }),
          ...(input.status === undefined ? {} : { status: input.status }),
          ...(input.completedSteps === undefined
            ? {}
            : { completedSteps: input.completedSteps }),
          ...(state === undefined ? {} : { state }),
          ...(input.selectedStrategyId === undefined
            ? {}
            : { selectedStrategyId: input.selectedStrategyId }),
          ...(input.knowledgeRefs === undefined
            ? {}
            : { knowledgeRefs: input.knowledgeRefs }),
          now,
        });
        syncSigningSprintAuthorData(
          updated,
          state,
          projects,
          planning,
          story,
          canon,
          now,
        );
        if (
          state?.openingBlueprint !== undefined &&
          updated.state.openingBlueprint
        ) {
          materializeOpeningPlan(
            updated,
            database,
            story,
            documents,
            planning,
            now,
          );
        }
        return updated;
      });
      return workflowResponse(next, workflows, knowledge);
    },
  );

  app.route(
    "GET",
    "/api/projects/:projectId/signing-sprint/candidates",
    async (request) => {
      const { projectId } = ProjectParamsSchema.parse(request.params);
      requireProject(projects, projectId);
      const task = request.query.task
        ? SigningSprintTaskSchema.parse(request.query.task)
        : undefined;
      return workflows
        .listCandidates(projectId, task)
        .map((candidate) => SigningSprintCandidateSchema.parse(candidate));
    },
  );

  app.route(
    "POST",
    "/api/projects/:projectId/signing-sprint/ai",
    async (request) => {
      const { projectId } = ProjectParamsSchema.parse(request.params);
      requireProject(projects, projectId);
      const input = StartSigningSprintAiRequestSchema.parse(request.body);
      const workflow = workflows.ensure(projectId, new Date().toISOString());
      const requestHash = hashRequest({
        task: input.task,
        instruction: input.instruction,
        policy: input.policy,
        workflowVersion: workflow.version,
      });
      const runId = deterministicRunId(projectId, input.task, input.requestId);
      const replay = runs.getRun(runId);
      if (replay) {
        if (replay.policy.creationRequestHash !== requestHash) {
          throw new SigningSprintRouteError(
            "signing_sprint.idempotency_conflict",
            "The same requestId was already used for a different quick-start request",
            409,
          );
        }
        return { status: 202, body: { runId, idempotentReplay: true } };
      }
      requireWritingAssignment(database, options.environment);
      const recipe = buildSigningSprintRecipe(runId);
      const policy = withRuntimeModelPolicy(
        {
          ...input.policy,
          signingSprintTask: input.task,
          signingSprintInstruction:
            input.instruction.trim() || "请根据当前作品资料生成可审阅候选。",
          signingSprintWorkflowId: workflow.id,
          creationRequestId: input.requestId,
          creationRequestHash: requestHash,
        },
        options.environment,
      );
      runs.create({
        id: runId,
        projectId,
        recipe: recipe.name,
        recipeVersion: recipe.version,
        mode: "manual",
        targetOutlineNodeId: null,
        policy,
        steps: recipe.steps,
        now: new Date().toISOString(),
      });
      if (options.enableBackgroundWorker) options.runCoordinator.wake();
      return { status: 202, body: { runId, idempotentReplay: false } };
    },
  );

  app.route(
    "POST",
    "/api/projects/:projectId/signing-sprint/candidates/:candidateId/decision",
    async (request) => {
      const { projectId, candidateId } = CandidateParamsSchema.parse(
        request.params,
      );
      requireProject(projects, projectId);
      const input = DecideSigningSprintCandidateRequestSchema.parse(
        request.body,
      );
      const candidate = workflows.requireCandidate(candidateId);
      if (candidate.projectId !== projectId) {
        throw new SigningSprintRouteError(
          "signing_sprint.candidate.scope_conflict",
          "This candidate belongs to another project",
          409,
        );
      }
      const workflow = workflows.require(projectId);
      if (workflow.version !== input.expectedWorkflowVersion) {
        throw new SigningSprintRouteError(
          "signing_sprint.version_conflict",
          "The quick-start workflow changed elsewhere; refresh and try again",
          409,
        );
      }
      if (candidate.status !== "candidate") {
        throw new SigningSprintRouteError(
          "signing_sprint.candidate.already_decided",
          "This quick-start candidate has already been decided",
          409,
        );
      }
      const now = new Date().toISOString();
      if (input.action === "reject") {
        const rejected = workflows.decideCandidate(
          candidate.id,
          "rejected",
          now,
        );
        return SigningSprintCandidateSchema.parse(rejected);
      }
      if (candidate.baseWorkflowVersion !== workflow.version) {
        throw new SigningSprintRouteError(
          "signing_sprint.candidate.stale",
          "This candidate was generated from an older workflow version; review it again before applying",
          409,
        );
      }
      const next = database.transaction(() => {
        const updated = applyCandidate(
          candidate,
          workflow,
          planning,
          workflows,
          story,
          now,
        );
        workflows.decideCandidate(candidate.id, "accepted", now);
        if (
          candidate.task === "GenerateOpeningBlueprint" &&
          updated.state.openingBlueprint
        ) {
          materializeOpeningPlan(
            updated,
            database,
            story,
            documents,
            planning,
            now,
          );
        }
        return updated;
      });
      return {
        workflow: SigningSprintWorkflowSchema.parse(next),
        candidate: SigningSprintCandidateSchema.parse(
          workflows.requireCandidate(candidate.id),
        ),
      };
    },
  );

  app.route(
    "POST",
    "/api/projects/:projectId/signing-sprint/opening-check",
    async (request) => {
      const { projectId } = ProjectParamsSchema.parse(request.params);
      requireProject(projects, projectId);
      const workflow = workflows.ensure(projectId, new Date().toISOString());
      const report = buildOpeningReport(projectId, story, documents);
      const next = workflows.update(workflow.id, {
        expectedVersion: workflow.version,
        state: { openingCheck: report },
        now: report.analyzedAt,
      });
      return {
        report: OpeningSignalReportSchema.parse(report),
        guidance: knowledge
          .retrieve(
            "opening",
            planning.getBookProfile(projectId)?.genre ?? null,
            12,
          )
          .map((card) => KnowledgeCardSchema.parse(card)),
        workflow: SigningSprintWorkflowSchema.parse(next),
      };
    },
  );

  app.route(
    "GET",
    "/api/projects/:projectId/signing-sprint/readiness",
    async (request) => {
      const { projectId } = ProjectParamsSchema.parse(request.params);
      requireProject(projects, projectId);
      const workflow = workflows.ensure(projectId, new Date().toISOString());
      const report = buildReadinessReport(
        projectId,
        workflow,
        projects,
        story,
        documents,
        planning,
        knowledge,
        runs,
      );
      const next = workflows.update(workflow.id, {
        expectedVersion: workflow.version,
        state: { readiness: report },
        now: report.generatedAt,
      });
      return {
        report: SigningReadinessReportSchema.parse(report),
        workflow: SigningSprintWorkflowSchema.parse(next),
      };
    },
  );

  app.route(
    "POST",
    "/api/projects/:projectId/signing-sprint/readiness",
    async (request) => {
      const { projectId } = ProjectParamsSchema.parse(request.params);
      requireProject(projects, projectId);
      const workflow = workflows.ensure(projectId, new Date().toISOString());
      const report = buildReadinessReport(
        projectId,
        workflow,
        projects,
        story,
        documents,
        planning,
        knowledge,
        runs,
      );
      const next = workflows.update(workflow.id, {
        expectedVersion: workflow.version,
        state: { readiness: report },
        now: report.generatedAt,
      });
      return {
        report: SigningReadinessReportSchema.parse(report),
        workflow: SigningSprintWorkflowSchema.parse(next),
      };
    },
  );
}

function requireProject(
  projects: SqliteProjectRepository,
  projectId: string,
): Project {
  const project = projects.get(projectId);
  if (!project)
    throw new SigningSprintRouteError(
      "project.not_found",
      "Project not found",
      404,
    );
  return project;
}

function workflowResponse(
  workflow: ReturnType<SqliteSigningSprintRepository["ensure"]>,
  workflows: SqliteSigningSprintRepository,
  knowledge: SqliteOfficialKnowledgeRepository,
) {
  return {
    workflow: SigningSprintWorkflowSchema.parse(workflow),
    candidates: workflows
      .listCandidates(workflow.projectId)
      .map((candidate) => SigningSprintCandidateSchema.parse(candidate)),
    knowledge: knowledge
      .retrieve(workflow.currentStep, null, 12)
      .map((card) => KnowledgeCardSchema.parse(card)),
  };
}

function deterministicRunId(
  projectId: string,
  task: string,
  requestId: string,
): string {
  const hex = hashRequest(`${projectId}\0${task}\0${requestId}`).slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
}

function applyCandidate(
  candidate: SigningSprintCandidate,
  workflow: ReturnType<SqliteSigningSprintRepository["ensure"]>,
  planning: SqliteWebNovelRepository,
  workflows: SqliteSigningSprintRepository,
  story: SqliteStoryRepository,
  now: string,
) {
  const state: Partial<SigningSprintState> = {};
  const payload = candidate.payload;
  switch (candidate.task) {
    case "BrainstormBookDirection": {
      const direction = BookDirectionSchema.parse(payload);
      state.direction = direction;
      const profile = planning.ensureBookProfile(workflow.projectId, now);
      updateProfile(planning, workflow.projectId, profile, {
        genre: direction.genre,
        audience: direction.audience,
        promise: direction.coreEmotion,
        now,
      });
      break;
    }
    case "RefineBookPositioning": {
      const positioning = BookPositioningSchema.parse(payload);
      state.positioning = positioning;
      const profile = planning.ensureBookProfile(workflow.projectId, now);
      updateProfile(planning, workflow.projectId, profile, {
        audience: positioning.readerProfile,
        promise: positioning.emotionalPayoff,
        endingDirection: positioning.longTermExpectation,
        arcNotes: [
          positioning.coreConflict,
          positioning.sustainability.midTermExpansion,
          positioning.sustainability.longTermSpace,
        ],
        now,
      });
      const intent = story.getAuthorIntent(workflow.projectId);
      story.upsertAuthorIntent({
        projectId: workflow.projectId,
        promise: positioning.emotionalPayoff,
        themes: intent?.themes ?? [],
        audience: positioning.readerProfile,
        tone: intent?.tone ?? null,
        boundaries: intent?.boundaries ?? [],
        endingDirection: positioning.longTermExpectation,
        currentFocus: "快速开书：定位",
        lockedFields: intent?.lockedFields ?? [],
        updatedAt: now,
      });
      break;
    }
    case "GenerateBookPackaging": {
      const parsed = z
        .object({ candidates: z.array(BookPackagingSchema).min(3).max(5) })
        .parse(payload);
      state.packaging = parsed.candidates;
      state.selectedPackagingId = null;
      break;
    }
    case "GenerateOpeningBlueprint": {
      state.openingBlueprint =
        OpeningBlueprintCandidatePayloadSchema.parse(payload);
      break;
    }
    case "SigningReadinessReview": {
      state.readiness = SigningReadinessReportSchema.parse(payload);
      break;
    }
    case "GenerateChapterFromIntent": {
      const plan = ChapterIntentPlanPayloadSchema.parse(payload);
      const target = story
        .listOutline(workflow.projectId)
        .find(
          (node) =>
            node.kind === "chapter" &&
            node.metadata.createdWith === "signing-sprint",
        );
      if (!target) {
        throw new SigningSprintRouteError(
          "signing_sprint.chapter_intent.target_missing",
          "Create the opening plan before accepting a chapter intent candidate",
          422,
        );
      }
      const current = planning.getChapterBrief(workflow.projectId, target.id);
      planning.upsertChapterBrief(workflow.projectId, target.id, {
        purpose: plan.purpose ?? current?.purpose ?? "progress",
        secondaryPurposes:
          plan.secondaryPurposes ?? current?.secondaryPurposes ?? [],
        readerExpectation:
          plan.readerExpectation ?? current?.readerExpectation ?? null,
        emotionTarget: plan.emotionTarget ?? current?.emotionTarget ?? null,
        emotionCurve: plan.emotionCurve ?? current?.emotionCurve ?? [],
        readerPromiseOperations:
          plan.readerPromiseOperations ??
          current?.readerPromiseOperations ??
          [],
        goal: plan.goal ?? current?.goal ?? target.goal ?? null,
        conflict: plan.conflict ?? current?.conflict ?? target.conflict ?? null,
        payoff: plan.payoff ?? current?.payoff ?? target.outcome ?? null,
        hook: plan.hook ?? current?.hook ?? null,
        characterIds: plan.characterIds ?? current?.characterIds ?? [],
        foreshadowIds: plan.foreshadowIds ?? current?.foreshadowIds ?? [],
        timelineIds: plan.timelineIds ?? current?.timelineIds ?? [],
        targetWords: plan.targetWords ?? current?.targetWords ?? null,
        pacing: plan.pacing ?? current?.pacing ?? "fast",
        payoffStrength: plan.payoffStrength ?? current?.payoffStrength ?? 0,
        hookType: plan.hookType ?? current?.hookType ?? null,
        hookStrength: plan.hookStrength ?? current?.hookStrength ?? 0,
        informationGain: plan.informationGain ?? current?.informationGain ?? 0,
        endingPull: plan.endingPull ?? current?.endingPull ?? 0,
        sceneStructure: plan.sceneStructure ?? current?.sceneStructure ?? [],
        expectedVersion: current?.version ?? null,
        now,
      });
      break;
    }
    case "EvaluateOpening": {
      // Evaluation candidates remain reviewable and do not mutate story data.
      break;
    }
    case "EvaluatePositioning":
    case "EvaluateBookPackaging":
      break;
  }
  const step = stepForTask(candidate.task);
  const packagingNeedsSelection =
    candidate.task === "GenerateBookPackaging" &&
    state.selectedPackagingId === null;
  const completedSteps = packagingNeedsSelection
    ? workflow.completedSteps
    : workflow.completedSteps.includes(step)
      ? workflow.completedSteps
      : [...workflow.completedSteps, step];
  const nextStep = packagingNeedsSelection
    ? "packaging"
    : nextWorkflowStep(step, completedSteps);
  return workflows.update(workflow.id, {
    expectedVersion: workflow.version,
    state,
    completedSteps,
    currentStep: nextStep,
    status:
      nextStep === "readiness" && completedSteps.includes("readiness")
        ? "completed"
        : "active",
    now,
  });
}

function stepForTask(task: SigningSprintTask): SigningSprintStep {
  if (task === "BrainstormBookDirection") return "direction";
  if (task === "RefineBookPositioning" || task === "EvaluatePositioning")
    return "positioning";
  if (task === "GenerateBookPackaging" || task === "EvaluateBookPackaging")
    return "packaging";
  if (task === "GenerateOpeningBlueprint" || task === "EvaluateOpening")
    return "opening";
  if (task === "GenerateChapterFromIntent") return "writing";
  return "readiness";
}

function nextWorkflowStep(
  completed: SigningSprintStep,
  completedSteps: SigningSprintStep[],
): SigningSprintStep {
  const order: SigningSprintStep[] = [
    "direction",
    "positioning",
    "story_engine",
    "packaging",
    "opening",
    "writing",
    "readiness",
  ];
  const index = order.indexOf(completed);
  return (
    order.find(
      (step, stepIndex) => stepIndex > index && !completedSteps.includes(step),
    ) ?? completed
  );
}

/**
 * The sprint is an author-facing workflow, but its confirmed decisions must
 * remain useful to the existing writing surfaces.  Keep the projection small:
 * the workflow owns the richer draft, while BookProfile, AuthorIntent and
 * Canon remain the durable sources consumed by the rest of ChapterFlow.
 */
function syncSigningSprintAuthorData(
  workflow: ReturnType<SqliteSigningSprintRepository["ensure"]>,
  changedState: Partial<SigningSprintState> | undefined,
  projects: SqliteProjectRepository,
  planning: SqliteWebNovelRepository,
  story: SqliteStoryRepository,
  canon: SqliteCanonRepository,
  now: string,
): void {
  if (!changedState) return;
  const changedAuthorData = Boolean(
    changedState.direction !== undefined ||
    changedState.positioning !== undefined ||
    changedState.storyEngine !== undefined ||
    changedState.selectedPackagingId !== undefined,
  );
  if (!changedAuthorData) return;

  const state = workflow.state;
  const direction = state.direction;
  const positioning = state.positioning;
  const engine = state.storyEngine;
  const selected = selectedPackaging(state);
  if (
    changedState.selectedPackagingId !== undefined &&
    state.selectedPackagingId !== null &&
    !selected
  ) {
    throw new SigningSprintRouteError(
      "signing_sprint.packaging.selection_invalid",
      "The selected packaging candidate does not exist",
      422,
    );
  }

  const project = projects.get(workflow.projectId);
  if (!project)
    throw new SigningSprintRouteError(
      "project.not_found",
      "Project not found",
      404,
    );

  if (
    changedState.selectedPackagingId !== undefined &&
    selected &&
    (selected.title !== project.title ||
      selected.description !== (project.premise ?? "") ||
      (selected.tagline ?? null) !== project.subtitle)
  ) {
    projects.update({
      ...project,
      title: selected.title,
      premise: selected.description,
      subtitle: selected.tagline,
      updatedAt: now,
    });
  }

  const profile = planning.ensureBookProfile(workflow.projectId, now);
  if (
    changedState.direction !== undefined ||
    changedState.positioning !== undefined ||
    changedState.storyEngine !== undefined ||
    changedState.selectedPackagingId !== undefined
  ) {
    const sprintNotes = [
      engine?.mechanism ? `快速开书 · 核心机制：${engine.mechanism}` : null,
      engine?.conflict ? `快速开书 · 第一阶段冲突：${engine.conflict}` : null,
      engine?.relationships.length
        ? `快速开书 · 关键关系：${engine.relationships.join("；")}`
        : null,
    ].filter((note): note is string => Boolean(note));
    const preservedNotes = profile.arcNotes.filter(
      (note) => !note.startsWith("快速开书 · "),
    );
    updateProfile(planning, workflow.projectId, profile, {
      genre: selected?.genre ?? direction?.genre ?? profile.genre,
      audience:
        positioning?.readerProfile ?? direction?.audience ?? profile.audience,
      promise:
        positioning?.emotionalPayoff ??
        direction?.coreEmotion ??
        profile.promise,
      endingDirection:
        positioning?.longTermExpectation ?? profile.endingDirection,
      worldRules: engine ? engine.worldRules : profile.worldRules,
      arcNotes:
        engine || positioning
          ? [
              ...preservedNotes,
              ...(positioning
                ? [
                    `快速开书 · 核心冲突：${positioning.coreConflict}`,
                    `快速开书 · 中期扩展：${positioning.sustainability.midTermExpansion}`,
                    `快速开书 · 长期空间：${positioning.sustainability.longTermSpace}`,
                  ]
                : []),
              ...sprintNotes,
            ].filter(Boolean)
          : profile.arcNotes,
      now,
    });
  }

  if (direction || positioning || engine) {
    const intent = story.getAuthorIntent(workflow.projectId);
    story.upsertAuthorIntent({
      projectId: workflow.projectId,
      promise:
        positioning?.emotionalPayoff ??
        direction?.coreEmotion ??
        intent?.promise ??
        null,
      themes: intent?.themes ?? [],
      audience:
        positioning?.readerProfile ??
        direction?.audience ??
        intent?.audience ??
        null,
      tone: intent?.tone ?? null,
      boundaries: intent?.boundaries ?? [],
      endingDirection:
        positioning?.longTermExpectation ?? intent?.endingDirection ?? null,
      currentFocus: engine
        ? [
            engine.protagonist && `主角：${engine.protagonist}`,
            engine.antagonist && `阻力：${engine.antagonist}`,
            engine.mechanism && `机制：${engine.mechanism}`,
            engine.conflict && `冲突：${engine.conflict}`,
          ]
            .filter(Boolean)
            .join("；") || "快速开书：人物与冲突"
        : positioning
          ? "快速开书：定位"
          : "快速开书：方向",
      lockedFields: intent?.lockedFields ?? [],
      updatedAt: now,
    });
  }

  if (engine) {
    const entities = canon.listEntities(workflow.projectId, {
      includeRetired: true,
    });
    syncRoleEntity(
      canon,
      entities,
      workflow.projectId,
      "protagonist",
      engine.protagonist,
      "快速开书确认的主角",
      now,
    );
    syncRoleEntity(
      canon,
      entities,
      workflow.projectId,
      "antagonist",
      engine.antagonist,
      "快速开书确认的主要阻力或对手",
      now,
    );
  }
}

function selectedPackaging(
  state: SigningSprintState,
): SigningSprintState["packaging"][number] | null {
  if (state.selectedPackagingId === null) return null;
  const index = Number(state.selectedPackagingId);
  return Number.isInteger(index) && index >= 0
    ? (state.packaging[index] ?? null)
    : (state.packaging.find(
        (candidate) => candidate.title === state.selectedPackagingId,
      ) ?? null);
}

function syncRoleEntity(
  canon: SqliteCanonRepository,
  entities: readonly CanonEntity[],
  projectId: string,
  role: "protagonist" | "antagonist",
  value: string | null,
  description: string,
  now: string,
): void {
  const name = value?.trim();
  if (!name) return;
  const existing =
    entities.find((entity) => entity.attributes.signingSprintRole === role) ??
    entities.find(
      (entity) => entity.type === "character" && entity.name === name,
    );
  if (existing) {
    canon.updateEntity({
      ...existing,
      name,
      description,
      attributes: {
        ...existing.attributes,
        signingSprintRole: role,
        signingSprintSource: "signing-sprint",
      },
      updatedAt: now,
    });
    return;
  }
  canon.insertEntity(
    createCanonEntity({
      id: randomUuid(),
      projectId,
      type: "character",
      name,
      description,
      attributes: {
        signingSprintRole: role,
        signingSprintSource: "signing-sprint",
      },
      now,
    }),
  );
}

function updateProfile(
  planning: SqliteWebNovelRepository,
  projectId: string,
  profile: ReturnType<SqliteWebNovelRepository["ensureBookProfile"]>,
  patch: Partial<ReturnType<SqliteWebNovelRepository["ensureBookProfile"]>> & {
    now: string;
  },
): void {
  planning.upsertBookProfile(projectId, {
    presetId: patch.presetId ?? profile.presetId,
    genre: patch.genre === undefined ? profile.genre : patch.genre,
    audience: patch.audience === undefined ? profile.audience : patch.audience,
    promise: patch.promise === undefined ? profile.promise : patch.promise,
    tone: patch.tone === undefined ? profile.tone : patch.tone,
    endingDirection:
      patch.endingDirection === undefined
        ? profile.endingDirection
        : patch.endingDirection,
    pov: patch.pov === undefined ? profile.pov : patch.pov,
    updateCadence:
      patch.updateCadence === undefined
        ? profile.updateCadence
        : patch.updateCadence,
    targetWordsPerChapter:
      patch.targetWordsPerChapter === undefined
        ? profile.targetWordsPerChapter
        : patch.targetWordsPerChapter,
    boundaries: patch.boundaries ?? profile.boundaries,
    worldRules: patch.worldRules ?? profile.worldRules,
    arcNotes: patch.arcNotes ?? profile.arcNotes,
    expectedVersion: profile.version,
    now: patch.now,
  });
}

function materializeOpeningPlan(
  workflow: ReturnType<SqliteSigningSprintRepository["ensure"]>,
  database: NarrativeDatabase,
  story: SqliteStoryRepository,
  documents: SqliteDocumentRepository,
  planning: SqliteWebNovelRepository,
  now: string,
): void {
  const blueprint = workflow.state.openingBlueprint;
  if (!blueprint) return;
  const outline = story.listOutline(workflow.projectId);
  const book = outline.find((node) => node.kind === "book");
  if (!book) return;
  let volume = outline.find(
    (node) =>
      node.kind === "volume" && node.metadata.signingSprintRole === "first_arc",
  );
  if (!volume) {
    const ordinal =
      Math.max(
        -1,
        ...outline
          .filter((node) => node.parentId === book.id)
          .map((node) => node.ordinal),
      ) + 1;
    volume = story.insertOutlineNode(
      createOutlineNode({
        id: randomUuid(),
        projectId: workflow.projectId,
        parent: book,
        kind: "volume",
        ordinal,
        title: blueprint.firstArcTitle,
        summary: blueprint.firstArcGoal,
        goal: blueprint.firstArcGoal,
        conflict: blueprint.firstArcConflict,
        outcome: blueprint.firstArcPayoff,
        metadata: {
          createdWith: "signing-sprint",
          signingSprintRole: "first_arc",
        },
        now,
      }),
    );
  }
  const specs = [...blueprint.firstArcChapters].sort(
    (left, right) => left.index - right.index,
  );
  const readerPromises = new SqliteReaderPromiseRepository(database);
  const openingPromiseId = `${workflow.id}:opening-reader-promise`;
  const needsPromiseLifecycle = !readerPromises.get(
    workflow.projectId,
    openingPromiseId,
  );
  const firstPayoffIndex = specs.findIndex((spec) => isPayoffPurpose(spec));
  for (const spec of specs) {
    let chapter = outline.find(
      (node) =>
        node.kind === "chapter" &&
        node.metadata.signingSprintChapterIndex === spec.index,
    );
    if (!chapter) {
      const siblings = story.listOutlineChildren(workflow.projectId, volume.id);
      chapter = story.insertOutlineNode(
        createOutlineNode({
          id: randomUuid(),
          projectId: workflow.projectId,
          parent: volume,
          kind: "chapter",
          ordinal: Math.max(-1, ...siblings.map((node) => node.ordinal)) + 1,
          title: spec.title,
          summary: spec.protagonistAction,
          goal: spec.protagonistAction,
          conflict: spec.conflict,
          outcome: spec.payoff,
          metadata: {
            createdWith: "signing-sprint",
            signingSprintChapterIndex: spec.index,
          },
          now,
        }),
      );
      documents.insert(
        createDocument({
          id: randomUuid(),
          projectId: workflow.projectId,
          kind: "chapter",
          title: spec.title,
          outlineNodeId: chapter.id,
          now,
        }),
      );
    }
    const currentBrief = planning.getChapterBrief(
      workflow.projectId,
      chapter.id,
    );
    const specIndex = specs.indexOf(spec);
    const plannedPromiseOperations = readerPromiseOperationsFor(
      blueprint,
      spec,
      specIndex,
      firstPayoffIndex,
      openingPromiseId,
    );
    planning.upsertChapterBrief(workflow.projectId, chapter.id, {
      goal: spec.protagonistAction,
      conflict: spec.conflict,
      payoff: spec.payoff,
      hook: spec.hook,
      readerExpectation: spec.readerExpectation,
      targetWords: spec.targetWords,
      purpose: purposeOf(spec),
      secondaryPurposes: [],
      emotionTarget: emotionTargetOf(spec.emotionTarget),
      emotionCurve: [],
      readerPromiseOperations:
        currentBrief && currentBrief.readerPromiseOperations.length > 0
          ? currentBrief.readerPromiseOperations
          : needsPromiseLifecycle
            ? plannedPromiseOperations
            : [],
      payoffStrength: spec.payoff.trim() ? 3 : 0,
      hookType: hookTypeOf(spec.hook),
      hookStrength: spec.hook.trim() ? 3 : 0,
      informationGain: spec.readerExpectation.trim() ? 3 : 1,
      endingPull: spec.hook.trim() ? 3 : 1,
      sceneStructure: [
        {
          order: 1,
          purpose: purposeOf(spec),
          beat: spec.protagonistAction,
          payoff: spec.payoff,
        },
      ],
      characterIds: [],
      foreshadowIds: [],
      timelineIds: [],
      pacing: "fast",
      expectedVersion: currentBrief?.version ?? null,
      now,
    });
  }
}

function purposeOf(spec: OpeningChapterBlueprint): ChapterPurpose {
  const value = spec.purpose.trim().toLowerCase();
  const exact: readonly ChapterPurpose[] = [
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
  ];
  if ((exact as readonly string[]).includes(value))
    return value as ChapterPurpose;
  if (value.includes("冲突") || value.includes("conflict")) return "conflict";
  if (value.includes("揭") || value.includes("reveal")) return "reveal";
  if (value.includes("转") || value.includes("turn")) return "turning_point";
  if (value.includes("关系") || value.includes("relationship"))
    return "relationship";
  if (
    value.includes("回收") ||
    value.includes("兑现") ||
    value.includes("payoff")
  )
    return "payoff";
  if (value.includes("设定") || value.includes("world")) return "worldbuilding";
  return "progress";
}

function isPayoffPurpose(spec: OpeningChapterBlueprint): boolean {
  return purposeOf(spec) === "payoff";
}

function emotionTargetOf(value: string): ChapterEmotionTarget | null {
  const normalized = value.trim();
  const aliases: Readonly<Record<string, ChapterEmotionTarget>> = {
    爽感: "爽",
    爽: "爽",
    紧张: "紧张",
    期待: "期待",
    惊讶: "惊讶",
    震惊: "惊讶",
    压迫: "压迫",
    感动: "感动",
    暧昧: "暧昧",
    恐惧: "恐惧",
    轻松: "轻松",
  };
  return aliases[normalized] ?? null;
}

function hookTypeOf(value: string): ChapterHookType | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (
    normalized.includes("危险") ||
    normalized.includes("追") ||
    normalized.includes("danger")
  )
    return "danger";
  if (
    normalized.includes("决定") ||
    normalized.includes("选择") ||
    normalized.includes("decision")
  )
    return "decision";
  if (normalized.includes("身份") || normalized.includes("identity"))
    return "identity";
  if (normalized.includes("反转") || normalized.includes("reverse"))
    return "reverse";
  if (
    normalized.includes("揭") ||
    normalized.includes("真相") ||
    normalized.includes("reveal")
  )
    return "reveal";
  if (normalized.includes("到来") || normalized.includes("arrival"))
    return "arrival";
  if (/[？?]/u.test(value)) return "question";
  return "information_gap";
}

function readerPromiseOperationsFor(
  blueprint: NonNullable<SigningSprintState["openingBlueprint"]>,
  spec: OpeningChapterBlueprint,
  specIndex: number,
  firstPayoffIndex: number,
  promiseId: string,
): ReaderPromiseOperation[] {
  if (specIndex === 0) {
    return [
      {
        action: "OPEN",
        promiseId,
        title: blueprint.readerPromise,
        note: spec.readerExpectation || blueprint.expectation,
      },
    ];
  }
  if (firstPayoffIndex >= 0 && specIndex === firstPayoffIndex) {
    return [
      {
        action: "PAYOFF",
        promiseId,
        title: null,
        note: spec.payoff,
      },
    ];
  }
  if (firstPayoffIndex < 0 || specIndex < firstPayoffIndex) {
    return [
      {
        action: "ADVANCE",
        promiseId,
        title: null,
        note: spec.readerExpectation || spec.hook,
      },
    ];
  }
  return [];
}

function buildOpeningReport(
  projectId: string,
  story: SqliteStoryRepository,
  documents: SqliteDocumentRepository,
): OpeningSignalReport {
  const chapters = story
    .listOutline(projectId)
    .filter((node) => node.kind === "chapter")
    .slice(0, 3);
  const contents = chapters.flatMap((chapter) => {
    const document = documents.getByOutlineNodeId(projectId, chapter.id);
    if (!document) return [];
    // The writing desk autosaves author text as a draft. Opening Check must
    // inspect that latest readable text even before the author creates a
    // formal version; otherwise returning from chapter two or three would
    // silently make the report cover only the AI-accepted first chapter.
    const draft = documents.getDraft(projectId, document.id);
    const version = document.currentVersionId
      ? documents.getVersion(projectId, document.id, document.currentVersionId)
      : null;
    const content = draft ? draft.content : (version?.content ?? null);
    return content?.trim() ? [content] : [];
  });
  const report = analyzeOpeningText(
    contents.join("\n\n"),
    new Date().toISOString(),
  );
  return { ...report, analyzedChapterCount: contents.length };
}

function buildReadinessReport(
  projectId: string,
  workflow: ReturnType<SqliteSigningSprintRepository["ensure"]>,
  projects: SqliteProjectRepository,
  story: SqliteStoryRepository,
  documents: SqliteDocumentRepository,
  planning: SqliteWebNovelRepository,
  knowledge: SqliteOfficialKnowledgeRepository,
  runs: SqliteRunRepository,
): SigningReadinessReport {
  const project = requireProject(projects, projectId);
  const profile = planning.getBookProfile(projectId);
  const intent = story.getAuthorIntent(projectId);
  const allChapters = story
    .listOutline(projectId)
    .filter((node) => node.kind === "chapter")
    .sort((left, right) => left.ordinal - right.ordinal);
  const sprintChapters = allChapters.filter(
    (chapter) => chapter.metadata.createdWith === "signing-sprint",
  );
  const chapters = (
    workflow.state.openingBlueprint
      ? sprintChapters.length > 0
        ? sprintChapters
        : allChapters
      : allChapters
  ).slice(0, 3);
  const issues: ReadinessIssue[] = [];
  const refs = knowledge
    .retrieve("readiness", profile?.genre ?? null, 12)
    .flatMap((card) => card.sourceRefs);
  const sourceRefs = uniqueRefs(refs).filter(
    (ref) => knowledge.getSource(ref.sourceId)?.status === "ACTIVE",
  );
  if (!profile?.genre || !profile.audience || !profile.promise) {
    issues.push({
      code: "metadata.incomplete",
      title: "作品定位资料还不完整",
      severity: "warning",
      source: "chapterflow",
      detail: "题材、目标读者和核心阅读体验至少有一项还没有确认。",
      evidence: ["作品档案"],
      locations: ["快速开书 · 方向与定位"],
      suggestions: ["补齐定位后再回看包装和开篇是否一致。"],
      sourceRefs: [],
    });
  }
  const positioning = workflow.state.positioning;
  if (!positioning) {
    issues.push({
      code: "metadata.positioning_missing",
      title: "作品定位还没有确认",
      severity: "warning",
      source: "chapterflow",
      detail: "签约准备需要能回看主角目标、阻力、机制和长期空间。",
      evidence: ["快速开书 · 定位"],
      locations: ["快速开书 · 定位"],
      suggestions: ["完成定位候选的确认，或手动补齐定位字段。"],
      sourceRefs: [],
    });
  } else if (
    [
      positioning.oneLineStory,
      positioning.coreIdea,
      positioning.emotionalPayoff,
      positioning.readerProfile,
      positioning.protagonistDesire,
      positioning.obstacle,
      positioning.mechanism,
      positioning.coreConflict,
      positioning.longTermExpectation,
      positioning.sustainability.shortTermAppeal,
      positioning.sustainability.midTermExpansion,
      positioning.sustainability.longTermSpace,
    ].some((value) => !value.trim())
  ) {
    issues.push({
      code: "metadata.positioning_incomplete",
      title: "作品定位还有空白字段",
      severity: "warning",
      source: "chapterflow",
      detail: "短期吸引力、中期扩展和长期空间也需要留下作者判断。",
      evidence: ["快速开书 · 定位"],
      locations: ["快速开书 · 定位"],
      suggestions: ["补齐目标、阻力、推进机制和短中长期空间。"],
      sourceRefs: [],
    });
  }
  if (!project.premise || !intent?.promise) {
    issues.push({
      code: "metadata.promise_missing",
      title: "作品核心承诺还没有落下来",
      severity: "warning",
      source: "chapterflow",
      detail: "简介或作者意图中的核心承诺为空，暂时无法做完整的一致性预检。",
      evidence: ["作品简介", "作者意图"],
      locations: ["快速开书 · 定位"],
      suggestions: ["用一句话写清读者持续追更时最期待获得的体验。"],
      sourceRefs: [],
    });
  }
  const chapterSnapshots = chapters.map((chapter) => {
    const document = documents.getByOutlineNodeId(projectId, chapter.id);
    const version = document?.currentVersionId
      ? documents.getVersion(projectId, document.id, document.currentVersionId)
      : null;
    const draft = document ? documents.getDraft(projectId, document.id) : null;
    const content = draft ? draft.content : (version?.content ?? null);
    return { chapter, document, version, draft, content };
  });
  const missingContent = chapterSnapshots.filter(
    ({ document, content }) => !document || !content?.trim(),
  );
  const invalidDocumentVersions = chapterSnapshots.filter(
    ({ document, version }) => Boolean(document?.currentVersionId && !version),
  );
  if (chapters.length < 3 || missingContent.length > 0) {
    issues.push({
      code: "content.missing",
      title: "开篇正文还需要继续准备",
      severity: "warning",
      source: "chapterflow",
      detail: `当前纳入预检的开篇有 ${chapters.length} 个章节，其中 ${missingContent.length} 个没有可读取的正文内容。`,
      evidence: chapters.length
        ? chapters.map((chapter) => chapter.title)
        : ["还没有章节"],
      locations: missingContent.length
        ? missingContent.map(({ chapter }) => chapter.title)
        : ["快速开书 · 开篇与写作"],
      suggestions: ["先完成开篇三章的正文，再用开篇检查回看具体文本。"],
      sourceRefs: [],
    });
  }
  const duplicateGroups = new Map<string, string[]>();
  for (const { chapter, content } of chapterSnapshots) {
    if (!content?.trim()) continue;
    const fingerprint = sha256Hex(
      content.replace(/\s+/gu, "").trim().toLocaleLowerCase(),
    );
    duplicateGroups.set(fingerprint, [
      ...(duplicateGroups.get(fingerprint) ?? []),
      chapter.title,
    ]);
  }
  for (const titles of duplicateGroups.values()) {
    if (titles.length < 2) continue;
    issues.push({
      code: "content.duplicate",
      title: "开篇存在完全重复的正文",
      severity: "warning",
      source: "chapterflow",
      detail: "这是重复文本信号，不等同于平台结论；请作者回到原文确认。",
      evidence: titles,
      locations: titles,
      suggestions: ["检查是否误复制章节，或是否需要让章节产生新的推进。"],
      sourceRefs: [],
    });
  }
  const abandonedChapters = chapters.filter(
    (chapter) => chapter.status === "abandoned",
  );
  if (abandonedChapters.length > 0) {
    issues.push({
      code: "content.chapter_status_abandoned",
      title: "开篇包含已放弃章节",
      severity: "warning",
      source: "chapterflow",
      detail: "已放弃的章节不会被视为安全的开篇提交内容。",
      evidence: abandonedChapters.map((chapter) => chapter.title),
      locations: abandonedChapters.map((chapter) => chapter.title),
      suggestions: ["恢复章节或从开篇计划中移除它，再重新检查。"],
      sourceRefs: [],
    });
  }
  if (invalidDocumentVersions.length > 0) {
    issues.push({
      code: "technical.document_version_unreadable",
      title: "开篇正文版本无法安全读取",
      severity: "error",
      source: "chapterflow",
      detail:
        "至少一个开篇章节的当前版本引用不存在，预检不会把它当作已完成正文。",
      evidence: invalidDocumentVersions.map(({ chapter }) => chapter.title),
      locations: ["作品写作 · 章节版本"],
      suggestions: ["打开对应章节，重新保存或恢复一个有效版本后再检查。"],
      sourceRefs: [],
    });
  }
  const selected = selectedPackaging(workflow.state);
  if (!selected) {
    issues.push({
      code: "metadata.packaging_missing",
      title: "还没有选择正式作品包装",
      severity: "warning",
      source: "chapterflow",
      detail: "AI 或作者填写的包装仍是候选，尚未选择书名、简介和标签方向。",
      evidence: ["快速开书 · 作品包装"],
      locations: ["快速开书 · 作品包装"],
      suggestions: ["选择一个包装候选后，再检查它与正文的承诺是否一致。"],
      sourceRefs: [],
    });
  } else {
    if (selected.tags.length === 0) {
      issues.push({
        code: "metadata.tags_missing",
        title: "作品标签还没有填写",
        severity: "warning",
        source: "chapterflow",
        detail: "标签是作品包装的一部分，当前候选没有可供回看的标签。",
        evidence: [selected.title],
        locations: ["快速开书 · 作品包装"],
        suggestions: ["只保留正文能够兑现的题材和体验标签。"],
        sourceRefs: [],
      });
    }
    if (
      selected.title !== project.title ||
      selected.description !== (project.premise ?? "") ||
      (selected.tagline ?? null) !== project.subtitle
    ) {
      issues.push({
        code: "consistency.packaging_mismatch",
        title: "正式作品资料和已选包装不一致",
        severity: "warning",
        source: "chapterflow",
        detail: "作品标题、简介或宣传语已在其他入口发生变化。",
        evidence: [
          `包装：${selected.title} / ${selected.description}`,
          `作品资料：${project.title} / ${project.premise ?? ""}`,
        ],
        locations: ["快速开书 · 作品包装", "作品资料"],
        suggestions: ["选择一个主版本后重新保存，避免读者承诺互相打架。"],
        sourceRefs: [],
      });
    }
  }
  const blueprint = workflow.state.openingBlueprint;
  const firstThree = blueprint?.firstThreeChapters ?? [];
  const firstArc = blueprint?.firstArcChapters ?? [];
  if (
    !blueprint ||
    firstThree.length < 3 ||
    firstArc.length < 3 ||
    firstThree.some(
      (chapter) =>
        !chapter.title.trim() ||
        !chapter.protagonistAction.trim() ||
        !chapter.conflict.trim() ||
        !chapter.readerExpectation.trim() ||
        !chapter.hook.trim(),
    )
  ) {
    issues.push({
      code: "opening.blueprint_missing",
      title: "开篇三章计划还不完整",
      severity: "warning",
      source: "chapterflow",
      detail:
        "前三章和第一阶段计划都需要有足够章节；每章至少需要行动、阻力、读者期待和章尾变化，才能回到正文验证。",
      evidence: ["Opening Blueprint"],
      locations: ["快速开书 · 开篇"],
      suggestions: [
        "补齐前三章以及第一阶段至少三章的行动、阻力、期待和 Hook。",
      ],
      sourceRefs: [],
    });
  }
  const currentOpening = analyzeOpeningText(
    chapterSnapshots
      .flatMap(({ content }) => (content?.trim() ? [content] : []))
      .join("\n\n"),
    new Date().toISOString(),
  );
  if (!workflow.state.openingCheck) {
    issues.push({
      code: "opening.check_missing",
      title: "开篇信号检查还没有更新",
      severity: "warning",
      source: "chapterflow",
      detail: "签约准备不会把未检查的正文当作已经回看过。",
      evidence: ["Opening Check"],
      locations: ["快速开书 · 写作与预检"],
      suggestions: ["先运行开篇检查，再结合段落位置做作者判断。"],
      sourceRefs: [],
    });
  }
  for (const signal of currentOpening.signals) {
    const risky =
      signal.direction === "higher_is_risk" &&
      signal.threshold !== null &&
      signal.value > signal.threshold;
    if (!risky) continue;
    issues.push({
      code: `opening.signal.${signal.code}`,
      title: `${signal.label}需要回看`,
      severity: "warning",
      source: "chapterflow",
      detail: signal.explanation,
      evidence: [`${signal.label}：${signal.value}`],
      locations: signal.locations,
      suggestions: ["回到标出的段落判断是否能改为行动、冲突或更具体的表达。"],
      sourceRefs: [],
    });
  }
  const activeRuns = runs.listActiveRuns(projectId);
  if (activeRuns.length > 0) {
    issues.push({
      code: "technical.ai_task_active",
      title: "仍有 AI 任务没有落盘",
      severity: "warning",
      source: "chapterflow",
      detail:
        "运行中的任务可能仍在生成候选或正文，预检不会把未完成结果视为正式内容。",
      evidence: activeRuns.map((run) => `${run.recipe} · ${run.status}`),
      locations: ["任务中心"],
      suggestions: ["等待任务完成并明确接受或放弃结果后，再运行签约准备预检。"],
      sourceRefs: [],
    });
  }
  if (
    profile?.promise &&
    intent?.promise &&
    profile.promise !== intent.promise
  ) {
    issues.push({
      code: "consistency.promise_mismatch",
      title: "作品档案和作者意图的承诺不一致",
      severity: "warning",
      source: "chapterflow",
      detail: "同一作品的两个入口保存了不同的核心阅读体验。",
      evidence: [`作品档案：${profile.promise}`, `作者意图：${intent.promise}`],
      locations: ["作品档案", "作品设定 · 作者意图"],
      suggestions: ["选择一个主承诺，并让书名、简介、开篇计划跟随它。"],
      sourceRefs: [],
    });
  }
  const officialMatching = sourceRefs.length > 0 ? "ready" : "unconfirmed";
  if (officialMatching === "unconfirmed") {
    issues.push({
      code: "official.knowledge_unconfirmed",
      title: "当前官方规则还没有可用的已激活来源",
      severity: "warning",
      source: "official",
      detail:
        "请以当前番茄官方规则为准，ChapterFlow 不会用历史内容替代当前页面。",
      evidence: [],
      locations: ["签约准备预检"],
      suggestions: ["打开官方来源核对最新要求。"],
      sourceRefs: [],
    });
  }
  const hasBlocking = issues.some(
    (issue) => issue.severity === "error" || issue.severity === "warning",
  );
  return {
    status: hasBlocking ? "needs_attention" : "ready_to_prepare_submission",
    headline: hasBlocking
      ? "建议先处理以下问题，再准备提交"
      : "作品已具备继续准备提交的基础",
    issues,
    checks: {
      metadata: issues.some((issue) => issue.code.startsWith("metadata."))
        ? "needs_attention"
        : "ready",
      content: issues.some((issue) => issue.code.startsWith("content."))
        ? "needs_attention"
        : "ready",
      openingQuality: issues.some((issue) => issue.code.startsWith("opening."))
        ? "needs_attention"
        : "ready",
      consistency: issues.some((issue) => issue.code.startsWith("consistency."))
        ? "needs_attention"
        : "ready",
      officialMatching,
      technicalSafety: issues.some((issue) =>
        issue.code.startsWith("technical."),
      )
        ? "needs_attention"
        : "ready",
    },
    generatedAt: new Date().toISOString(),
  };
}

function uniqueRefs(
  refs: readonly KnowledgeCardSourceRef[],
): KnowledgeCardSourceRef[] {
  return [...new Map(refs.map((ref) => [ref.sourceId, ref])).values()];
}

/**
 * Refreshing a source must not silently rewrite active cards.  Instead, copy
 * only the cards that cited the old version into reviewable candidates whose
 * provenance points at the fetched source version.  A reviewer can activate
 * the source and each card independently after checking the page.
 */
function cloneKnowledgeCardsForSourceVersion(
  knowledge: SqliteOfficialKnowledgeRepository,
  previous: OfficialSource,
  candidate: OfficialSource,
  now: string,
): KnowledgeCard[] {
  return knowledge
    .listCards({ status: "ACTIVE", limit: 500 })
    .filter((card) =>
      card.sourceRefs.some((ref) => ref.sourceId === previous.id),
    )
    .map((card) =>
      knowledge.insertCard({
        ...card,
        id: randomUuid(),
        status: "CANDIDATE",
        sourceRefs: card.sourceRefs.map((ref) =>
          ref.sourceId === previous.id
            ? {
                ...ref,
                sourceId: candidate.id,
                sourceVersion: candidate.sourceVersion,
                sourceKey: candidate.sourceKey,
                title: candidate.title,
                url: candidate.url,
              }
            : ref,
        ),
        createdAt: now,
        updatedAt: now,
      }),
    );
}

function assertOfficialSourceUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new SigningSprintRouteError(
      "official_knowledge.source_url.invalid",
      "Official knowledge sources must use a valid HTTPS URL",
      422,
    );
  }
  const hostname = parsed.hostname.toLocaleLowerCase();
  if (
    parsed.protocol !== "https:" ||
    (hostname !== "fanqienovel.com" && !hostname.endsWith(".fanqienovel.com"))
  ) {
    throw new SigningSprintRouteError(
      "official_knowledge.source_url.not_official",
      "Official knowledge sources must come from fanqienovel.com",
      422,
    );
  }
}

export class SigningSprintRouteError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number) {
    super(message);
    this.name = "SigningSprintRouteError";
    this.code = code;
    this.statusCode = statusCode;
  }
}
