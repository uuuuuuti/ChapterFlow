import {
  type ContextPreview,
  type RetrievalHit,
  type NarrativeMemory,
  type PlotPrediction,
  type DryRunResult,
  type HarnessTemplate,
} from "./types";
import { requestJson, jsonRequest } from "./client";

export async function previewContext(
  projectId: string,
  input: {
    task: string;
    query: string;
    entityIds: string[];
    currentOutlineNodeId: string | null;
    access: { audience: "author"; includeCandidates: boolean };
  },
): Promise<ContextPreview> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/context/preview`,
    jsonRequest("POST", { purpose: "studio-preview", ...input }),
  );
}

export async function searchProjectMemory(
  projectId: string,
  input: {
    query: string;
    entityIds?: string[];
    limit?: number;
    rerank?: boolean;
  },
): Promise<RetrievalHit[]> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/retrieval/search`,
    jsonRequest("POST", input),
  );
}

export async function getNarrativeMemories(
  projectId: string,
  includeStale = false,
  signal?: AbortSignal,
): Promise<NarrativeMemory[]> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/memories?includeStale=${includeStale}`,
    signal ? { signal } : {},
  );
}

export async function rebuildNarrativeMemories(
  projectId: string,
): Promise<NarrativeMemory[]> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/memories/rebuild`,
    jsonRequest("POST", {}),
  );
}

export async function consolidateNarrativeMemory(
  projectId: string,
): Promise<NarrativeMemory | null> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/memories/sleep`,
    jsonRequest("POST", {}),
  );
}

export async function getPlotPredictions(
  projectId: string,
  signal?: AbortSignal,
): Promise<PlotPrediction[]> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/predictions`,
    signal ? { signal } : {},
  );
}

export async function generatePlotPredictions(
  projectId: string,
  input: { direction: string; horizon: number; count: number },
): Promise<PlotPrediction[]> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/predictions`,
    jsonRequest("POST", input),
  );
}

export async function decidePlotPrediction(
  projectId: string,
  predictionId: string,
  status: "adopted" | "dismissed",
): Promise<PlotPrediction> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/predictions/${encodeURIComponent(predictionId)}`,
    jsonRequest("PUT", { status }),
  );
}

export async function previewDryRun(
  projectId: string,
  change: string,
): Promise<DryRunResult> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/dry-run`,
    jsonRequest("POST", { change }),
  );
}

export async function getHarnessTemplates(
  signal?: AbortSignal,
): Promise<HarnessTemplate[]> {
  return requestJson("/api/harness/templates", signal ? { signal } : {});
}

export async function updateHarnessTemplate(
  template: HarnessTemplate,
  content: string,
): Promise<HarnessTemplate> {
  return requestJson(
    `/api/harness/templates/${encodeURIComponent(template.key)}`,
    jsonRequest("PUT", { content, expectedVersion: template.version }),
  );
}

export async function restoreHarnessTemplate(
  template: HarnessTemplate,
): Promise<HarnessTemplate> {
  return requestJson(
    `/api/harness/templates/${encodeURIComponent(template.key)}/restore`,
    jsonRequest("POST", { expectedVersion: template.version }),
  );
}

export async function cloneHarnessTemplate(
  template: HarnessTemplate,
  input: { key: string; name: string },
): Promise<HarnessTemplate> {
  return requestJson(
    `/api/harness/templates/${encodeURIComponent(template.key)}/clone`,
    jsonRequest("POST", input),
  );
}
