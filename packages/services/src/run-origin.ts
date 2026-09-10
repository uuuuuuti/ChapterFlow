import type { RunOrigin } from "@narralume/contracts";
import {
  SqliteDocumentRepository,
  SqliteStoryRepository,
  type NarrativeDatabase,
} from "@narralume/persistence";

import { RunServiceError } from "./run-policy.js";

/**
 * Context used when a route already resolved the resource that started a run.
 * The origin is still client supplied metadata, so it must be checked against
 * that resolved resource before it is persisted into a task policy.
 */
export interface RunOriginValidationContext {
  expectedDocumentId?: string;
  expectedOutlineNodeId?: string;
  expectedVersionId?: string;
}

/**
 * Validate the stable resource references carried by a task origin.
 *
 * Origins are navigation data, but they are also the lineage shown beside an
 * AI candidate and used to return an author to the right manuscript. A stale
 * or cross-project origin must therefore fail at task creation rather than
 * becoming a plausible looking, but incorrect, recovery link.
 */
export function validateRunOrigin(
  database: NarrativeDatabase,
  projectId: string,
  origin: RunOrigin | null | undefined,
  context: RunOriginValidationContext = {},
): RunOrigin | null {
  if (!origin) return null;

  const documents = new SqliteDocumentRepository(database);
  const story = new SqliteStoryRepository(database);
  const documentId = origin.documentId ?? context.expectedDocumentId ?? null;
  const originDocument = origin.documentId
    ? documents.get(projectId, origin.documentId)
    : null;

  if (
    context.expectedDocumentId &&
    origin.documentId &&
    origin.documentId !== context.expectedDocumentId
  ) {
    throw new RunServiceError(
      "run.origin.document_mismatch",
      "The task origin points to a different manuscript than the requested action",
      422,
    );
  }

  if (origin.documentId) {
    if (!originDocument) {
      throw new RunServiceError(
        "run.origin.document_not_found",
        "The manuscript in the task origin does not belong to this project",
        404,
      );
    }
  }
  if (
    origin.outlineNodeId &&
    originDocument?.outlineNodeId &&
    origin.outlineNodeId !== originDocument.outlineNodeId
  ) {
    throw new RunServiceError(
      "run.origin.document_outline_mismatch",
      "The task origin manuscript and outline node refer to different chapters",
      422,
    );
  }
  if (
    context.expectedOutlineNodeId &&
    originDocument?.outlineNodeId &&
    originDocument.outlineNodeId !== context.expectedOutlineNodeId
  ) {
    throw new RunServiceError(
      "run.origin.document_outline_mismatch",
      "The task origin manuscript belongs to a different chapter than the requested action",
      422,
    );
  }

  if (origin.outlineNodeId) {
    const node = story.getOutlineNode(projectId, origin.outlineNodeId);
    if (!node) {
      throw new RunServiceError(
        "run.origin.outline_not_found",
        "The outline node in the task origin does not belong to this project",
        404,
      );
    }
    if (origin.outlineUpdatedAt && node.updatedAt !== origin.outlineUpdatedAt) {
      throw new RunServiceError(
        "run.origin.outline_version_conflict",
        "The outline node changed after this planning context was opened; refresh the outline and try again",
        409,
      );
    }
  }
  if (
    context.expectedOutlineNodeId &&
    origin.outlineNodeId &&
    origin.outlineNodeId !== context.expectedOutlineNodeId
  ) {
    throw new RunServiceError(
      "run.origin.outline_mismatch",
      "The task origin points to a different outline node than the requested action",
      422,
    );
  }

  const versionIds = [origin.versionId, origin.checkDocumentVersionId].filter(
    (value): value is string => Boolean(value),
  );
  if (versionIds.length && !documentId) {
    throw new RunServiceError(
      "run.origin.version_requires_document",
      "A task origin version must identify its manuscript",
      422,
    );
  }
  for (const versionId of versionIds) {
    if (!documents.getVersion(projectId, documentId!, versionId)) {
      throw new RunServiceError(
        "run.origin.version_not_found",
        "The manuscript version in the task origin no longer exists",
        404,
      );
    }
  }
  if (
    context.expectedVersionId &&
    origin.versionId &&
    origin.versionId !== context.expectedVersionId
  ) {
    throw new RunServiceError(
      "run.origin.version_mismatch",
      "The task origin was created from a different manuscript version",
      409,
    );
  }

  if (origin.selection) {
    if (!documentId) {
      throw new RunServiceError(
        "run.origin.selection_requires_document",
        "A task origin selection must identify its manuscript",
        422,
      );
    }
    const selectionVersionId =
      context.expectedVersionId ??
      origin.versionId ??
      origin.checkDocumentVersionId ??
      documents.get(projectId, documentId)?.currentVersionId;
    const selectionVersion = selectionVersionId
      ? documents.getVersion(projectId, documentId, selectionVersionId)
      : null;
    if (!selectionVersion) {
      throw new RunServiceError(
        "run.origin.selection_version_not_found",
        "The task origin selection has no available manuscript version",
        404,
      );
    }
    if (
      selectionVersion.content.length < origin.selection.end ||
      origin.selection.start >= origin.selection.end
    ) {
      throw new RunServiceError(
        "run.origin.selection_invalid",
        "The task origin selection is outside the referenced manuscript version",
        422,
      );
    }
  }

  return origin;
}
