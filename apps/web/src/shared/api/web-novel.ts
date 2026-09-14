import type {
  BookProfileDto,
  BookProfileHistoryDto,
  ChapterBriefDto,
  ChapterBriefHistoryDto,
  CreateReaderPromiseRequest,
  ReaderPromiseActionRequest,
  ReaderPromiseEventDto,
  ReaderPromiseListResponse,
  CreateCreativePresetRequest,
  CreativePresetHistoryDto,
  CreativePresetDto,
  UpdateBookProfileRequest,
  UpdateChapterBriefRequest,
  UpdateCreativePresetRequest,
  OpeningThreeCheckReport,
  OpeningThreeCheckReportHistory,
  OpeningCheckAuditRecord,
  PlatformMetricDto,
  PlatformMetricImportAuditDto,
  PlatformMetricReportDto,
  PlatformMetricsImportResponse,
  CreatePublishRecordRequest,
  PublishRecordDto,
  ExportBatchDto,
  UpdatePublishRecordRequest,
  UpdateNovelCheckIssueRequest,
  CreateWebNovelCandidateRequest,
  DecideWebNovelCandidateItemRequest,
  WebNovelCandidateKind,
  WebNovelCandidateSetDto,
} from "@narralume/contracts";
import { jsonRequest, requestJson } from "./client";

export async function getCreativePresets(
  projectId?: string,
  signal?: AbortSignal,
): Promise<CreativePresetDto[]> {
  const query = projectId
    ? `?projectId=${encodeURIComponent(projectId)}`
    : "";
  return requestJson(
    `/api/creative-presets${query}`,
    signal ? { signal } : {},
  );
}

export async function createCreativePreset(
  input: CreateCreativePresetRequest,
): Promise<CreativePresetDto> {
  return requestJson(
    "/api/creative-presets",
    jsonRequest("POST", input),
  );
}

export async function updateCreativePreset(
  preset: CreativePresetDto,
  input: Omit<UpdateCreativePresetRequest, "expectedVersion">,
): Promise<CreativePresetDto> {
  return requestJson(
    `/api/creative-presets/${encodeURIComponent(preset.id)}`,
    jsonRequest("PUT", { ...input, expectedVersion: preset.version }),
  );
}

export async function getCreativePresetHistory(
  presetId: string,
  signal?: AbortSignal,
): Promise<CreativePresetHistoryDto[]> {
  return requestJson(
    `/api/creative-presets/${encodeURIComponent(presetId)}/history`,
    signal ? { signal } : {},
  );
}

export async function restoreCreativePresetHistory(
  presetId: string,
  historyId: string,
  expectedVersion: number,
): Promise<CreativePresetDto> {
  return requestJson(
    `/api/creative-presets/${encodeURIComponent(presetId)}/history/${encodeURIComponent(historyId)}/restore`,
    jsonRequest("POST", { expectedVersion }),
  );
}

export async function applyCreativePreset(
  projectId: string,
  presetId: string,
): Promise<BookProfileDto> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/creative-presets/${encodeURIComponent(presetId)}/apply`,
    jsonRequest("POST", {}),
  );
}

export async function getBookProfile(
  projectId: string,
  signal?: AbortSignal,
): Promise<BookProfileDto | null> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/book-profile`,
    signal ? { signal } : {},
  );
}

export async function updateBookProfile(
  projectId: string,
  input: UpdateBookProfileRequest,
): Promise<BookProfileDto> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/book-profile`,
    jsonRequest("PUT", input),
  );
}

export async function getBookProfileHistory(
  projectId: string,
  signal?: AbortSignal,
): Promise<BookProfileHistoryDto[]> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/book-profile/history`,
    signal ? { signal } : {},
  );
}

export async function restoreBookProfileHistory(
  projectId: string,
  historyId: string,
  expectedVersion: number,
): Promise<BookProfileDto> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/book-profile/history/${encodeURIComponent(historyId)}/restore`,
    jsonRequest("POST", { expectedVersion }),
  );
}

export async function getChapterBrief(
  projectId: string,
  outlineNodeId: string,
  signal?: AbortSignal,
): Promise<ChapterBriefDto | null> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/chapter-briefs/${encodeURIComponent(outlineNodeId)}`,
    signal ? { signal } : {},
  );
}

export async function updateChapterBrief(
  projectId: string,
  outlineNodeId: string,
  input: UpdateChapterBriefRequest,
): Promise<ChapterBriefDto> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/chapter-briefs/${encodeURIComponent(outlineNodeId)}`,
    jsonRequest("PUT", input),
  );
}

export async function getChapterBriefHistory(
  projectId: string,
  outlineNodeId: string,
  signal?: AbortSignal,
): Promise<ChapterBriefHistoryDto[]> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/chapter-briefs/${encodeURIComponent(outlineNodeId)}/history`,
    signal ? { signal } : {},
  );
}

export async function restoreChapterBriefHistory(
  projectId: string,
  outlineNodeId: string,
  historyId: string,
  expectedVersion: number,
): Promise<ChapterBriefDto> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/chapter-briefs/${encodeURIComponent(outlineNodeId)}/history/${encodeURIComponent(historyId)}/restore`,
    jsonRequest("POST", { expectedVersion }),
  );
}

export async function getReaderPromises(
  projectId: string,
  options: {
    status?: "open" | "paid_off" | "abandoned";
    view?: "all" | "open" | "long_unadvanced" | "overloaded";
    chapterId?: string;
    signal?: AbortSignal;
  } = {},
): Promise<ReaderPromiseListResponse> {
  const params = new URLSearchParams();
  if (options.status) params.set("status", options.status);
  if (options.view) params.set("view", options.view);
  if (options.chapterId) params.set("chapterId", options.chapterId);
  const query = params.size ? `?${params.toString()}` : "";
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/reader-promises${query}`,
    options.signal ? { signal: options.signal } : {},
  );
}

export async function getReaderPromiseEvents(
  projectId: string,
  promiseId: string,
  signal?: AbortSignal,
): Promise<ReaderPromiseEventDto[]> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/reader-promises/${encodeURIComponent(promiseId)}/events`,
    signal ? { signal } : {},
  );
}

export async function createReaderPromise(
  projectId: string,
  input: CreateReaderPromiseRequest,
): Promise<ReaderPromiseListResponse["promises"][number]> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/reader-promises`,
    jsonRequest("POST", input),
  );
}

export async function applyReaderPromiseAction(
  projectId: string,
  promiseId: string,
  input: ReaderPromiseActionRequest,
): Promise<ReaderPromiseListResponse["promises"][number]> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/reader-promises/${encodeURIComponent(promiseId)}/actions`,
    jsonRequest("POST", input),
  );
}

export async function createWebNovelCandidate(
  projectId: string,
  input: Omit<CreateWebNovelCandidateRequest, "origin"> & {
    origin?: CreateWebNovelCandidateRequest["origin"];
  },
): Promise<{ runId: string; idempotentReplay: boolean }> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/web-novel/candidates`,
    jsonRequest("POST", input),
  );
}

export async function getWebNovelCandidates(
  projectId: string,
  options: {
    kind?: WebNovelCandidateKind;
    outlineNodeId?: string | null;
    signal?: AbortSignal;
  } = {},
): Promise<WebNovelCandidateSetDto[]> {
  const params = new URLSearchParams();
  if (options.kind) params.set("kind", options.kind);
  if (options.outlineNodeId) params.set("outlineNodeId", options.outlineNodeId);
  const query = params.size ? `?${params.toString()}` : "";
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/web-novel/candidates${query}`,
    options.signal ? { signal: options.signal } : {},
  );
}

export async function decideWebNovelCandidateItem(
  projectId: string,
  candidateSetId: string,
  itemId: string,
  input: DecideWebNovelCandidateItemRequest,
): Promise<{ candidateSet: WebNovelCandidateSetDto; item: WebNovelCandidateSetDto["items"][number] }> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/web-novel/candidates/${encodeURIComponent(candidateSetId)}/items/${encodeURIComponent(itemId)}/decisions`,
    jsonRequest("POST", input),
  );
}

export async function runOpeningThreeCheck(
  projectId: string,
): Promise<OpeningThreeCheckReport> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/web-novel/checks/opening-three`,
    jsonRequest("POST", {}),
  );
}

export async function getOpeningThreeCheckHistory(
  projectId: string,
  signal?: AbortSignal,
): Promise<OpeningThreeCheckReportHistory> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/web-novel/checks/opening-three/history`,
    signal ? { signal } : {},
  );
}

export async function getOpeningCheckAudit(
  projectId: string,
  signal?: AbortSignal,
): Promise<OpeningCheckAuditRecord[]> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/web-novel/checks/opening-three/audit`,
    signal ? { signal } : {},
  );
}

export async function updateOpeningCheckIssue(
  projectId: string,
  issueId: string,
  input: UpdateNovelCheckIssueRequest,
): Promise<{
  projectId: string;
  issueId: string;
  status: "open" | "ignored" | "resolved";
  note: string | null;
  updatedAt: string;
}> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/web-novel/checks/opening-three/issues/${encodeURIComponent(issueId)}`,
    jsonRequest("PUT", input),
  );
}

export async function getPlatformMetrics(
  projectId: string,
  signal?: AbortSignal,
): Promise<PlatformMetricDto[]> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/metrics/platform`,
    signal ? { signal } : {},
  );
}

export async function savePlatformMetrics(
  projectId: string,
  records: Array<Omit<PlatformMetricDto, "id" | "projectId" | "updatedAt">>,
  options: { sourceRows?: number } = {},
): Promise<PlatformMetricsImportResponse> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/metrics/platform`,
    jsonRequest("POST", { records, ...options }),
  );
}

export async function getPlatformMetricImportAudits(
  projectId: string,
  signal?: AbortSignal,
): Promise<PlatformMetricImportAuditDto[]> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/metrics/platform/imports`,
    signal ? { signal } : {},
  );
}

export async function getPlatformMetricReport(
  projectId: string,
  signal?: AbortSignal,
): Promise<PlatformMetricReportDto> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/metrics/platform/report`,
    signal ? { signal } : {},
  );
}

export async function rollbackPlatformMetricImport(
  projectId: string,
  importId: string,
): Promise<PlatformMetricImportAuditDto> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/metrics/platform/imports/${encodeURIComponent(importId)}/rollback`,
    jsonRequest("POST", {}),
  );
}

export async function getPublishRecords(
  projectId: string,
  signal?: AbortSignal,
): Promise<PublishRecordDto[]> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/publish-records`,
    signal ? { signal } : {},
  );
}

export async function getExportBatches(
  projectId: string,
  signal?: AbortSignal,
): Promise<ExportBatchDto[]> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/export-batches`,
    signal ? { signal } : {},
  );
}

export async function createPublishRecord(
  projectId: string,
  input: CreatePublishRecordRequest,
): Promise<PublishRecordDto> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/publish-records`,
    jsonRequest("POST", input),
  );
}

export async function updatePublishRecord(
  projectId: string,
  recordId: string,
  input: UpdatePublishRecordRequest,
): Promise<PublishRecordDto> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/publish-records/${encodeURIComponent(recordId)}`,
    jsonRequest("PUT", input),
  );
}

export async function deletePublishRecord(
  projectId: string,
  recordId: string,
): Promise<void> {
  await requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/publish-records/${encodeURIComponent(recordId)}`,
    jsonRequest("DELETE", {}),
  );
}
