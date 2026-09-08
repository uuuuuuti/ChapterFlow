import {
  type PublicProviderDto,
  type UpsertProviderRequest,
  type ModelConfigDto,
  type UpsertModelRequest,
  type ModelAssignmentDto,
  type AssignmentRole,
} from "@narralume/contracts";
import { requestJson, jsonRequest, requestVoid } from "./client";
import { type ProviderProbeResult } from "./types";

export async function listProviders(
  signal?: AbortSignal,
): Promise<PublicProviderDto[]> {
  return requestJson("/api/providers", signal ? { signal } : {});
}

export async function createProvider(
  input: UpsertProviderRequest,
): Promise<PublicProviderDto> {
  return requestJson("/api/providers", jsonRequest("POST", input));
}

export async function updateProvider(
  providerId: string,
  input: UpsertProviderRequest & { expectedUpdatedAt: string },
): Promise<PublicProviderDto> {
  return requestJson(
    `/api/providers/${encodeURIComponent(providerId)}`,
    jsonRequest("PUT", input),
  );
}

export async function deleteProvider(providerId: string): Promise<void> {
  return requestVoid(`/api/providers/${encodeURIComponent(providerId)}`, {
    method: "DELETE",
  });
}

export async function probeProvider(input: {
  providerId: string;
  modelId: string;
  includeStreaming?: boolean;
  includeTools?: boolean;
  includeStructuredOutput?: boolean;
}): Promise<ProviderProbeResult> {
  return requestJson(
    "/api/providers/test",
    jsonRequest("POST", {
      providerId: input.providerId,
      modelId: input.modelId,
      includeStreaming: input.includeStreaming ?? true,
      includeTools: input.includeTools ?? true,
      includeStructuredOutput: input.includeStructuredOutput ?? true,
    }),
  );
}

export async function listModels(
  providerId?: string,
  signal?: AbortSignal,
): Promise<ModelConfigDto[]> {
  const query = providerId
    ? `?providerId=${encodeURIComponent(providerId)}`
    : "";
  return requestJson(`/api/models${query}`, signal ? { signal } : {});
}

export async function createModel(
  input: UpsertModelRequest,
): Promise<ModelConfigDto> {
  return requestJson("/api/models", jsonRequest("POST", input));
}

export async function updateModel(
  modelId: string,
  input: UpsertModelRequest & { expectedUpdatedAt: string },
): Promise<ModelConfigDto> {
  return requestJson(
    `/api/models/${encodeURIComponent(modelId)}`,
    jsonRequest("PUT", input),
  );
}

export async function deleteModel(modelId: string): Promise<void> {
  return requestVoid(`/api/models/${encodeURIComponent(modelId)}`, {
    method: "DELETE",
  });
}

export async function listAssignments(
  signal?: AbortSignal,
): Promise<ModelAssignmentDto[]> {
  return requestJson("/api/assignments", signal ? { signal } : {});
}

export async function setAssignment(
  role: AssignmentRole,
  modelId: string,
): Promise<ModelAssignmentDto> {
  return requestJson(
    `/api/assignments/${encodeURIComponent(role)}`,
    jsonRequest("PUT", { modelId }),
  );
}

export async function deleteAssignment(role: AssignmentRole): Promise<void> {
  return requestVoid(`/api/assignments/${encodeURIComponent(role)}`, {
    method: "DELETE",
  });
}
