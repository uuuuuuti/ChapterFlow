import { createHash } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";

const args = parseArgs(process.argv.slice(2));
const baseUrl = args["base-url"] ?? "http://127.0.0.1:4317";
const projectId = required(args, "project-id");
const sessionId = args["session-id"] ?? null;
const fromOutlineNodeId = required(args, "from");
const toOutlineNodeId = required(args, "to");
const outputPath = resolve(
  args.output ?? "data-v1/exports/v1-acceptance/acceptance-manifest.json",
);
const exportDir = args["export-dir"]
  ? resolve(args["export-dir"])
  : dirname(outputPath);

const [
  storyBible,
  documents,
  reviews,
  quality,
  backups,
  providers,
  models,
  assignments,
  allRuns,
] = await Promise.all([
  get(`/api/projects/${encodeURIComponent(projectId)}/story-bible`),
  get(`/api/projects/${encodeURIComponent(projectId)}/documents`),
  get(`/api/projects/${encodeURIComponent(projectId)}/reviews`),
  get(
    `/api/projects/${encodeURIComponent(projectId)}/quality?${new URLSearchParams(
      {
        fromOutlineNodeId,
        toOutlineNodeId,
      },
    )}`,
  ),
  get(`/api/projects/${encodeURIComponent(projectId)}/backups`),
  get("/api/providers"),
  get("/api/models"),
  get("/api/assignments"),
  listRuns(),
]);

const session = sessionId
  ? await get(`/api/autopilot/sessions/${encodeURIComponent(sessionId)}`)
  : null;
const outline = arrayField(storyBible, "outline");
const fromIndex = outline.findIndex(
  (node) => stringField(node, "id") === fromOutlineNodeId,
);
const toIndex = outline.findIndex(
  (node) => stringField(node, "id") === toOutlineNodeId,
);
if (fromIndex < 0 || toIndex < fromIndex) {
  throw new Error("The requested outline range is not a valid ordered range");
}

const selectedNodes = outline
  .slice(fromIndex, toIndex + 1)
  .filter((node) => stringField(node, "kind") === "chapter");
const documentList = arrayField(documents);
const reportList = arrayField(reviews, "reports");
const runList = allRuns;
const documentByOutline = new Map(
  documentList
    .filter((document) => stringField(document, "outlineNodeId"))
    .map((document) => [stringField(document, "outlineNodeId"), document]),
);
const sessionResults = arrayField(session, "chapterResults");
const chapters = [];
const currentVersionRunIds = [];

for (const [index, node] of selectedNodes.entries()) {
  const nodeId = stringField(node, "id");
  const document = documentByOutline.get(nodeId) ?? null;
  if (!document) throw new Error(`No manuscript document for ${nodeId}`);
  const documentId = stringField(document, "id");
  const versions = await get(
    `/api/projects/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(documentId)}/versions`,
  );
  const currentVersionId = stringField(document, "currentVersionId");
  const version = arrayField(versions).find(
    (candidate) => stringField(candidate, "id") === currentVersionId,
  );
  if (!version) throw new Error(`No current version for ${documentId}`);

  const versionId = stringField(version, "id");
  const content = stringField(version, "content");
  const contentHash = stringField(version, "contentHash");
  const matchingReports = reportList
    .filter((report) => stringField(report, "documentVersionId") === versionId)
    .sort(byCreatedAtDescending);
  const latestReport = matchingReports[0] ?? null;
  const settlements = runList
    .filter(
      (run) =>
        stringField(run, "recipe") === "manual-settlement" &&
        stringField(run, "status") === "completed" &&
        stringField(recordField(run, "policy"), "documentVersionId") ===
          versionId,
    )
    .sort(byCreatedAtDescending);
  const settlement = settlements[0] ?? null;
  const sessionResult = sessionResults.find(
    (result) => stringField(result, "outlineNodeId") === nodeId,
  );
  if (sessionResult && stringField(sessionResult, "runId")) {
    currentVersionRunIds.push(stringField(sessionResult, "runId"));
  }
  chapters.push({
    ordinal: index + 1,
    title: stringField(node, "title"),
    outlineNodeId: nodeId,
    documentId,
    versionId,
    contentHash,
    effectiveCharacters: effectiveCharacterCount(content),
    source: stringField(version, "source"),
    productionRunId: sessionResult ? stringField(sessionResult, "runId") : null,
    review: latestReport
      ? {
          id: stringField(latestReport, "id"),
          runId: stringField(latestReport, "runId"),
          verdict: stringField(latestReport, "verdict"),
          issueCount: arrayField(latestReport, "issues").length,
          blockingIssueCount: arrayField(latestReport, "issues").filter(
            (issue) =>
              ["critical", "block"].includes(stringField(issue, "severity")),
          ).length,
          createdAt: stringField(latestReport, "createdAt"),
        }
      : null,
    settlement: settlement
      ? {
          runId: stringField(settlement, "id"),
          status: stringField(settlement, "status"),
          usage: usageOf(settlement),
        }
      : null,
  });
}

const selectedVersionIds = new Set(
  chapters.map((chapter) => chapter.versionId),
);
const selectedReportRunIds = reportList
  .filter((report) =>
    selectedVersionIds.has(stringField(report, "documentVersionId")),
  )
  .map((report) => stringField(report, "runId"));
const selectedSettlementRunIds = chapters
  .map((chapter) => chapter.settlement?.runId)
  .filter(Boolean);
const foundationRunIds = runList
  .filter((run) => stringField(run, "recipe") === "book-foundation")
  .map((run) => stringField(run, "id"));
const outlineRunIds = runList
  .filter((run) => stringField(run, "recipe") === "rolling-outline")
  .map((run) => stringField(run, "id"));
const batchRunIds = runList
  .filter(
    (run) =>
      stringField(run, "recipe") === "closing-review" &&
      stringField(run, "status") === "completed" &&
      (!sessionId ||
        stringField(recordField(run, "policy"), "sessionId") === sessionId) &&
      stringField(recordField(run, "policy"), "batchReviewKind") ===
        "first-five",
  )
  .sort(byCreatedAtDescending)
  .slice(0, 1)
  .map((run) => stringField(run, "id"));
const acceptanceRunIds = unique([
  ...foundationRunIds,
  ...outlineRunIds,
  ...currentVersionRunIds,
  ...selectedReportRunIds,
  ...selectedSettlementRunIds,
  ...batchRunIds,
]);
const acceptanceRuns = runList.filter((run) =>
  acceptanceRunIds.includes(stringField(run, "id")),
);
const runDetails = await Promise.all(
  acceptanceRunIds.map(async (runId) =>
    get(
      `/api/runs/${encodeURIComponent(runId)}?projectId=${encodeURIComponent(projectId)}`,
    ),
  ),
);

const modelEvidence = uniqueBy(
  runDetails.flatMap((detail) =>
    arrayField(detail, "modelSnapshots").map((snapshot) => ({
      purpose: stringField(snapshot, "purpose"),
      requestedRole: stringField(snapshot, "requestedRole"),
      assignmentRole: stringField(snapshot, "assignmentRole"),
      modelId: stringField(recordField(snapshot, "model"), "modelId"),
      providerId: stringField(recordField(snapshot, "model"), "providerId"),
      wireApi: stringField(recordField(snapshot, "model"), "wireApi"),
      baseUrl: stringField(recordField(snapshot, "provider"), "baseUrl"),
    })),
  ),
  (item) =>
    [
      item.purpose,
      item.requestedRole,
      item.assignmentRole,
      item.modelId,
      item.baseUrl,
    ].join("|"),
);

const exportFiles = readExports(exportDir, basename(outputPath));
const latestBackup =
  [...arrayField(backups)].sort(byCreatedAtDescending)[0] ?? null;
const environmentModels = arrayField(models)
  .filter((model) =>
    stringField(model, "providerId").startsWith("environment-"),
  )
  .map((model) => ({
    id: stringField(model, "id"),
    providerId: stringField(model, "providerId"),
    modelId: stringField(model, "modelId"),
    taskType: stringField(model, "taskType"),
    contextWindow: numberField(model, "contextWindow"),
    maxOutputTokens: numberField(model, "maxOutputTokens"),
    capabilities: recordField(model, "capabilities"),
  }));
const environmentProviders = arrayField(providers)
  .filter((provider) => stringField(provider, "id").startsWith("environment-"))
  .map((provider) => ({
    id: stringField(provider, "id"),
    wireApi: stringField(provider, "wireApi"),
    baseUrl: stringField(provider, "baseUrl"),
    enabled: provider.enabled === true,
  }));
const assignmentResolution = arrayField(assignments).map((assignment) => {
  const model = environmentModels.find(
    (candidate) => candidate.id === stringField(assignment, "modelId"),
  );
  const provider = environmentProviders.find(
    (candidate) => candidate.id === model?.providerId,
  );
  return {
    role: stringField(assignment, "role"),
    assignmentModelId: stringField(assignment, "modelId"),
    resolvedModelId: model?.modelId ?? null,
    providerId: model?.providerId ?? null,
    wireApi: provider?.wireApi ?? null,
    baseUrl: provider?.baseUrl ?? null,
  };
});

const batchRun = batchRunIds[0]
  ? acceptanceRuns.find((run) => stringField(run, "id") === batchRunIds[0])
  : null;
const batchReview = recordField(session, "batchReview");
const manifest = {
  schemaVersion: "chapterflow.v1.acceptance-manifest.v1",
  generatedAt: new Date().toISOString(),
  project: {
    id: projectId,
    title: stringField(recordField(storyBible, "project"), "title"),
  },
  scope: {
    fromOutlineNodeId,
    toOutlineNodeId,
    chapterCount: chapters.length,
    chapterOrdinals: chapters.map((chapter) => chapter.ordinal),
    rule: "当前保存版本；有效字符数去思考块、角色标记、标题、空白",
  },
  model: {
    requiredBaseUrl: "https://api.deepseek.com",
    requiredModelId: "deepseek-v4-flash",
    providers: environmentProviders,
    models: environmentModels,
    assignments: assignmentResolution,
    realRunSnapshots: modelEvidence,
    allRequiredRolesResolved: [
      "planning",
      "drafting",
      "review",
      "revision",
      "settlement",
    ].every(
      (role) =>
        modelEvidence.some((item) => item.requestedRole === role) &&
        modelEvidence.some(
          (item) =>
            item.requestedRole === role &&
            item.modelId === "deepseek-v4-flash" &&
            item.baseUrl === "https://api.deepseek.com",
        ),
    ),
  },
  chapters,
  quality: {
    score: numberField(quality, "score"),
    readiness: stringField(quality, "readiness"),
    gates: arrayField(quality, "gates").map((gate) => ({
      id: stringField(gate, "id"),
      passed: gate.passed === true,
      message: stringField(gate, "message"),
    })),
    metrics: recordField(quality, "metrics"),
    issues: arrayField(quality, "issues").map((issue) => ({
      id: stringField(issue, "id"),
      category: stringField(issue, "category"),
      severity: stringField(issue, "severity"),
      message: stringField(issue, "message"),
    })),
  },
  batchReview: batchReview
    ? {
        sessionId,
        runId: batchRun ? stringField(batchRun, "id") : null,
        sourceHash: stringField(batchReview, "sourceHash"),
        verdict: stringField(batchReview, "verdict"),
        modelVerdict: stringField(batchReview, "modelVerdict"),
        issueCount: arrayField(batchReview, "issues").length,
        groundingDiagnostics: recordField(batchReview, "groundingDiagnostics"),
        runUsage: batchRun ? usageOf(batchRun) : null,
      }
    : null,
  exportFiles,
  backup: latestBackup
    ? {
        id: stringField(latestBackup, "id"),
        label: stringField(latestBackup, "label"),
        createdAt: stringField(latestBackup, "createdAt"),
        sizeBytes: numberField(latestBackup, "sizeBytes"),
        bundleHash: stringField(latestBackup, "bundleHash"),
        restoredProjectId: stringField(latestBackup, "restoredProjectId"),
      }
    : null,
  recovery: session
    ? {
        sessionId,
        status: stringField(recordField(session, "session"), "status"),
        currentRunId: stringField(
          recordField(session, "session"),
          "currentRunId",
        ),
        completedChapters: numberField(
          recordField(session, "session"),
          "completedChapters",
        ),
        stopReason: stringField(session, "stopReason"),
      }
    : null,
  usage: {
    acceptanceRuns: usageOfMany(acceptanceRuns),
    projectRuns: usageOfMany(runList),
    acceptanceRunCount: acceptanceRuns.length,
    projectRunCount: runList.length,
  },
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(
  JSON.stringify(
    {
      outputPath,
      projectId,
      chapterCount: chapters.length,
      effectiveCharacters: chapters.reduce(
        (sum, chapter) => sum + chapter.effectiveCharacters,
        0,
      ),
      allGatesPassed: manifest.quality.gates.every((gate) => gate.passed),
      allRequiredRolesResolved: manifest.model.allRequiredRolesResolved,
      acceptanceUsage: manifest.usage.acceptanceRuns,
      projectUsage: manifest.usage.projectRuns,
    },
    null,
    2,
  ),
);

async function listRuns() {
  const result = [];
  let cursor = "";
  do {
    const query = new URLSearchParams({ limit: "100" });
    if (cursor) query.set("cursor", cursor);
    const page = await get(
      `/api/projects/${encodeURIComponent(projectId)}/runs/page?${query}`,
    );
    result.push(...arrayField(page, "items"));
    cursor = stringField(page, "nextCursor");
  } while (cursor);
  return result;
}

async function get(path) {
  const response = await fetch(new URL(path, baseUrl));
  if (!response.ok) {
    throw new Error(`GET ${path} failed with HTTP ${response.status}`);
  }
  return response.json();
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    result[key] =
      argv[index + 1] && !argv[index + 1].startsWith("--")
        ? argv[++index]
        : "true";
  }
  return result;
}

function required(values, name) {
  const value = values[name];
  if (!value) throw new Error(`Missing --${name}`);
  return value;
}

function recordField(value, key) {
  const candidate = key === undefined ? value : value?.[key];
  return candidate && typeof candidate === "object" && !Array.isArray(candidate)
    ? candidate
    : {};
}

function arrayField(value, key) {
  const candidate = key === undefined ? value : value?.[key];
  return Array.isArray(candidate) ? candidate : [];
}

function stringField(value, key) {
  const candidate = value?.[key];
  return typeof candidate === "string" ? candidate : "";
}

function numberField(value, key) {
  const candidate = value?.[key];
  return typeof candidate === "number" ? candidate : null;
}

function usageOf(run) {
  const usage = recordField(run, "budgetUsage");
  return {
    inputTokens: numberField(usage, "inputTokens") ?? 0,
    outputTokens: numberField(usage, "outputTokens") ?? 0,
    calls: numberField(usage, "calls") ?? 0,
    wallTimeMs: numberField(usage, "wallTimeMs") ?? 0,
    costUsd: numberField(usage, "costUsd") ?? 0,
  };
}

function usageOfMany(runs) {
  return runs.reduce(
    (total, run) => {
      const usage = usageOf(run);
      total.inputTokens += usage.inputTokens;
      total.outputTokens += usage.outputTokens;
      total.calls += usage.calls;
      total.wallTimeMs += usage.wallTimeMs;
      total.costUsd += usage.costUsd;
      return total;
    },
    { inputTokens: 0, outputTokens: 0, calls: 0, wallTimeMs: 0, costUsd: 0 },
  );
}

function effectiveCharacterCount(value) {
  return Array.from(
    String(value ?? "")
      .replace(/<think>[\s\S]*?<\/think>/giu, "\n")
      .replace(/<\/?(?:analysis|assistant|system|manuscript)>/giu, "\n")
      .replace(/^\s*```(?:markdown|text)?\s*$/gimu, "")
      .replace(/^\s*#{1,6}\s+[^\n]*$/gimu, "")
      .replace(/\s/gu, ""),
  ).length;
}

function readExports(directory, manifestName) {
  try {
    return readdirSync(directory)
      .filter((name) => name !== manifestName)
      .map((name) => {
        const path = resolve(directory, name);
        if (!statSync(path).isFile()) return null;
        const bytes = readFileSync(path);
        const text =
          name.endsWith(".txt") || name.endsWith(".md")
            ? bytes.toString("utf8")
            : null;
        return {
          name,
          path,
          bytes: bytes.length,
          sha256: createHash("sha256").update(bytes).digest("hex"),
          effectiveCharacters:
            text === null ? null : effectiveCharacterCount(text),
          markdownHeadings:
            text === null
              ? []
              : text.split(/\r?\n/u).filter((line) => /^#{1,6}\s+/u.test(line)),
        };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function uniqueBy(values, keyOf) {
  const seen = new Set();
  return values.filter((value) => {
    const key = keyOf(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function byCreatedAtDescending(left, right) {
  return stringField(right, "createdAt").localeCompare(
    stringField(left, "createdAt"),
  );
}
