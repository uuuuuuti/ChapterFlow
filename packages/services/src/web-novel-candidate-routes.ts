import { sha256Hex } from "@narralume/domain";
import {
  CreateWebNovelCandidateRequestSchema,
  DecideWebNovelCandidateItemRequestSchema,
  WebNovelCandidateKindSchema,
  WebNovelCandidateRunAcceptedSchema,
  WebNovelCandidateSetSchema,
} from "@narralume/contracts";
import { buildWebNovelCandidateRecipe } from "@narralume/harness";
import {
  SqliteProjectRepository,
  SqliteRunRepository,
  type NarrativeDatabase,
} from "@narralume/persistence";
import { z } from "zod";

import type { RunCoordinator, RouteApp } from "@narralume/services";
import {
  requireWritingAssignment,
  validateRunOrigin,
  WebNovelCandidateService,
  withRuntimeModelPolicy,
} from "@narralume/services";

const ProjectParamsSchema = z.object({ projectId: z.string().trim().min(1) });
const CandidateParamsSchema = z.object({
  projectId: z.string().trim().min(1),
  candidateSetId: z.string().trim().min(1),
});
const CandidateItemParamsSchema = CandidateParamsSchema.extend({
  itemId: z.string().trim().min(1),
});

export interface RegisterWebNovelCandidateRouteOptions {
  runCoordinator: RunCoordinator;
  enableBackgroundWorker: boolean;
  environment: Readonly<Record<string, string | undefined>>;
}

export function registerWebNovelCandidateRoutes(
  app: RouteApp,
  database: NarrativeDatabase,
  options: RegisterWebNovelCandidateRouteOptions,
): void {
  const projects = new SqliteProjectRepository(database);
  const runs = new SqliteRunRepository(database);
  const service = new WebNovelCandidateService(database);

  app.route(
    "POST",
    "/api/projects/:projectId/web-novel/candidates",
    async (request) => {
      const { projectId } = ProjectParamsSchema.parse(request.params);
      requireProject(projects, projectId);
      const input = CreateWebNovelCandidateRequestSchema.parse(request.body);
      const kind = WebNovelCandidateKindSchema.parse(input.kind);
      const outlineNodeId = input.outlineNodeId ?? null;
      if (kind === "brief" && !outlineNodeId) {
        throw new WebNovelCandidateRouteError(
          "web_novel_candidate.brief.outline_required",
          "A chapter brief candidate requires an outline node",
          422,
        );
      }
      const origin = input.origin
        ? validateRunOrigin(database, projectId, input.origin, {
            ...(outlineNodeId ? { expectedOutlineNodeId: outlineNodeId } : {}),
          })
        : null;
      const requestHash = hashStable({
        kind,
        outlineNodeId,
        instruction: input.instruction,
        origin,
      });
      const runId = deterministicId(
        "web-novel-candidate",
        `${projectId}:${kind}:${outlineNodeId ?? "profile"}`,
        input.requestId,
      );
      const replay = runs.getRun(runId);
      if (replay) {
        if (replay.policy.creationRequestHash !== requestHash) {
          throw new WebNovelCandidateRouteError(
            "web_novel_candidate.idempotency_conflict",
            "The same requestId was already used for a different web-novel candidate request",
            409,
          );
        }
        return {
          status: 202,
          body: WebNovelCandidateRunAcceptedSchema.parse({
            runId,
            idempotentReplay: true,
          }),
        };
      }
      const activeRun = runs
        .listActiveRuns(projectId)
        .find(
          (candidate) =>
            candidate.recipe === "web-novel-candidate" &&
            candidate.policy.webNovelCandidateKind === kind &&
            (candidate.policy.outlineNodeId ?? null) === outlineNodeId,
        );
      if (activeRun) {
        throw new WebNovelCandidateRouteError(
          "web_novel_candidate.active_run_exists",
          "This web-novel planning context already has an active candidate task",
          409,
        );
      }
      requireWritingAssignment(database, options.environment);
      const recipe = buildWebNovelCandidateRecipe(runId);
      const now = new Date().toISOString();
      runs.create({
        id: runId,
        projectId,
        recipe: recipe.name,
        recipeVersion: recipe.version,
        mode: "manual",
        targetOutlineNodeId: outlineNodeId,
        policy: withRuntimeModelPolicy(
          {
            webNovelCandidateKind: kind,
            webNovelCandidateInstruction: input.instruction,
            outlineNodeId,
            webNovelCandidateMaxOutputTokens: 6_000,
            creationRequestId: input.requestId,
            creationRequestHash: requestHash,
            origin: origin ?? {
              surface:
                kind === "profile" ? "web-novel-profile" : "web-novel-brief",
              documentId: null,
              ...(outlineNodeId ? { outlineNodeId } : {}),
            },
          },
          options.environment,
        ),
        steps: recipe.steps,
        now,
      });
      if (options.enableBackgroundWorker) options.runCoordinator.wake();
      return {
        status: 202,
        body: WebNovelCandidateRunAcceptedSchema.parse({
          runId,
          idempotentReplay: false,
        }),
      };
    },
  );

  app.route(
    "GET",
    "/api/projects/:projectId/web-novel/candidates",
    async (request) => {
      const { projectId } = ProjectParamsSchema.parse(request.params);
      requireProject(projects, projectId);
      const query = z
        .object({
          kind: WebNovelCandidateKindSchema.optional(),
          outlineNodeId: z.string().trim().min(1).optional(),
        })
        .parse(request.query ?? {});
      return service.list(projectId, query.kind, query.outlineNodeId);
    },
  );

  app.route(
    "GET",
    "/api/projects/:projectId/web-novel/candidates/:candidateSetId",
    async (request) => {
      const { projectId, candidateSetId } = CandidateParamsSchema.parse(
        request.params,
      );
      requireProject(projects, projectId);
      return WebNovelCandidateSetSchema.parse(
        service.get(projectId, candidateSetId),
      );
    },
  );

  app.route(
    "POST",
    "/api/projects/:projectId/web-novel/candidates/:candidateSetId/items/:itemId/decisions",
    async (request) => {
      const { projectId, candidateSetId, itemId } =
        CandidateItemParamsSchema.parse(request.params);
      requireProject(projects, projectId);
      const input = DecideWebNovelCandidateItemRequestSchema.parse(
        request.body,
      );
      return service.decideItem({
        projectId,
        setId: candidateSetId,
        itemId,
        ...input,
      });
    },
  );
}

function requireProject(
  projects: SqliteProjectRepository,
  projectId: string,
): void {
  if (!projects.get(projectId)) {
    throw new WebNovelCandidateRouteError(
      "project.not_found",
      "Project not found",
      404,
    );
  }
}

function deterministicId(
  kind: string,
  scope: string,
  requestId: string,
): string {
  const hex = sha256Hex(`${kind}\0${scope}\0${requestId}`);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function hashStable(value: unknown): string {
  return sha256Hex(stableJson(value));
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
    .join(",")}}`;
}

export class WebNovelCandidateRouteError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = "WebNovelCandidateRouteError";
  }
}
