import {
  type ImportFormat,
  type ImportBatchDetail,
  type ImportUploadSession,
  type ImportBatch,
  type RunSnapshot,
  type ProjectQualityReport,
  type ProjectBackup,
  type BundleCounts,
  type ExportFormat,
  type SystemBackupManifest,
  type SystemBackupPreview,
} from "./types";
import {
  requestJson,
  jsonRequest,
  bytesToBase64,
  sha256,
  requestBlob,
} from "./client";
import { type ModelExecutionPolicy } from "@narralume/contracts";

export async function previewStoryImport(input: {
  targetProjectId: string | null;
  filename: string;
  format: ImportFormat;
  contentBase64: string;
}): Promise<ImportBatchDetail> {
  return requestJson("/api/imports/preview", jsonRequest("POST", input));
}

export async function uploadStoryFile(
  file: File,
  targetProjectId: string | null,
  format: ImportFormat,
  onProgress?: (receivedBytes: number, totalBytes: number) => void,
): Promise<ImportBatchDetail> {
  const chunkSize = 2 * 1024 * 1024;
  if (file.size <= chunkSize) {
    const contentBase64 = bytesToBase64(
      new Uint8Array(await file.arrayBuffer()),
    );
    onProgress?.(file.size, file.size);
    return previewStoryImport({
      targetProjectId,
      filename: file.name,
      format,
      contentBase64,
    });
  }
  const session = await requestJson<ImportUploadSession>(
    "/api/import-uploads",
    jsonRequest("POST", {
      targetProjectId,
      filename: file.name,
      format,
      totalBytes: file.size,
      chunkSize,
      expectedHash: null,
    }),
  );
  for (
    let offset = 0, index = 0;
    offset < file.size;
    offset += chunkSize, index += 1
  ) {
    const bytes = new Uint8Array(
      await file
        .slice(offset, Math.min(file.size, offset + chunkSize))
        .arrayBuffer(),
    );
    const chunkHash = await sha256(bytes);
    await requestJson<ImportUploadSession>(
      `/api/import-uploads/${encodeURIComponent(session.id)}/chunks/${index}`,
      jsonRequest("PUT", {
        contentBase64: bytesToBase64(bytes),
        chunkHash,
      }),
    );
    onProgress?.(Math.min(file.size, offset + bytes.byteLength), file.size);
  }
  const result = await requestJson<{
    session: ImportUploadSession;
    detail: ImportBatchDetail;
  }>(
    `/api/import-uploads/${encodeURIComponent(session.id)}/complete`,
    jsonRequest("POST", {}),
  );
  return result.detail;
}

export async function getStoryImport(
  batchId: string,
  signal?: AbortSignal,
): Promise<ImportBatchDetail> {
  return requestJson(
    `/api/imports/${encodeURIComponent(batchId)}`,
    signal ? { signal } : {},
  );
}

export async function getStoryImports(
  projectId: string,
  signal?: AbortSignal,
): Promise<ImportBatch[]> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/imports`,
    signal ? { signal } : {},
  );
}

export async function decideImportCandidate(
  candidateId: string,
  status: "selected" | "discarded",
): Promise<ImportBatchDetail> {
  return requestJson(
    `/api/import-candidates/${encodeURIComponent(candidateId)}`,
    jsonRequest("PUT", { status }),
  );
}

export async function analyzeStoryImport(
  batchId: string,
  requestId: string,
  policy?: ModelExecutionPolicy,
): Promise<RunSnapshot> {
  return requestJson(
    `/api/imports/${encodeURIComponent(batchId)}/analyze`,
    jsonRequest("POST", { requestId, ...(policy ? { policy } : {}) }),
  );
}

export async function applyStoryImport(
  batchId: string,
  selectedCandidateIds: string[],
): Promise<{ projectId: string; detail: ImportBatchDetail }> {
  return requestJson(
    `/api/imports/${encodeURIComponent(batchId)}/actions`,
    jsonRequest("POST", { action: "apply", selectedCandidateIds }),
  );
}

export async function discardStoryImport(
  batchId: string,
): Promise<ImportBatchDetail> {
  return requestJson(
    `/api/imports/${encodeURIComponent(batchId)}/actions`,
    jsonRequest("POST", { action: "discard", selectedCandidateIds: [] }),
  );
}

export async function getProjectQuality(
  projectId: string,
  signal?: AbortSignal,
): Promise<ProjectQualityReport> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/quality`,
    signal ? { signal } : {},
  );
}

export async function getProjectBackups(
  projectId: string,
  signal?: AbortSignal,
): Promise<ProjectBackup[]> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/backups`,
    signal ? { signal } : {},
  );
}

export async function createProjectBackup(
  projectId: string,
  label: string,
): Promise<ProjectBackup> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/backups`,
    jsonRequest("POST", { label }),
  );
}

export async function restoreProjectBackup(
  backupId: string,
  requestId: string,
): Promise<{
  projectId: string;
  backup: ProjectBackup;
  counts: BundleCounts;
}> {
  return requestJson(
    `/api/backups/${encodeURIComponent(backupId)}/restore`,
    jsonRequest("POST", { requestId }),
  );
}

export async function getProjectExport(
  projectId: string,
  format: ExportFormat,
  options: {
    versionMode: "current" | "history";
    includeAnnotations: boolean;
    includeRuns: boolean;
  } = {
    versionMode: "current",
    includeAnnotations: false,
    includeRuns: false,
  },
): Promise<{ blob: Blob; filename: string }> {
  const query = new URLSearchParams({
    versionMode: options.versionMode,
    includeAnnotations: String(options.includeAnnotations),
    includeRuns: String(options.includeRuns),
  });
  const { blob, filename } = await requestBlob(
    `/api/projects/${encodeURIComponent(projectId)}/exports/${encodeURIComponent(format)}?${query}`,
  );
  return { blob, filename: filename ?? `novel.${format}` };
}

export async function getSystemBackups(
  signal?: AbortSignal,
): Promise<SystemBackupManifest[]> {
  return requestJson("/api/system/backups", signal ? { signal } : {});
}

export async function createSystemBackup(
  label: string,
): Promise<SystemBackupManifest> {
  return requestJson("/api/system/backups", jsonRequest("POST", { label }));
}

export async function previewSystemBackup(
  backupId: string,
): Promise<SystemBackupPreview> {
  return requestJson(
    `/api/system/backups/${encodeURIComponent(backupId)}/preview`,
    {},
  );
}

export async function restoreSystemBackup(
  backupId: string,
  targetDirectory: string,
  overwrite = false,
): Promise<{
  targetDirectory: string;
  databasePath: string;
  sha256: string;
  migration: number;
  counts: SystemBackupPreview["counts"];
}> {
  return requestJson(
    `/api/system/backups/${encodeURIComponent(backupId)}/restore`,
    jsonRequest("POST", { targetDirectory, overwrite }),
  );
}
