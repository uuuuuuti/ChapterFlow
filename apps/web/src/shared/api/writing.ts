import {
  type StoryDocument,
  type OutlineNode,
  type StudioDocumentDetail,
  type DocumentVersion,
  type DocumentDraft,
  type DocumentComment,
  type RunSnapshot,
  type EditProposal,
} from "./types";
import { requestJson, jsonRequest } from "./client";
import { type ModelExecutionPolicy } from "@narralume/contracts";
import type { RunOrigin } from "@narralume/contracts";

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

export async function renameStoryDocument(
  document: StoryDocument,
  title: string,
  expectedOutlineUpdatedAt: string | null,
): Promise<StoryDocument> {
  return requestJson(
    `/api/projects/${encodeURIComponent(document.projectId)}/studio/documents/${encodeURIComponent(document.id)}`,
    jsonRequest("PUT", {
      title,
      expectedUpdatedAt: document.updatedAt,
      expectedOutlineUpdatedAt,
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

export async function createChapter(
  projectId: string,
  input: { requestId: string; title: string; parentId: string | null },
): Promise<{ outline: OutlineNode; document: StoryDocument }> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/chapters`,
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
    requestId?: string;
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

export async function retryDocumentSettlement(
  projectId: string,
  documentId: string,
  versionId: string,
  requestId: string,
): Promise<{
  runId: string;
  idempotentReplay: boolean;
  alreadyCompleted: boolean;
}> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(documentId)}/versions/${encodeURIComponent(versionId)}/settlement/retry`,
    jsonRequest("POST", { requestId }),
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
  return updateDocumentComment(commentId, { status });
}

export async function updateDocumentComment(
  commentId: string,
  input: {
    body?: string;
    status?: DocumentComment["status"];
    expectedUpdatedAt?: string;
  },
): Promise<DocumentComment> {
  return requestJson(
    `/api/studio/comments/${encodeURIComponent(commentId)}`,
    jsonRequest("PUT", input),
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
    origin?: RunOrigin | null;
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
  mode?: "replace" | "insert_after",
): Promise<EditProposal> {
  return requestJson(
    `/api/studio/edit-proposals/${encodeURIComponent(proposalId)}/actions`,
    jsonRequest("POST", {
      action,
      ...(mode ? { mode } : {}),
      requestId: `${proposalId}:${action}${mode ? `:${mode}` : ""}`,
    }),
  );
}
