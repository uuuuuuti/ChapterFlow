import {
  type RunOriginInput,
  type NarrativeRun,
  type RunListPage,
  type RunDetail,
  type RunActionRequest,
  type RunSnapshot,
  type BackgroundRunCreated,
  type ProjectFoundationTaskCreated,
  type FoundationCandidateSet,
  type FoundationCandidate,
  type StoryCompass,
  type AutopilotSession,
  type AutopilotSessionDetail,
  type SessionActionRequest,
  type StorySteer,
} from "./types";
import {
  type ModelExecutionPolicy,
  type BookProfileInput,
  type ChapterRunCreatedDto,
  type ContinueRunStreamRequest,
  type AdoptRunStreamResponse,
  type RegenerateRunStreamResponse,
} from "@narralume/contracts";
import { requestJson, jsonRequest, ApiError } from "./client";

export async function createChapterRun(
  projectId: string,
  input: {
    /** 同一次提交的幂等键；网络重试复用同一个 requestId，重新提交才换新。 */
    requestId: string;
    continuationVersionId?: string;
    targetOutlineNodeId: string;
    planningMode?: "auto" | "confirm";
    origin?: RunOriginInput | null;
    scope?: {
      startOutlineNodeId: string | null;
      endOutlineNodeId: string | null;
    };
    maxRevisionCycles: number;
    /** 稀疏覆盖：只包含用户显式改过的字段。 */
    policy?: ModelExecutionPolicy;
  },
): Promise<ChapterRunCreatedDto> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/runs/chapter`,
    jsonRequest("POST", input),
  );
}

export async function getProjectRuns(
  projectId: string,
  signal?: AbortSignal,
): Promise<NarrativeRun[]> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/runs`,
    signal ? { signal } : {},
  );
}

export async function getProjectRunsPage(
  projectId: string,
  cursor?: string,
  signal?: AbortSignal,
): Promise<RunListPage> {
  const params = new URLSearchParams({ limit: "50" });
  if (cursor) params.set("cursor", cursor);
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/runs/page?${params.toString()}`,
    signal ? { signal } : {},
  );
}

export async function getRunDetail(
  projectId: string,
  runId: string,
  signal?: AbortSignal,
): Promise<RunDetail> {
  return requestJson(
    `/api/runs/${encodeURIComponent(runId)}?projectId=${encodeURIComponent(projectId)}`,
    signal ? { signal } : {},
  );
}

export async function controlRun(
  projectId: string,
  runId: string,
  action: RunActionRequest,
): Promise<RunSnapshot> {
  return requestJson(
    `/api/runs/${encodeURIComponent(runId)}/actions`,
    jsonRequest("POST", { ...action, projectId }),
  );
}

export async function advanceRun(
  projectId: string,
  runId: string,
): Promise<{
  processed: boolean;
  snapshot: RunSnapshot;
}> {
  return requestJson(
    `/api/runs/${encodeURIComponent(runId)}/advance`,
    jsonRequest("POST", { projectId }),
  );
}

export async function discardRunStream(
  projectId: string,
  runId: string,
  stepId: string,
  attempt: number,
): Promise<{ discarded: boolean }> {
  return requestJson(
    `/api/runs/${encodeURIComponent(runId)}/streams/discard`,
    jsonRequest("POST", { projectId, stepId, attempt }),
  );
}

export async function continueRunStream(
  projectId: string,
  runId: string,
  input: Omit<ContinueRunStreamRequest, "projectId">,
): Promise<ChapterRunCreatedDto> {
  return requestJson(
    `/api/runs/${encodeURIComponent(runId)}/streams/continue`,
    jsonRequest("POST", { ...input, projectId }),
  );
}

export async function adoptRunStream(
  projectId: string,
  runId: string,
  input: Omit<ContinueRunStreamRequest, "projectId">,
): Promise<AdoptRunStreamResponse> {
  return requestJson(
    `/api/runs/${encodeURIComponent(runId)}/streams/adopt`,
    jsonRequest("POST", { ...input, projectId }),
  );
}

export async function regenerateRunStream(
  projectId: string,
  runId: string,
  input: Omit<ContinueRunStreamRequest, "projectId">,
): Promise<RegenerateRunStreamResponse> {
  return requestJson(
    `/api/runs/${encodeURIComponent(runId)}/streams/regenerate`,
    jsonRequest("POST", { ...input, projectId }),
  );
}

export async function generateFoundation(
  projectId: string,
  input: {
    requestId: string;
    braindump: string;
    /** 稀疏覆盖；qualityPreset 在这里选择。 */
    policy?: ModelExecutionPolicy;
    preferences: {
      genre: string | null;
      audience: string | null;
      tone: string | null;
      targetChapters: number;
      wordsPerChapter: number;
      volumes: number;
    };
  },
): Promise<BackgroundRunCreated> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/foundation/generate`,
    jsonRequest("POST", input),
  );
}

export async function createProjectWithFoundation(input: {
  requestId: string;
  title: string;
  subtitle?: string | null;
  premise?: string | null;
  language?: string;
  braindump: string;
  bookProfile?: BookProfileInput;
  policy?: ModelExecutionPolicy;
  preferences?: {
    genre: string | null;
    audience: string | null;
    tone: string | null;
    targetChapters: number;
    wordsPerChapter: number;
    volumes: number;
  };
}): Promise<ProjectFoundationTaskCreated> {
  return requestJson(
    "/api/projects/with-foundation",
    jsonRequest("POST", input),
  );
}

export async function getFoundationCandidates(
  projectId: string,
  signal?: AbortSignal,
): Promise<FoundationCandidateSet[]> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/foundation/candidates`,
    signal ? { signal } : {},
  );
}

export async function resolveFoundationCandidate(
  candidateId: string,
  action: "adopt" | "discard",
  payload?: Record<string, unknown>,
  expectedUpdatedAt?: string,
): Promise<FoundationCandidate> {
  return requestJson(
    `/api/candidates/${encodeURIComponent(candidateId)}/actions`,
    jsonRequest("POST", {
      action,
      ...(payload ? { payload } : {}),
      ...(expectedUpdatedAt ? { expectedUpdatedAt } : {}),
    }),
  );
}

export async function resolveFoundationCandidateSet(
  setId: string,
  action: "adopt-all" | "discard-all",
  expectedUpdatedAtByCandidate?: Record<string, string>,
): Promise<FoundationCandidateSet> {
  return requestJson(
    `/api/candidate-sets/${encodeURIComponent(setId)}/actions`,
    jsonRequest("POST", {
      action,
      ...(expectedUpdatedAtByCandidate
        ? { expectedUpdatedAtByCandidate }
        : {}),
    }),
  );
}

export async function getStoryCompass(
  projectId: string,
  signal?: AbortSignal,
): Promise<StoryCompass | null> {
  try {
    return await requestJson(
      `/api/projects/${encodeURIComponent(projectId)}/compass`,
      signal ? { signal } : {},
    );
  } catch (error) {
    if (error instanceof ApiError && error.code === "story_compass.not_found") {
      return null;
    }
    throw error;
  }
}

export async function updateStoryCompass(
  projectId: string,
  input: Omit<StoryCompass, "projectId" | "version" | "updatedAt"> & {
    expectedVersion: number | null;
  },
): Promise<StoryCompass> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/compass`,
    jsonRequest("PUT", input),
  );
}

export async function createAutopilotSession(
  projectId: string,
  input: {
    /** 同一次提交的幂等键；网络重试复用同一个 requestId，重新提交才换新。 */
    requestId: string;
    /** continuous = 多章连续生产（AI 快速创作）；per_chapter = 逐章验收。 */
    approvalMode?: "continuous" | "per_chapter";
    planningMode?: "auto" | "confirm";
    origin?: RunOriginInput | null;
    targetChapters: number;
    windowSize: number;
    maxRevisionCycles: number;
    /** 稀疏覆盖。 */
    chapterPolicy?: ModelExecutionPolicy;
  },
): Promise<AutopilotSession & { idempotentReplay: boolean }> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/autopilot/sessions`,
    jsonRequest("POST", input),
  );
}

export async function getAutopilotSessions(
  projectId: string,
  signal?: AbortSignal,
): Promise<AutopilotSession[]> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/autopilot/sessions`,
    signal ? { signal } : {},
  );
}

export async function getAutopilotSession(
  sessionId: string,
  signal?: AbortSignal,
): Promise<AutopilotSessionDetail> {
  return requestJson(
    `/api/autopilot/sessions/${encodeURIComponent(sessionId)}`,
    signal ? { signal } : {},
  );
}

export async function controlAutopilotSession(
  sessionId: string,
  action: SessionActionRequest,
): Promise<AutopilotSessionDetail> {
  return requestJson(
    `/api/autopilot/sessions/${encodeURIComponent(sessionId)}/actions`,
    jsonRequest("POST", action),
  );
}

export async function resolveAutopilotFailure(
  sessionId: string,
  action: "retry-current" | "skip-chapter" | "replan" | "stop",
): Promise<AutopilotSessionDetail> {
  return requestJson(
    `/api/autopilot/sessions/${encodeURIComponent(sessionId)}/resolutions`,
    jsonRequest("POST", { action }),
  );
}

export async function sendStorySteer(
  sessionId: string,
  input: { requestId: string; content: string },
): Promise<StorySteer> {
  return requestJson(
    `/api/autopilot/sessions/${encodeURIComponent(sessionId)}/steers`,
    jsonRequest("POST", input),
  );
}

export async function decideStorySteer(
  sessionId: string,
  steerId: string,
  action: "apply" | "reject",
): Promise<{ steer: StorySteer; detail: AutopilotSessionDetail }> {
  return requestJson(
    `/api/autopilot/sessions/${encodeURIComponent(sessionId)}/steers/${encodeURIComponent(steerId)}/decisions`,
    jsonRequest("POST", { action }),
  );
}

export async function advanceAutopilotSession(
  sessionId: string,
): Promise<{ processed: boolean; detail: AutopilotSessionDetail }> {
  return requestJson(
    `/api/autopilot/sessions/${encodeURIComponent(sessionId)}/advance`,
    jsonRequest("POST", {}),
  );
}
