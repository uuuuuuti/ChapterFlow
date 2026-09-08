import {
  type CreateAssistantConversationRequest,
  type AssistantConversationDto,
  type AssistantConversationDetailDto,
  type CreateAssistantMessageRequest,
  type AssistantMessageAcceptedDto,
  type AssistantActivityActionResponseDto,
} from "@narralume/contracts";
import { requestJson, jsonRequest } from "./client";

export async function createAssistantConversation(
  projectId: string,
  input: CreateAssistantConversationRequest,
): Promise<AssistantConversationDto> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/assistant/conversations`,
    jsonRequest("POST", input),
  );
}

export async function getAssistantConversations(
  projectId: string,
  signal?: AbortSignal,
): Promise<AssistantConversationDto[]> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/assistant/conversations`,
    signal ? { signal } : {},
  );
}

export async function getAssistantConversation(
  conversationId: string,
  signal?: AbortSignal,
): Promise<AssistantConversationDetailDto> {
  return requestJson(
    `/api/assistant/conversations/${encodeURIComponent(conversationId)}`,
    signal ? { signal } : {},
  );
}

export async function archiveAssistantConversation(
  conversationId: string,
): Promise<AssistantConversationDto> {
  return requestJson(
    `/api/assistant/conversations/${encodeURIComponent(conversationId)}/actions`,
    jsonRequest("POST", { action: "archive" }),
  );
}

export async function renameAssistantConversation(
  conversationId: string,
  title: string,
): Promise<AssistantConversationDto> {
  return requestJson(
    `/api/assistant/conversations/${encodeURIComponent(conversationId)}/actions`,
    jsonRequest("POST", { action: "rename", title }),
  );
}

export async function configureAssistantConversation(
  conversationId: string,
  input: { modelId?: string | null; reasoningEffort?: string | null },
): Promise<AssistantConversationDto> {
  return requestJson(
    `/api/assistant/conversations/${encodeURIComponent(conversationId)}/actions`,
    jsonRequest("POST", { action: "configure", ...input }),
  );
}

export async function sendAssistantMessage(
  conversationId: string,
  input: CreateAssistantMessageRequest,
): Promise<AssistantMessageAcceptedDto> {
  return requestJson(
    `/api/assistant/conversations/${encodeURIComponent(conversationId)}/messages`,
    jsonRequest("POST", input),
  );
}

export async function decideAssistantActivity(
  activityId: string,
  action: "confirm" | "reject" | "retry" | "resume" | "cancel",
): Promise<AssistantActivityActionResponseDto> {
  return requestJson(
    `/api/assistant/activities/${encodeURIComponent(activityId)}/actions`,
    jsonRequest("POST", { action }),
  );
}
