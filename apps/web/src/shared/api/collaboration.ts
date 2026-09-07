import { type StoryPersona, type CoCreateSession, type CoCreateSessionDetail, type StoryTurn, type NarrativeRun, type RunSnapshot, type StoryBranch } from "./types";
import { requestJson, jsonRequest } from "./client";

export async function getPersonas(
  projectId: string,
  signal?: AbortSignal,
): Promise<StoryPersona[]> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/personas`,
    signal ? { signal } : {},
  );
}

export async function createPersona(
  projectId: string,
  input: Pick<
    StoryPersona,
    "kind" | "entityId" | "name" | "description" | "instructions" | "voice"
  >,
): Promise<StoryPersona> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/personas`,
    jsonRequest("POST", input),
  );
}

export async function updatePersona(
  personaId: string,
  input: Pick<
    StoryPersona,
    | "kind"
    | "entityId"
    | "name"
    | "description"
    | "instructions"
    | "voice"
    | "status"
  > & { expectedVersion: number },
): Promise<StoryPersona> {
  return requestJson(
    `/api/personas/${encodeURIComponent(personaId)}`,
    jsonRequest("PUT", input),
  );
}

export async function getCoCreateSessions(
  projectId: string,
  signal?: AbortSignal,
): Promise<CoCreateSession[]> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/cocreate/sessions`,
    signal ? { signal } : {},
  );
}

export async function createCoCreateSession(
  projectId: string,
  input: {
    title: string;
    speakerPolicy: CoCreateSession["speakerPolicy"];
    targetOutlineNodeId: string | null;
    authorPersonaId: string | null;
    directorNote: string | null;
    contextTurns: number;
    participantIds: string[];
  },
): Promise<CoCreateSessionDetail> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/cocreate/sessions`,
    jsonRequest("POST", input),
  );
}

export async function getCoCreateSession(
  sessionId: string,
  signal?: AbortSignal,
): Promise<CoCreateSessionDetail> {
  return requestJson(
    `/api/cocreate/sessions/${encodeURIComponent(sessionId)}`,
    signal ? { signal } : {},
  );
}

export async function updateCoCreateSession(
  sessionId: string,
  input: Partial<
    Pick<
      CoCreateSession,
      | "title"
      | "status"
      | "speakerPolicy"
      | "targetOutlineNodeId"
      | "authorPersonaId"
      | "directorNote"
      | "contextTurns"
    >
  > & { expectedVersion: number },
): Promise<CoCreateSession> {
  return requestJson(
    `/api/cocreate/sessions/${encodeURIComponent(sessionId)}`,
    jsonRequest("PUT", input),
  );
}

export async function replaceCoCreateParticipants(
  sessionId: string,
  expectedVersion: number,
  participants: {
    personaId: string;
    enabled: boolean;
    talkativeness: number;
  }[],
): Promise<CoCreateSessionDetail> {
  return requestJson(
    `/api/cocreate/sessions/${encodeURIComponent(sessionId)}/participants`,
    jsonRequest("PUT", { expectedVersion, participants }),
  );
}

export async function postStoryTurn(
  sessionId: string,
  input: {
    requestId: string;
    role: "user" | "director";
    personaId: string | null;
    content: string;
    generateReply: boolean;
    speakerPersonaId: string | null;
  },
): Promise<{ turn: StoryTurn; run: NarrativeRun | null }> {
  return requestJson(
    `/api/cocreate/sessions/${encodeURIComponent(sessionId)}/turns`,
    jsonRequest("POST", input),
  );
}

export async function generateTurnSwipe(
  turnId: string,
  requestId: string,
  speakerPersonaId: string | null,
): Promise<RunSnapshot> {
  return requestJson(
    `/api/turns/${encodeURIComponent(turnId)}/swipes`,
    jsonRequest("POST", { requestId, speakerPersonaId }),
  );
}

export async function selectTurnSwipe(
  turnId: string,
  swipeId: string,
): Promise<StoryTurn> {
  return requestJson(
    `/api/turns/${encodeURIComponent(turnId)}/swipe-selection`,
    jsonRequest("POST", { swipeId }),
  );
}

export async function revertStoryTurn(
  turnId: string,
): Promise<CoCreateSessionDetail> {
  return requestJson(
    `/api/turns/${encodeURIComponent(turnId)}/actions`,
    jsonRequest("POST", { action: "revert" }),
  );
}

export async function createStoryBranch(
  sessionId: string,
  fromTurnId: string,
  name: string,
  expectedVersion: number,
): Promise<StoryBranch> {
  return requestJson(
    `/api/cocreate/sessions/${encodeURIComponent(sessionId)}/branches`,
    jsonRequest("POST", { fromTurnId, name, expectedVersion }),
  );
}

export async function selectStoryBranch(
  sessionId: string,
  branchId: string,
  expectedVersion: number,
): Promise<CoCreateSessionDetail> {
  return requestJson(
    `/api/cocreate/sessions/${encodeURIComponent(sessionId)}/branch-selection`,
    jsonRequest("POST", { branchId, expectedVersion }),
  );
}

export async function adoptStoryRange(
  sessionId: string,
  input: {
    requestId: string;
    branchId: string;
    fromTurnId: string;
    toTurnId: string;
    title: string;
  },
): Promise<RunSnapshot> {
  return requestJson(
    `/api/cocreate/sessions/${encodeURIComponent(sessionId)}/adoptions`,
    jsonRequest("POST", input),
  );
}
