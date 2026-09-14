import type {
  CreateSigningSprintRequest,
  DecideSigningSprintCandidateRequest,
  KnowledgeCardDto,
  OfficialSourceDto,
  OpeningSignalReportDto,
  SigningReadinessReportDto,
  SigningSprintCandidateDto,
  SigningSprintTask,
  SigningSprintWorkflowDto,
  StartSigningSprintAiRequest,
  UpdateSigningSprintRequest,
} from "@narralume/contracts";

import { jsonRequest, requestJson } from "./client";

export interface SigningSprintEnvelope {
  workflow: SigningSprintWorkflowDto;
  candidates: SigningSprintCandidateDto[];
  knowledge: KnowledgeCardDto[];
}

export async function getSigningSprint(
  projectId: string,
  signal?: AbortSignal,
): Promise<SigningSprintEnvelope> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/signing-sprint`,
    signal ? { signal } : {},
  );
}

export async function createSigningSprint(
  projectId: string,
  input: CreateSigningSprintRequest = {},
): Promise<SigningSprintEnvelope> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/signing-sprint`,
    jsonRequest("POST", input),
  );
}

export async function updateSigningSprint(
  projectId: string,
  input: UpdateSigningSprintRequest,
): Promise<SigningSprintEnvelope> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/signing-sprint`,
    jsonRequest("PATCH", input),
  );
}

export async function startSigningSprintAi(
  projectId: string,
  input: StartSigningSprintAiRequest,
): Promise<{ runId: string; idempotentReplay: boolean }> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/signing-sprint/ai`,
    jsonRequest("POST", input),
  );
}

export async function listSigningSprintCandidates(
  projectId: string,
  task?: SigningSprintTask,
  signal?: AbortSignal,
): Promise<SigningSprintCandidateDto[]> {
  const query = task ? `?task=${encodeURIComponent(task)}` : "";
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/signing-sprint/candidates${query}`,
    signal ? { signal } : {},
  );
}

export async function decideSigningSprintCandidate(
  projectId: string,
  candidateId: string,
  input: DecideSigningSprintCandidateRequest,
): Promise<
  | SigningSprintCandidateDto
  | { workflow: SigningSprintWorkflowDto; candidate: SigningSprintCandidateDto }
> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/signing-sprint/candidates/${encodeURIComponent(candidateId)}/decision`,
    jsonRequest("POST", input),
  );
}

export async function runOpeningCheck(
  projectId: string,
): Promise<{
  report: OpeningSignalReportDto;
  guidance: KnowledgeCardDto[];
  workflow: SigningSprintWorkflowDto;
}> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/signing-sprint/opening-check`,
    jsonRequest("POST", {}),
  );
}

export async function getSigningReadiness(
  projectId: string,
  signal?: AbortSignal,
): Promise<{ report: SigningReadinessReportDto; workflow: SigningSprintWorkflowDto }> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/signing-sprint/readiness`,
    signal ? { signal } : {},
  );
}

export async function runSigningReadiness(
  projectId: string,
): Promise<{ report: SigningReadinessReportDto; workflow: SigningSprintWorkflowDto }> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/signing-sprint/readiness`,
    jsonRequest("POST", {}),
  );
}

export async function listOfficialSources(signal?: AbortSignal): Promise<OfficialSourceDto[]> {
  return requestJson("/api/official-knowledge/sources", signal ? { signal } : {});
}

export async function listOfficialKnowledgeCards(
  signal?: AbortSignal,
): Promise<KnowledgeCardDto[]> {
  return requestJson(
    "/api/official-knowledge/cards?limit=100",
    signal ? { signal } : {},
  );
}

export async function updateOfficialSourceStatus(
  sourceId: string,
  action: "activate" | "disable",
): Promise<OfficialSourceDto> {
  return requestJson(
    `/api/official-knowledge/sources/${encodeURIComponent(sourceId)}/${action}`,
    jsonRequest("POST", {}),
  );
}

export async function requestOfficialSourceRefresh(
  sourceId: string,
): Promise<{
  status: "review_required" | "fetch_failed";
  source: OfficialSourceDto;
  message: string;
}> {
  return requestJson(
    `/api/official-knowledge/sources/${encodeURIComponent(sourceId)}/refresh`,
    jsonRequest("POST", {}),
  );
}
