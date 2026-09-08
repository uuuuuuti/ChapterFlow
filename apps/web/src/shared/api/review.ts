import {
  type ReviewWorkspace,
  type RunOriginInput,
  type ReviewIssueDecisionAction,
  type ReviewIssueStatus,
  type ReviewRevisionProposal,
  type CanonChangeSetView,
} from "./types";
import { requestJson, jsonRequest } from "./client";
import {
  type ModelExecutionPolicy,
  type DocumentReviewRunCreatedDto,
} from "@narralume/contracts";

export async function getReviewWorkspace(
  projectId: string,
  signal?: AbortSignal,
): Promise<ReviewWorkspace> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/reviews`,
    signal ? { signal } : {},
  );
}

export async function createDocumentReview(
  projectId: string,
  documentId: string,
  input: {
    requestId: string;
    documentVersionId: string;
    origin?: RunOriginInput | null;
    policy?: ModelExecutionPolicy;
  },
): Promise<DocumentReviewRunCreatedDto> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(documentId)}/reviews`,
    jsonRequest("POST", input),
  );
}

export async function decideReviewIssue(
  projectId: string,
  issueId: string,
  input: {
    action: ReviewIssueDecisionAction;
    note: string | null;
    expectedStatus: ReviewIssueStatus;
  },
): Promise<{
  id: string;
  issueId: string;
  action: ReviewIssueDecisionAction;
  note: string | null;
  priorStatus: ReviewIssueStatus;
  resultingStatus: ReviewIssueStatus;
  createdAt: string;
}> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/review-issues/${encodeURIComponent(issueId)}/decisions`,
    jsonRequest("POST", {
      ...input,
      requestId: `${issueId}:${input.action}`,
    }),
  );
}

export async function decideRevisionProposal(
  projectId: string,
  proposalId: string,
  action: "apply" | "reject",
): Promise<{ proposal: ReviewRevisionProposal }> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/revision-proposals/${encodeURIComponent(proposalId)}/decisions`,
    jsonRequest("POST", {
      action,
      requestId: `${proposalId}:${action}`,
    }),
  );
}

export async function getCanonChangeSets(
  projectId: string,
  signal?: AbortSignal,
): Promise<CanonChangeSetView[]> {
  const response = (await requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/canon-change-sets`,
    signal ? { signal } : {},
  )) as { changeSets: CanonChangeSetView[] };
  return response.changeSets;
}

export async function decideCanonChangeSet(
  projectId: string,
  changeSetId: string,
  input: {
    action: "apply" | "reject";
    expectedStatus?: "candidate";
    conflictPolicy?: "reject" | "force";
  },
): Promise<{ changeSet: CanonChangeSetView }> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/canon-change-sets/${encodeURIComponent(changeSetId)}/decisions`,
    jsonRequest("POST", {
      ...input,
      requestId: `${changeSetId}:${input.action}:${input.conflictPolicy ?? "reject"}`,
    }),
  );
}
