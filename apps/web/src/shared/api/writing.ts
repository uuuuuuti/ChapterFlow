import {
  type StoryDocument,
  type StudioDocumentDetail,
  type DocumentVersion,
  type DocumentDraft,
  type DocumentComment,
  type RunSnapshot,
  type EditProposal,
} from "./types";
import { requestJson, jsonRequest } from "./client";
import { type ModelExecutionPolicy } from "@narralume/contracts";

export async function getStudioDocuments(
  projectId: string,
  signal?: AbortSignal,
  includeArchived = false,
): Promise<StoryDocument[]> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/studio/documents${includeArchived ? "?includeArchived=true" : ""}`,
    signal ? { signal } : {},
  );
}

export async function setStoryDocumentArchived(
  document: StoryDocument,
  archived: boolean,
): Promise<StoryDocument> {
  return requestJson(
    `/api/projects/${encodeURIComponent(document.projectId)}/studio/documents/${encodeURIComponent(document.id)}/archive`,
    jsonRequest("PUT", {
      archived,
      expectedUpdatedAt: document.updatedAt,
    }),
  );
}

export async function createStoryDocument(
  projectId: string,
  input: {
    requestId: string;
    kind: StoryDocument["kind"];
    title: string;
    outlineNodeId: string | null;
  },
): Promise<StoryDocument> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/documents`,
    jsonRequest("POST", input),
  );
}

export async function getStudioDocument(
  projectId: string,
  documentId: string,
  signal?: AbortSignal,
): Promise<StudioDocumentDetail> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/studio/documents/${encodeURIComponent(documentId)}`,
    signal ? { signal } : {},
  );
}

export async function appendDocumentVersion(
  projectId: string,
  documentId: string,
  input: {
    content: string;
    source: string;
    expectedCurrentVersionId: string | null;
  },
): Promise<DocumentVersion> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(documentId)}/versions`,
    jsonRequest("POST", input),
  );
}

export async function saveDocumentDraft(
  projectId: string,
  documentId: string,
  input: {
    content: string;
    baseVersionId: string | null;
    expectedDraftUpdatedAt: string | null;
  },
): Promise<DocumentDraft | null> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/studio/documents/${encodeURIComponent(documentId)}/draft`,
    jsonRequest("PUT", input),
  );
}

export async function restoreDocumentVersion(
  projectId: string,
  documentId: string,
  targetVersionId: string,
  expectedCurrentVersionId: string | null,
): Promise<DocumentVersion> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(documentId)}/restore`,
    jsonRequest("POST", { targetVersionId, expectedCurrentVersionId }),
  );
}

export async function createDocumentComment(
  projectId: string,
  documentId: string,
  input: {
    versionId: string;
    startOffset: number;
    endOffset: number;
    quote: string;
    body: string;
  },
): Promise<DocumentComment> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/studio/documents/${encodeURIComponent(documentId)}/comments`,
    jsonRequest("POST", input),
  );
}

export async function setDocumentCommentStatus(
  commentId: string,
  status: DocumentComment["status"],
): Promise<DocumentComment> {
  return requestJson(
    `/api/studio/comments/${encodeURIComponent(commentId)}`,
    jsonRequest("PUT", { status }),
  );
}

export async function createSelectionEdit(
  projectId: string,
  documentId: string,
  input: {
    baseVersionId: string;
    draftContentHash: string | null;
    selectionStart: number;
    selectionEnd: number;
    instruction: string;
    /** 稀疏覆盖；模型由服务端 assignment 解析。 */
    policy?: ModelExecutionPolicy;
  },
): Promise<RunSnapshot> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/studio/documents/${encodeURIComponent(documentId)}/selection-edits`,
    jsonRequest("POST", input),
  );
}

export async function decideEditProposal(
  proposalId: string,
  action: "accept" | "reject",
): Promise<EditProposal> {
  return requestJson(
    `/api/studio/edit-proposals/${encodeURIComponent(proposalId)}/actions`,
    jsonRequest("POST", {
      action,
      requestId: `${proposalId}:${action}`,
    }),
  );
}
