import {
  type StoryBible,
  type AuthorIntent,
  type CanonEntity,
  type StoryResourceRemoval,
  type OutlineNode,
  type CanonFact,
  type RelationshipEvent,
  type TimelineEvent,
  type Foreshadow,
} from "./types";
import { requestJson, jsonRequest } from "./client";
import {
  type CanonSpread,
  type CanonCandidateSetDto,
} from "@narralume/contracts";

export async function getStoryBible(
  projectId: string,
  signal?: AbortSignal,
): Promise<StoryBible> {
  return requestJson<StoryBible>(
    `/api/projects/${encodeURIComponent(projectId)}/story-bible`,
    signal ? { signal } : {},
  );
}

export async function startCanonCandidate(
  projectId: string,
  spread: CanonSpread,
  input: { requestId: string; instruction: string },
): Promise<{ runId: string; idempotentReplay: boolean }> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/canon-spreads/${encodeURIComponent(spread)}/candidates`,
    jsonRequest("POST", input),
  );
}

export async function getCanonCandidates(
  projectId: string,
  spread: CanonSpread,
  signal?: AbortSignal,
): Promise<CanonCandidateSetDto[]> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/canon-spreads/${encodeURIComponent(spread)}/candidates`,
    signal ? { signal } : {},
  );
}

export async function decideCanonCandidateItem(
  projectId: string,
  candidateSetId: string,
  itemId: string,
  input: { action: "apply" | "reject"; confirmLocked?: boolean },
): Promise<{
  candidateSet: CanonCandidateSetDto;
  item: CanonCandidateSetDto["items"][number];
}> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/canon-candidates/${encodeURIComponent(candidateSetId)}/items/${encodeURIComponent(itemId)}/decisions`,
    jsonRequest("POST", input),
  );
}

export async function updateAuthorIntent(
  projectId: string,
  input: Partial<Omit<AuthorIntent, "projectId" | "updatedAt">> & {
    expectedUpdatedAt: string | null;
  },
): Promise<AuthorIntent> {
  return requestJson<AuthorIntent>(
    `/api/projects/${encodeURIComponent(projectId)}/intent`,
    jsonRequest("PUT", input),
  );
}

export async function createCanonEntity(
  projectId: string,
  input: {
    type: CanonEntity["type"];
    name: string;
    aliases: string[];
    description: string | null;
    attributes?: Record<string, unknown>;
  },
): Promise<CanonEntity> {
  return requestJson<CanonEntity>(
    `/api/projects/${encodeURIComponent(projectId)}/entities`,
    jsonRequest("POST", input),
  );
}

export async function updateCanonEntity(
  projectId: string,
  entityId: string,
  input: Pick<
    CanonEntity,
    "name" | "aliases" | "description" | "attributes" | "status"
  > & { expectedUpdatedAt: string },
): Promise<CanonEntity> {
  return requestJson<CanonEntity>(
    `/api/projects/${encodeURIComponent(projectId)}/entities/${encodeURIComponent(entityId)}`,
    jsonRequest("PUT", input),
  );
}

export function removeStoryResource(path: string, expectedUpdatedAt: string) {
  return requestJson<StoryResourceRemoval>(
    path,
    jsonRequest("DELETE", { expectedUpdatedAt }),
  );
}

export function removeCanonEntity(projectId: string, entity: CanonEntity) {
  return removeStoryResource(
    `/api/projects/${encodeURIComponent(projectId)}/entities/${encodeURIComponent(entity.id)}`,
    entity.updatedAt,
  );
}

export async function createOutlineNode(
  projectId: string,
  input: {
    parentId: string;
    kind: OutlineNode["kind"];
    ordinal: number;
    title: string;
    summary: string | null;
    metadata: Record<string, unknown>;
  },
): Promise<OutlineNode> {
  return requestJson<OutlineNode>(
    `/api/projects/${encodeURIComponent(projectId)}/outline`,
    jsonRequest("POST", input),
  );
}

export async function updateOutlineNode(
  projectId: string,
  nodeId: string,
  input: Partial<
    Pick<
      OutlineNode,
      | "title"
      | "summary"
      | "goal"
      | "conflict"
      | "outcome"
      | "povEntityId"
      | "storyTime"
      | "status"
      | "metadata"
    >
  > & { expectedUpdatedAt: string },
): Promise<OutlineNode> {
  return requestJson<OutlineNode>(
    `/api/projects/${encodeURIComponent(projectId)}/outline/${encodeURIComponent(nodeId)}`,
    jsonRequest("PUT", input),
  );
}

export function removeOutlineNode(projectId: string, node: OutlineNode) {
  return removeStoryResource(
    `/api/projects/${encodeURIComponent(projectId)}/outline/${encodeURIComponent(node.id)}`,
    node.updatedAt,
  );
}

export async function createCanonFact(
  projectId: string,
  input: {
    subjectId: string;
    predicate: string;
    objectEntityId?: string | null;
    value?: unknown;
    authority: CanonFact["authority"];
    knowledgeScope: CanonFact["knowledgeScope"];
    knowledgeSubjectId?: string | null;
    confidence?: number;
  },
): Promise<{
  fact: CanonFact;
  conflicts: { reason: string; fact: CanonFact }[];
}> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/facts`,
    jsonRequest("POST", input),
  );
}

export async function reviseCanonFact(
  projectId: string,
  factId: string,
  input: {
    subjectId: string;
    predicate: string;
    objectEntityId: string | null;
    value?: unknown;
    validFromNodeId: string | null;
    validToNodeId: string | null;
    knowledgeScope: CanonFact["knowledgeScope"];
    knowledgeSubjectId: string | null;
    authority: CanonFact["authority"];
    confidence: number;
    confirmLockedRevision: boolean;
  },
): Promise<{
  fact: CanonFact;
  conflicts: { reason: string; fact: CanonFact }[];
}> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/facts/${encodeURIComponent(factId)}`,
    jsonRequest("PUT", input),
  );
}

export async function promoteCanonFact(
  projectId: string,
  factId: string,
  authority: "inferred" | "confirmed" | "locked",
): Promise<CanonFact> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/facts/${encodeURIComponent(factId)}/promote`,
    jsonRequest("POST", { authority }),
  );
}

export async function withdrawCanonFact(
  projectId: string,
  factId: string,
  input: {
    reason: string;
    confirmLockedWithdrawal: boolean;
  },
): Promise<{
  factId: string;
  projectId: string;
  reason: string;
  withdrawnAt: string;
}> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/facts/${encodeURIComponent(factId)}/withdraw`,
    jsonRequest("POST", input),
  );
}

export async function createRelationshipEvent(
  projectId: string,
  input: Omit<RelationshipEvent, "id" | "projectId" | "createdAt">,
): Promise<RelationshipEvent> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/relationships`,
    jsonRequest("POST", input),
  );
}

export function removeRelationshipEvent(
  projectId: string,
  relationship: RelationshipEvent,
) {
  return removeStoryResource(
    `/api/projects/${encodeURIComponent(projectId)}/relationships/${encodeURIComponent(relationship.id)}`,
    relationship.createdAt,
  );
}

export async function createTimelineEvent(
  projectId: string,
  input: Omit<TimelineEvent, "id" | "projectId" | "createdAt" | "updatedAt">,
): Promise<TimelineEvent> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/timeline`,
    jsonRequest("POST", input),
  );
}

export async function updateTimelineEvent(
  projectId: string,
  eventId: string,
  input: Omit<TimelineEvent, "id" | "projectId" | "createdAt" | "updatedAt"> & {
    expectedUpdatedAt: string;
  },
): Promise<TimelineEvent> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/timeline/${encodeURIComponent(eventId)}`,
    jsonRequest("PUT", input),
  );
}

export function removeTimelineEvent(projectId: string, event: TimelineEvent) {
  return removeStoryResource(
    `/api/projects/${encodeURIComponent(projectId)}/timeline/${encodeURIComponent(event.id)}`,
    event.updatedAt,
  );
}

export async function createForeshadow(
  projectId: string,
  input: Omit<Foreshadow, "id" | "projectId" | "createdAt" | "updatedAt">,
): Promise<Foreshadow> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/foreshadows`,
    jsonRequest("POST", input),
  );
}

export async function updateForeshadow(
  projectId: string,
  foreshadowId: string,
  input: Omit<Foreshadow, "id" | "projectId" | "createdAt" | "updatedAt"> & {
    expectedUpdatedAt: string;
  },
): Promise<Foreshadow> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/foreshadows/${encodeURIComponent(foreshadowId)}`,
    jsonRequest("PUT", input),
  );
}

export function removeForeshadow(projectId: string, item: Foreshadow) {
  return removeStoryResource(
    `/api/projects/${encodeURIComponent(projectId)}/foreshadows/${encodeURIComponent(item.id)}`,
    item.updatedAt,
  );
}
