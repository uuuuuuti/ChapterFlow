import { resolve } from "node:path";

import { config as loadDotEnv } from "dotenv";

import { resolveEffectivePolicy } from "@narralume/contracts";
import { createProject, type RunStatus } from "@narralume/domain";
import {
  buildSigningSprintRecipe,
  HarnessSupervisor,
} from "@narralume/harness";
import {
  GatewayNarrativeModelClient,
  SigningSprintWorkerSuite,
} from "@narralume/narrative";
import {
  SqliteAssignmentRepository,
  SqliteLlmCallRepository,
  SqliteModelRepository,
  SqliteProjectRepository,
  SqliteProviderRepository,
  SqliteRunRepository,
  SqliteSigningSprintRepository,
  resolveCredential,
  type StoredProvider,
} from "@narralume/persistence";
import { NodeNarrativeDatabase } from "@narralume/persistence/node";
import {
  seedEnvironmentModelConfig,
  seedOfficialKnowledge,
} from "@narralume/services";

import {
  createSmokeWorkspace,
  currentGitCommit,
  finalizeSmokeWorkspace,
  installSignalFlush,
  interruptOrphanedWork,
  originOf,
  parseRealSmokeArgs,
  RunStateTracker,
  RunWatcher,
  SmokeLogger,
  writeSmokeSummary,
  type SmokeCheck,
} from "./real-smoke-harness.js";

loadDotEnv({ path: resolve(process.cwd(), ".env.local"), quiet: true });

const scenario = "signing-sprint-real";
const args = parseRealSmokeArgs(process.argv.slice(2), {
  script: "signing-sprint-real-smoke.ts",
  defaultProtocols: ["openai-responses"],
  singleProtocol: true,
});
const protocol = args.protocols[0]!;
const workspace = createSmokeWorkspace(scenario, { outputDir: args.outputDir });
const logger = new SmokeLogger(workspace.jsonlPath, scenario, {
  diagnostic: args.diagnostic,
});
installSignalFlush(logger);
const startedAt = new Date().toISOString();
const checks: SmokeCheck[] = [];
let success = false;

const database = new NodeNarrativeDatabase(workspace.dbPath);
database.migrate();
interruptOrphanedWork(logger, database);
seedEnvironmentModelConfig(database, process.env);
seedOfficialKnowledge(database);

const providers = new SqliteProviderRepository(database);
const models = new SqliteModelRepository(database);
const assignments = new SqliteAssignmentRepository(database);
const provider = providers
  .list(true)
  .find((candidate) => candidate.wireApi === protocol) as
  StoredProvider | undefined;
const sprintModel = provider
  ? models.listByProvider(provider.id, true)[0]
  : undefined;
const credential = provider ? resolveCredential(provider, process.env) : null;
const model = new GatewayNarrativeModelClient(database, process.env);
const suite = new SigningSprintWorkerSuite(database, model);
const runs = new SqliteRunRepository(database);
const supervisor = new HarnessSupervisor(runs, suite.registry(), {
  retryDelayMs: 10,
});
const tracker = new RunStateTracker(logger, database, {
  diagnostic: args.diagnostic,
});
const watcher = new RunWatcher(tracker);
watcher.startPolling();
const terminal = new Set<RunStatus>([
  "completed",
  "failed",
  "cancelled",
  "awaiting_user",
]);

logger.event("scenario.start", {
  protocols: args.protocols,
  workspace: workspace.dir,
  gitCommit: currentGitCommit(),
});

try {
  if (!provider || !sprintModel || !credential?.ok) {
    throw new Error(
      `${protocol} signing sprint model configuration is missing`,
    );
  }
  assignments.set("writing", sprintModel.id, new Date().toISOString());
  logger.event("model.resolved", {
    protocol,
    model: sprintModel.modelId,
    baseUrlOrigin: originOf(provider.baseUrl),
  });

  const projectId = `${scenario}-${protocol}`;
  const now = new Date().toISOString();
  new SqliteProjectRepository(database).insert(
    createProject({
      id: projectId,
      title: "七秒之后的死者",
      premise:
        "一个落魄刑警能看见死者临终前七秒的片段。妹妹失踪后，他必须在城市停电前追查真正的凶手，并面对自己曾经做错的案子。",
      now,
    }),
  );
  new SqliteSigningSprintRepository(database).ensure(projectId, now);

  const task = "BrainstormBookDirection" as const;
  const instruction =
    "请围绕男性主角、都市悬疑、临终前七秒、落魄刑警追查失踪妹妹，形成一个可持续推进的开书方向。强调悬念、反转和主角成长；只给可审阅候选，不承诺签约结果。";
  const runId = `${projectId}-run`;
  const recipe = buildSigningSprintRecipe(runId);
  const policy = {
    ...resolveEffectivePolicy({
      contextWindow: 128_000,
      planningMaxOutputTokens: 16_000,
      maxRetries: 1,
      maxRepairAttempts: 2,
    }).effectivePolicy,
    signingSprintTask: task,
    signingSprintInstruction: instruction,
  };
  runs.create({
    id: runId,
    projectId,
    recipe: recipe.name,
    recipeVersion: recipe.version,
    mode: "manual",
    targetOutlineNodeId: null,
    policy,
    steps: recipe.steps,
    now,
  });
  watcher.track(runId);
  logger.event("run.created", { runId, projectId, protocol, task });

  for (let index = 0; index < 300; index += 1) {
    const status = runs.getRun(runId)?.status;
    if (status && terminal.has(status)) break;
    const processed = await supervisor.processRun(
      runId,
      `real-smoke-${protocol}`,
    );
    tracker.diff(runId);
    if (!processed) {
      const current = runs.getRun(runId)?.status;
      if (current === "failed_recoverable" || current === "running") {
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
        continue;
      }
      break;
    }
  }

  tracker.diff(runId);
  const snapshot = runs.getSnapshot(runId);
  const candidates = new SqliteSigningSprintRepository(database).listCandidates(
    projectId,
  );
  const calls = new SqliteLlmCallRepository(database).listForRun(runId);
  const candidate = candidates.find((item) => item.task === task);
  const completed = snapshot.run.status === "completed";
  const staged = Boolean(candidate && candidate.status === "candidate");
  checks.push({
    name: "signing sprint run completed",
    ok: completed,
    detail: `status=${snapshot.run.status}`,
  });
  checks.push({
    name: "direction candidate staged",
    ok: staged,
    detail: candidate ? `status=${candidate.status}` : "candidate missing",
  });
  checks.push({
    name: "official provenance attached",
    ok: Boolean(candidate?.provenance.sourceRefs.length),
    detail: `${candidate?.provenance.sourceRefs.length ?? 0} source refs`,
  });
  logger.event("scenario.check", {
    runId,
    status: snapshot.run.status,
    calls: calls.length,
    candidate: candidate?.id ?? null,
    sourceRefs: candidate?.provenance.sourceRefs.length ?? 0,
  });
  process.stdout.write(
    `${protocol}: ${snapshot.run.status.toUpperCase()} · ${calls.length} calls · ${candidate ? "candidate staged" : "no candidate"}\n`,
  );
  if (!completed || !staged) {
    const failedStep = snapshot.steps.find((step) => step.status === "failed");
    if (failedStep?.error) {
      process.stdout.write(
        `  ${failedStep.kind}: ${failedStep.error.code} · ${failedStep.error.message.slice(0, 500)}\n`,
      );
    }
    throw new Error("Signing Sprint real scenario did not complete");
  }
  success = true;
} catch (error) {
  logger.event("scenario.error", {
    message: error instanceof Error ? error.message : String(error),
  });
  checks.push({
    name: "scenario completed",
    ok: false,
    detail: error instanceof Error ? error.message : String(error),
  });
} finally {
  watcher.stop();
  logger.event("scenario.end", {
    success,
    durationMs: Date.now() - Date.parse(startedAt),
  });
  writeSmokeSummary({
    workspace,
    database,
    scenario,
    protocols: args.protocols,
    startedAt,
    success,
    checks,
  });
  database.close();
  finalizeSmokeWorkspace(workspace, {
    success,
    keepArtifacts: args.keepArtifacts,
  });
}

if (!success) {
  process.exitCode = 1;
} else {
  process.stdout.write("Signing Sprint real scenario completed.\n");
}
