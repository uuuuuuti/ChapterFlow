import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import type { FastifyInstance } from "fastify";
import { config as loadDotEnv } from "dotenv";

import { resolveEffectivePolicy } from "@narralume/contracts";
import type { SigningSprintTask } from "@narralume/domain";
import {
  SqliteAssignmentRepository,
  SqliteDocumentRepository,
  SqliteLlmCallRepository,
  SqliteModelRepository,
  SqliteProviderRepository,
  SqliteStoryRepository,
  SqliteWebNovelRepository,
  resolveCredential,
  type StoredProvider,
} from "@narralume/persistence";
import { NodeNarrativeDatabase } from "@narralume/persistence/node";
import { seedEnvironmentModelConfig } from "@narralume/services";

import { buildApp } from "../apps/server/src/app.js";
import type { ServerConfig } from "../apps/server/src/config.js";
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
const runIds: string[] = [];
let success = false;

const database = new NodeNarrativeDatabase(workspace.dbPath);
database.migrate();
interruptOrphanedWork(logger, database);
seedEnvironmentModelConfig(database, process.env);

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
const tracker = new RunStateTracker(logger, database, {
  diagnostic: args.diagnostic,
});
const watcher = new RunWatcher(tracker);
watcher.startPolling();
let app: FastifyInstance | null = null;

logger.event("scenario.start", {
  protocols: args.protocols,
  workspace: workspace.dir,
  gitCommit: currentGitCommit(),
});

function recordCheck(name: string, ok: boolean, detail?: string): void {
  checks.push({ name, ok, ...(detail ? { detail } : {}) });
  logger.event("scenario.check", { name, ok, ...(detail ? { detail } : {}) });
}

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

  const config: ServerConfig = {
    dataDirectory: workspace.dir,
    databasePath: workspace.dbPath,
    host: "127.0.0.1",
    port: 4317,
    environment: "test",
  };
  app = await buildApp({
    config,
    database,
    environment: process.env,
    logger: false,
    enableRunWorker: false,
  });

  const project = await jsonRequest<ProjectSummary>(
    app,
    "POST",
    "/api/projects",
    {
      requestId: randomUUID(),
      title: "七秒之后的死者",
      premise:
        "一个落魄刑警能看见死者临终前七秒的片段。妹妹失踪后，他必须在城市停电前追查真正的凶手，并面对自己曾经做错的案子。",
      bookProfile: {
        presetId: null,
        genre: "都市悬疑",
        audience: "喜欢悬疑反转、成长线和强钩子的男频读者",
        promise: "每一条声音线索都会逼近真相，也会带来记忆代价。",
        tone: "紧张、具体、持续反转",
        endingDirection: null,
        pov: "第三人称限知",
        updateCadence: null,
        targetWordsPerChapter: 2500,
        boundaries: [],
        worldRules: [],
        arcNotes: [],
      },
    },
    [201],
  );
  const projectId = project.id;
  await jsonRequest(
    app,
    "POST",
    `/api/projects/${projectId}/signing-sprint`,
    {
      title: project.title,
      premise: project.premise,
      genre: "都市悬疑",
      audience: "喜欢悬疑反转、成长线和强钩子的男频读者",
      coreEmotion: "紧张、反转、成长和阶段性爽感",
    },
    [200],
  );
  recordCheck("blank project entered signing sprint", true, projectId);

  const policy = {
    ...resolveEffectivePolicy({
      contextWindow: 128_000,
      maxRetries: 2,
      maxRepairAttempts: 2,
    }).effectivePolicy,
    signingSprintMaxOutputTokens: 7_000,
  };

  const direction = await runTask(
    app,
    projectId,
    "BrainstormBookDirection",
    "围绕男性主角、都市悬疑、临终前七秒、落魄刑警追查失踪妹妹，形成一个可持续推进的开书方向。必须给出清晰题材、目标读者、核心情绪、主角种子、钩子和差异化；只给可审阅候选，不承诺签约结果。",
    policy,
    watcher,
    tracker,
    logger,
    recordCheck,
  );
  await acceptCandidate(app, projectId, direction, logger, recordCheck);

  const positioning = await runTask(
    app,
    projectId,
    "RefineBookPositioning",
    "请把当前方向完善成完整作品定位。所有字段都要填写：一句话故事、核心脑洞、至少两个卖点、核心情绪价值、目标读者、主角欲望、核心阻力、机制、主要矛盾、长期读者期待，以及短期吸引力、中期扩展性、长期故事空间。不要给概率或签约结论。",
    policy,
    watcher,
    tracker,
    logger,
    recordCheck,
  );
  await acceptCandidate(app, projectId, positioning, logger, recordCheck);

  const positioningReview = await runTask(
    app,
    projectId,
    "EvaluatePositioning",
    "请从卖点清晰度、主角目标、冲突、情绪价值、机制边界、同质化风险和短中长期可持续性检查当前定位，给出具体优势、风险和下一步建议；不要使用签约概率。",
    policy,
    watcher,
    tracker,
    logger,
    recordCheck,
  );
  await acceptCandidate(app, projectId, positioningReview, logger, recordCheck);

  const currentAfterPositioning = await getSprint(app, projectId);
  const engine = await patchSprint(app, projectId, {
    expectedVersion: currentAfterPositioning.workflow.version,
    currentStep: "packaging",
    completedSteps: uniqueSteps([
      ...currentAfterPositioning.workflow.completedSteps,
      "story_engine",
    ]),
    state: {
      storyEngine: {
        protagonist: "沈砚，因姐姐旧案受挫的落魄刑警",
        relationships: ["失踪的姐姐", "不愿承认旧案疑点的前同事"],
        antagonist: "篡改死者声音记录、抹掉证据的人",
        mechanism: "听见死者临终前七秒的声音",
        worldRules: ["每次使用能力都会丢失一段近期记忆"],
        conflict: "沈砚必须在记忆缺口扩大前查清姐姐旧案",
      },
    },
  });
  recordCheck(
    "story engine confirmed in existing author model",
    Boolean(engine.workflow.state.storyEngine),
  );

  const packaging = await runTask(
    app,
    projectId,
    "GenerateBookPackaging",
    "请生成 3 到 5 个真正差异化的作品包装候选。每个候选必须包含书名、书名方向、简介、题材、至少两个标签、一句宣传语、封面视觉 brief 和取舍理由；候选之间要有明显不同，不要只替换同义词。",
    policy,
    watcher,
    tracker,
    logger,
    recordCheck,
  );
  const packagingItems = arrayField(packaging.payload, "candidates");
  if (packagingItems.length < 3 || packagingItems.length > 5) {
    throw new Error(
      `real packaging candidate count is ${packagingItems.length}, expected 3-5`,
    );
  }
  await acceptCandidate(app, projectId, packaging, logger, recordCheck);

  const afterPackaging = await getSprint(app, projectId);
  await patchSprint(app, projectId, {
    expectedVersion: afterPackaging.workflow.version,
    currentStep: "opening",
    completedSteps: uniqueSteps([
      ...afterPackaging.workflow.completedSteps,
      "packaging",
    ]),
    state: { selectedPackagingId: "0" },
  });
  recordCheck("packaging selected", true, "candidate index 0");

  const packagingReview = await runTask(
    app,
    projectId,
    "EvaluateBookPackaging",
    "请检查已选包装是否和作品定位、主角困境、核心机制以及读者承诺一致。给出具体优势、风险和可执行调整，不要把 ChapterFlow 判断包装成番茄官方规定。",
    policy,
    watcher,
    tracker,
    logger,
    recordCheck,
  );
  await acceptCandidate(app, projectId, packagingReview, logger, recordCheck);

  const opening = await runTask(
    app,
    projectId,
    "GenerateOpeningBlueprint",
    "请生成完整 Opening Blueprint：尽快进入故事，建立主角和异常，明确读者承诺、开篇钩子、期待和信息揭示顺序。firstThreeChapters 必须恰好 3 章，firstArcChapters 至少 3 章；每章都必须填写行动、冲突、读者期待、情绪、Hook 和 payoff。前三章是 ChapterFlow 的创作方法，不是平台硬规则。",
    policy,
    watcher,
    tracker,
    logger,
    recordCheck,
  );
  const firstThree = arrayField(opening.payload, "firstThreeChapters");
  const firstArc = arrayField(opening.payload, "firstArcChapters");
  if (firstThree.length !== 3 || firstArc.length < 3) {
    throw new Error(
      `real opening plan is incomplete: firstThree=${firstThree.length}, firstArc=${firstArc.length}`,
    );
  }
  await acceptCandidate(app, projectId, opening, logger, recordCheck);

  const story = new SqliteStoryRepository(database);
  const documents = new SqliteDocumentRepository(database);
  const openingChapters = story
    .listOutline(projectId)
    .filter(
      (node) =>
        node.kind === "chapter" &&
        node.metadata.createdWith === "signing-sprint",
    )
    .slice(0, 3);
  if (openingChapters.length !== 3) {
    throw new Error(
      `opening materialization created ${openingChapters.length} chapters`,
    );
  }
  const openingTexts = [
    [
      "沈砚赶到旧案仓库时，停电预警刚刚响过第二遍。姐姐留下的录音机卡在七秒的位置，里面却传来明天才会发生的脚步声。",
      "他没有先查电路，而是把录音机放到尸检台边，按下播放键。死者最后一句话只剩半截：‘别让沈砚……’。声音落下的瞬间，他忘了自己为什么会害怕那扇门。",
      "门后有人擦掉了血迹，地上只留下一枚写着时间的铜片。沈砚把铜片收进证物袋，决定在下一次停电前找到录音的来源。",
    ].join("\n\n"),
    [
      "第二天，沈砚沿着录音里的金属回响找到废弃变电站。值班员说这里三年没有人来过，可门锁上的新划痕还沾着油。",
      "他播放姐姐旧案的第二段录音，耳边同时出现两种声音：死者临终前的喘息，以及一个尚未发生的女人哭声。每听清一层，他就会失去一小段最近的记忆。",
      "变电站深处亮起一盏不该通电的红灯。沈砚看见灯下的纸条写着自己的名字，而纸条背面标着姐姐失踪当晚的时间。",
    ].join("\n\n"),
    [
      "停电开始后，沈砚进入红灯照出的地下通道。墙上的编号和姐姐案卷里的声音波形完全一致，尽头却摆着一台仍在工作的旧录音设备。",
      "他先用一段无关录音测试能力，旁边的同事立刻忘记了刚才说过的路线。代价终于变得可以验证：声音会留下线索，也会拿走见证线索的人。",
      "设备里传出姐姐的声音：‘如果你听到这里，说明你已经忘了第一次见我。’ 沈砚没有按停播放，反而把最后七秒完整保存下来。",
    ].join("\n\n"),
  ];
  for (const [index, chapter] of openingChapters.entries()) {
    const document = documents.getByOutlineNodeId(projectId, chapter.id);
    if (!document) throw new Error(`missing document for ${chapter.id}`);
    documents.appendVersion(projectId, document.id, {
      id: randomUUID(),
      content: openingTexts[index]!,
      source: "real-smoke:opening-fixture",
      expectedCurrentVersionId: document.currentVersionId,
      now: new Date().toISOString(),
    });
  }
  recordCheck("opening blueprint materialized three existing chapters", true);

  const openingReview = await runTask(
    app,
    projectId,
    "EvaluateOpening",
    "请像开篇责编一样复核这三章正文。至少指出一个真实、可操作的问题；每个问题都必须写出具体位置（例如‘第 1 章 · 第 2 段’），并分别标记 source 为 official 或 chapterflow。说明核心卖点、主角、冲突、期待和章尾拉力是否进入正文；不要给签约结论。",
    policy,
    watcher,
    tracker,
    logger,
    recordCheck,
  );
  const reviewIssues = arrayField(openingReview.payload, "issues");
  const locatedIssues =
    reviewIssues.length > 0 &&
    reviewIssues.every((issue) => arrayField(issue, "locations").length > 0);
  recordCheck(
    "real opening review has concrete locations",
    locatedIssues,
    `${reviewIssues.length} issues`,
  );
  await acceptCandidate(app, projectId, openingReview, logger, recordCheck);

  const firstDocument = documents.getByOutlineNodeId(
    projectId,
    openingChapters[0]!.id,
  );
  if (!firstDocument) throw new Error("first opening document disappeared");
  const beforeVersionCount = documents.listVersions(
    projectId,
    firstDocument.id,
  ).length;
  const chapterIntent = await runTask(
    app,
    projectId,
    "GenerateChapterFromIntent",
    "请根据当前定位、开篇计划和第一章现有章节节点，整理一份可执行的章节写作意图。只输出章节目标、冲突、期待、payoff、Hook、节奏和目标字数，不要生成或改写正文。",
    policy,
    watcher,
    tracker,
    logger,
    recordCheck,
  );
  await acceptCandidate(app, projectId, chapterIntent, logger, recordCheck);
  const afterVersionCount = documents.listVersions(
    projectId,
    firstDocument.id,
  ).length;
  const brief = new SqliteWebNovelRepository(database).getChapterBrief(
    projectId,
    openingChapters[0]!.id,
  );
  recordCheck(
    "chapter intent acceptance leaves prose untouched",
    beforeVersionCount === afterVersionCount && Boolean(brief),
    `versions=${beforeVersionCount}, brief=${Boolean(brief)}`,
  );

  const openingCheck = await jsonRequest<OpeningCheckResponse>(
    app,
    "POST",
    `/api/projects/${projectId}/signing-sprint/opening-check`,
    {},
    [200],
  );
  const locatedSignals = openingCheck.report.signals.filter(
    (signal) => signal.locations.length > 0,
  ).length;
  recordCheck(
    "opening check covers three chapters with locations",
    openingCheck.report.analyzedChapterCount === 3 && locatedSignals > 0,
    `chapters=${openingCheck.report.analyzedChapterCount}, locatedSignals=${locatedSignals}`,
  );

  const readiness = await jsonRequest<ReadinessResponse>(
    app,
    "POST",
    `/api/projects/${projectId}/signing-sprint/readiness`,
    {},
    [200],
  );
  const readinessPromise = findPlatformPromise(JSON.stringify(readiness));
  recordCheck(
    "deterministic signing readiness returned without a platform verdict",
    ["ready_to_prepare_submission", "needs_attention"].includes(
      readiness.report.status,
    ) && readinessPromise === null,
    readinessPromise
      ? `forbidden promise pattern: ${readinessPromise}`
      : `status=${readiness.report.status}`,
  );

  const readinessCandidate = await runTask(
    app,
    projectId,
    "SigningReadinessReview",
    "请汇总当前作品资料、三章正文、开篇检查、定位和官方知识来源，输出签约准备预检。只能使用‘可以准备提交’或‘建议先处理问题’，不能声称会过签、不会过签、签约概率或官方评分；当前平台规则不确定时明确提示以番茄最新官方页面为准。",
    policy,
    watcher,
    tracker,
    logger,
    recordCheck,
  );
  const readinessText = JSON.stringify(readinessCandidate.payload);
  const candidatePromise = findPlatformPromise(readinessText);
  recordCheck(
    "real signing readiness avoids platform promises",
    candidatePromise === null,
    candidatePromise
      ? `forbidden promise pattern: ${candidatePromise}`
      : undefined,
  );
  await acceptCandidate(
    app,
    projectId,
    readinessCandidate,
    logger,
    recordCheck,
  );

  const final = await getSprint(app, projectId);
  const finalBlueprint = recordField(final.workflow.state, "openingBlueprint");
  const finalReadiness = recordField(final.workflow.state, "readiness");
  recordCheck(
    "real signing sprint reaches reviewable submission state",
    Boolean(finalBlueprint && finalReadiness) &&
      final.workflow.completedSteps.includes("writing"),
    `completed=${final.workflow.completedSteps.join(",")}`,
  );

  const llmCalls = new SqliteLlmCallRepository(database);
  const scenarioCalls = runIds.flatMap((runId) => llmCalls.listForRun(runId));
  const accepted = final.candidates.filter(
    (candidate) => candidate.status === "accepted",
  );
  logger.event("scenario.complete", {
    projectId,
    modelCalls: scenarioCalls.length,
    acceptedCandidates: accepted.length,
    completedSteps: final.workflow.completedSteps,
  });
  process.stdout.write(
    `${protocol}: COMPLETED · ${scenarioCalls.length} model calls · ${accepted.length} accepted candidates · ${final.workflow.completedSteps.join(",")}\n`,
  );
  success = checks.every((check) => check.ok);
  if (!success) throw new Error("Signing Sprint real scenario checks failed");
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
  if (app) await app.close();
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

async function runTask(
  app: FastifyInstance,
  projectId: string,
  task: SigningSprintTask,
  instruction: string,
  policy: Readonly<Record<string, unknown>>,
  watcher: RunWatcher,
  tracker: RunStateTracker,
  logger: SmokeLogger,
  recordCheck: (name: string, ok: boolean, detail?: string) => void,
): Promise<SprintCandidate> {
  const started = await jsonRequest<{ runId: string }>(
    app,
    "POST",
    `/api/projects/${projectId}/signing-sprint/ai`,
    {
      requestId: randomUUID(),
      task,
      instruction,
      policy,
    },
    [202],
  );
  watcher.track(started.runId);
  runIds.push(started.runId);
  logger.event("run.created", { runId: started.runId, projectId, task });
  const snapshot = await finishRun(app, started.runId, projectId, tracker);
  if (snapshot.run.status !== "completed") {
    throw new Error(`${task} ended as ${snapshot.run.status}`);
  }
  const candidates = await jsonRequest<SprintCandidate[]>(
    app,
    "GET",
    `/api/projects/${projectId}/signing-sprint/candidates?task=${encodeURIComponent(task)}`,
    undefined,
    [200],
  );
  const candidate = candidates.find(
    (item) => item.provenance.runId === started.runId,
  );
  const staged = Boolean(candidate && candidate.status === "candidate");
  recordCheck(
    `${task} staged as candidate`,
    staged,
    candidate ? `status=${candidate.status}` : "candidate missing",
  );
  if (!candidate || !staged) throw new Error(`${task} candidate missing`);
  recordCheck(
    `${task} carries official provenance`,
    candidate.provenance.sourceRefs.length > 0,
    `${candidate.provenance.sourceRefs.length} source refs`,
  );
  return candidate;
}

async function acceptCandidate(
  app: FastifyInstance,
  projectId: string,
  candidate: SprintCandidate,
  logger: SmokeLogger,
  recordCheck: (name: string, ok: boolean, detail?: string) => void,
): Promise<SprintWorkflow> {
  const current = await getSprint(app, projectId);
  const result = await jsonRequest<{
    workflow: SprintWorkflow;
    candidate: SprintCandidate;
  }>(
    app,
    "POST",
    `/api/projects/${projectId}/signing-sprint/candidates/${candidate.id}/decision`,
    {
      action: "accept",
      expectedWorkflowVersion: current.workflow.version,
    },
    [200],
  );
  const accepted = result.candidate.status === "accepted";
  recordCheck(
    `${candidate.task} accepted explicitly`,
    accepted,
    `workflowVersion=${result.workflow.version}`,
  );
  logger.event("candidate.accepted", {
    candidateId: candidate.id,
    task: candidate.task,
    workflowVersion: result.workflow.version,
  });
  if (!accepted) throw new Error(`${candidate.task} was not accepted`);
  return result.workflow;
}

async function getSprint(
  app: FastifyInstance,
  projectId: string,
): Promise<SprintEnvelope> {
  return jsonRequest<SprintEnvelope>(
    app,
    "GET",
    `/api/projects/${projectId}/signing-sprint`,
    undefined,
    [200],
  );
}

async function patchSprint(
  app: FastifyInstance,
  projectId: string,
  payload: Record<string, unknown>,
): Promise<SprintEnvelope> {
  return jsonRequest<SprintEnvelope>(
    app,
    "PATCH",
    `/api/projects/${projectId}/signing-sprint`,
    payload,
    [200],
  );
}

async function finishRun(
  app: FastifyInstance,
  runId: string,
  projectId: string,
  tracker: RunStateTracker,
): Promise<RunSnapshot> {
  let snapshot = await jsonRequest<RunSnapshot>(
    app,
    "GET",
    `/api/runs/${runId}?projectId=${encodeURIComponent(projectId)}`,
    undefined,
    [200],
  );
  for (let index = 0; index < 200; index += 1) {
    if (
      ["completed", "failed", "cancelled", "awaiting_user"].includes(
        snapshot.run.status,
      )
    )
      break;
    const response = await jsonRequest<{ snapshot: RunSnapshot }>(
      app,
      "POST",
      `/api/runs/${runId}/advance`,
      { projectId },
      [200],
    );
    tracker.diff(runId);
    snapshot = response.snapshot;
    if (snapshot.run.status === "failed_recoverable") {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 150));
    }
  }
  if (snapshot.run.status !== "completed") {
    const failedStep = snapshot.steps.find((step) => step.status === "failed");
    throw new Error(
      `${runId} ended as ${snapshot.run.status}: ${safeError(failedStep?.error)}`,
    );
  }
  return snapshot;
}

async function jsonRequest<T>(
  app: FastifyInstance,
  method: "GET" | "POST" | "PATCH",
  url: string,
  payload: Record<string, unknown> | undefined,
  expected: readonly number[],
): Promise<T> {
  const response =
    payload === undefined
      ? await app.inject({ method, url })
      : await app.inject({ method, url, payload });
  if (!expected.includes(response.statusCode)) {
    let detail: unknown;
    try {
      detail = response.json();
    } catch {
      detail = response.body;
    }
    throw new Error(
      `${method} ${url} returned ${response.statusCode}: ${safeError(detail)}`,
    );
  }
  return response.json() as T;
}

function arrayField(value: unknown, key?: string): unknown[] {
  const target = key === undefined ? value : recordField(value, key);
  return Array.isArray(target) ? target : [];
}

function recordField(value: unknown, key: string): unknown {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

function uniqueSteps(steps: readonly string[]): string[] {
  return [...new Set(steps)];
}

function safeError(value: unknown): string {
  if (value instanceof Error) return value.message;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function findPlatformPromise(value: string): string | null {
  const patterns = [
    /(?:签约|过签|通过)(?:概率|率|可能性)\s*(?:为|是|达到|超过)?\s*\d/iu,
    /(?:保证|一定|必然|肯定|必定)[^。；;,\n]{0,12}(?:签约|过签|通过)/u,
    /(?:签约|过签|通过)[^。；;,\n]{0,12}(?:保证|一定|必然|肯定|必定)/u,
    /(?:官方评分|评分|分数)\s*[:：=]\s*\d/iu,
    /\b(?:probability|score|rating)\b\s*[:=]\s*\d/iu,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(value);
    if (match) return match[0];
  }
  return null;
}

interface ProjectSummary {
  id: string;
  title: string;
  premise: string | null;
}

interface SprintWorkflow {
  id: string;
  version: number;
  currentStep: string;
  completedSteps: string[];
  state: Record<string, unknown>;
}

interface SprintCandidate {
  id: string;
  task: SigningSprintTask;
  status: "candidate" | "accepted" | "rejected";
  payload: Record<string, unknown>;
  provenance: { runId: string | null; sourceRefs: unknown[] };
}

interface SprintEnvelope {
  workflow: SprintWorkflow;
  candidates: SprintCandidate[];
  knowledge: unknown[];
}

interface RunSnapshot {
  run: { status: string };
  steps: { status: string; error: unknown }[];
}

interface OpeningCheckResponse {
  report: {
    analyzedChapterCount: number;
    signals: { locations: string[] }[];
  };
}

interface ReadinessResponse {
  report: { status: string };
}
