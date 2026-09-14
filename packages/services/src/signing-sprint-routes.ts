import {
  analyzeOpeningText,
  createDocument,
  createOutlineNode,
  randomUuid,
  type KnowledgeCardSourceRef,
  type OpeningChapterBlueprint,
  type OpeningSignalReport,
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
  SqliteDocumentRepository,
  SqliteOfficialKnowledgeRepository,
  SqliteProjectRepository,
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
  const workflows = new SqliteSigningSprintRepository(database);
  const knowledge = new SqliteOfficialKnowledgeRepository(database);
  const story = new SqliteStoryRepository(database);
  const planning = new SqliteWebNovelRepository(database);
  const documents = new SqliteDocumentRepository(database);
  const runs = new SqliteRunRepository(database);

  app.route("GET", "/api/official-knowledge/sources", async (request) => {
    const query = OfficialSourceQuerySchema.parse(request.query);
    return knowledge
      .listSources({ ...(query.status ? { status: query.status } : {}) })
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
      return {
        status: "review_required",
        source: OfficialSourceSchema.parse(source),
        message:
          "请打开官方来源核对最新内容，再提交新版本；ChapterFlow 不会静默改变已激活知识。",
      };
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
      const next = workflows.update(current.id, {
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
      if (next.state.openingBlueprint) {
        materializeOpeningPlan(next, story, documents, planning, now);
      }
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
        if (updated.state.openingBlueprint) {
          materializeOpeningPlan(updated, story, documents, planning, now);
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
        projects,
        story,
        documents,
        planning,
        knowledge,
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
        projects,
        story,
        documents,
        planning,
        knowledge,
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
        .object({ candidates: z.array(BookPackagingSchema).min(1) })
        .parse(payload);
      state.packaging = parsed.candidates;
      break;
    }
    case "GenerateOpeningBlueprint": {
      state.openingBlueprint = OpeningBlueprintSchema.parse(payload);
      break;
    }
    case "SigningReadinessReview": {
      state.readiness = SigningReadinessReportSchema.parse(payload);
      break;
    }
    case "EvaluateOpening": {
      // Evaluation candidates remain reviewable and do not mutate story data.
      break;
    }
    case "EvaluatePositioning":
    case "EvaluateBookPackaging":
    case "GenerateChapterFromIntent":
      break;
  }
  const step = stepForTask(candidate.task);
  const completedSteps = workflow.completedSteps.includes(step)
    ? workflow.completedSteps
    : [...workflow.completedSteps, step];
  const nextStep = nextWorkflowStep(step, completedSteps);
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
    planning.upsertChapterBrief(workflow.projectId, chapter.id, {
      goal: spec.protagonistAction,
      conflict: spec.conflict,
      payoff: spec.payoff,
      hook: spec.hook,
      readerExpectation: spec.readerExpectation,
      targetWords: spec.targetWords,
      purpose: purposeOf(spec),
      secondaryPurposes: [],
      emotionTarget: null,
      emotionCurve: [],
      readerPromiseOperations: [],
      payoffStrength: 0,
      hookType: null,
      hookStrength: 0,
      informationGain: 1,
      endingPull: 1,
      sceneStructure: [],
      characterIds: [],
      foreshadowIds: [],
      timelineIds: [],
      pacing: "fast",
      expectedVersion: null,
      now,
    });
  }
}

function purposeOf(
  spec: OpeningChapterBlueprint,
):
  | "setup"
  | "progress"
  | "conflict"
  | "reveal"
  | "payoff"
  | "turning_point"
  | "relationship"
  | "worldbuilding"
  | "transition"
  | "climax" {
  const value = spec.purpose.toLowerCase();
  if (value.includes("冲突") || value.includes("conflict")) return "conflict";
  if (value.includes("揭") || value.includes("reveal")) return "reveal";
  if (value.includes("转") || value.includes("turn")) return "turning_point";
  if (value.includes("关系") || value.includes("relationship"))
    return "relationship";
  if (value.includes("回收") || value.includes("payoff")) return "payoff";
  return "progress";
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
    if (!document?.currentVersionId) return [];
    const version = documents.getVersion(
      projectId,
      document.id,
      document.currentVersionId,
    );
    return version ? [version.content] : [];
  });
  const report = analyzeOpeningText(
    contents.join("\n\n"),
    new Date().toISOString(),
  );
  return { ...report, analyzedChapterCount: chapters.length };
}

function buildReadinessReport(
  projectId: string,
  projects: SqliteProjectRepository,
  story: SqliteStoryRepository,
  documents: SqliteDocumentRepository,
  planning: SqliteWebNovelRepository,
  knowledge: SqliteOfficialKnowledgeRepository,
): SigningReadinessReport {
  const project = requireProject(projects, projectId);
  const profile = planning.getBookProfile(projectId);
  const intent = story.getAuthorIntent(projectId);
  const chapters = story
    .listOutline(projectId)
    .filter((node) => node.kind === "chapter")
    .slice(0, 3);
  const issues: ReadinessIssue[] = [];
  const refs = knowledge
    .retrieve("readiness", profile?.genre ?? null, 12)
    .flatMap((card) => card.sourceRefs);
  const sourceRefs = uniqueRefs(refs);
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
  const missingContent = chapters.filter((chapter) => {
    const document = documents.getByOutlineNodeId(projectId, chapter.id);
    return !document?.currentVersionId;
  });
  if (chapters.length < 3 || missingContent.length > 0) {
    issues.push({
      code: "opening.content_missing",
      title: "开篇正文还需要继续准备",
      severity: "warning",
      source: "chapterflow",
      detail: `当前已规划 ${chapters.length} 个开篇章节，其中 ${missingContent.length} 个还没有正文版本。`,
      evidence: chapters.length
        ? chapters.map((chapter) => chapter.title)
        : ["还没有章节"],
      locations: ["快速开书 · 开篇与写作"],
      suggestions: ["先完成计划中的开篇章节，再用开篇检查回看具体文本。"],
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
      content: issues.some((issue) => issue.code.startsWith("opening."))
        ? "needs_attention"
        : "ready",
      consistency: issues.some((issue) => issue.code.startsWith("consistency."))
        ? "needs_attention"
        : "ready",
      officialMatching,
    },
    generatedAt: new Date().toISOString(),
  };
}

function uniqueRefs(
  refs: readonly KnowledgeCardSourceRef[],
): KnowledgeCardSourceRef[] {
  return [...new Map(refs.map((ref) => [ref.sourceId, ref])).values()];
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
