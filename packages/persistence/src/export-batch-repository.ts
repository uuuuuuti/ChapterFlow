import { randomUuid } from "@narralume/domain";
import type { NarrativeDatabase } from "./database.js";

export type ExportBatchFormat =
  "markdown" | "text" | "docx" | "epub" | "narrative-bundle";

export interface ExportBatchInput {
  format: ExportBatchFormat;
  status?: "completed" | "failed";
  versionMode: "current" | "history";
  includeAnnotations: boolean;
  includeRuns: boolean;
  fromOutlineNodeId: string | null;
  toOutlineNodeId: string | null;
  filename: string;
  byteSize: number;
  contentHash: string;
  errorCode?: string | null;
  errorMessage?: string | null;
  retryOfBatchId?: string | null;
}

export interface ExportBatch {
  id: string;
  projectId: string;
  format: ExportBatchFormat;
  status: "completed" | "failed";
  versionMode: ExportBatchInput["versionMode"];
  includeAnnotations: boolean;
  includeRuns: boolean;
  fromOutlineNodeId: string | null;
  toOutlineNodeId: string | null;
  filename: string;
  byteSize: number;
  contentHash: string;
  errorCode: string | null;
  errorMessage: string | null;
  retryOfBatchId: string | null;
  createdAt: string;
}

export class SqliteExportBatchRepository {
  constructor(private readonly database: NarrativeDatabase) {}

  list(projectId: string, limit = 50): ExportBatch[] {
    const rows = this.database.raw
      .prepare(
        `SELECT * FROM export_batches
         WHERE project_id = ?
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .all(
        projectId,
        Math.max(1, Math.min(200, Math.floor(limit))),
      ) as unknown as ExportBatchRow[];
    return rows.map(mapExportBatch);
  }

  get(projectId: string, id: string): ExportBatch | null {
    const row = this.database.raw
      .prepare("SELECT * FROM export_batches WHERE project_id = ? AND id = ?")
      .get(projectId, id) as ExportBatchRow | undefined;
    return row ? mapExportBatch(row) : null;
  }

  insert(
    projectId: string,
    input: ExportBatchInput,
    createdAt: string,
  ): ExportBatch {
    const batch: ExportBatch = {
      id: randomUuid(),
      projectId,
      ...input,
      status: input.status ?? "completed",
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage ?? null,
      retryOfBatchId: input.retryOfBatchId ?? null,
      createdAt,
    };
    this.database.raw
      .prepare(
        `INSERT INTO export_batches(
          id, project_id, format, status, version_mode, include_annotations, include_runs,
          from_outline_node_id, to_outline_node_id, filename, byte_size, content_hash,
          error_code, error_message, retry_of_batch_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        batch.id,
        batch.projectId,
        batch.format,
        batch.status,
        batch.versionMode,
        batch.includeAnnotations ? 1 : 0,
        batch.includeRuns ? 1 : 0,
        batch.fromOutlineNodeId,
        batch.toOutlineNodeId,
        batch.filename,
        batch.byteSize,
        batch.contentHash,
        batch.errorCode,
        batch.errorMessage,
        batch.retryOfBatchId,
        batch.createdAt,
      );
    return batch;
  }
}

interface ExportBatchRow {
  id: string;
  project_id: string;
  format: ExportBatchFormat;
  status: "completed" | "failed";
  version_mode: "current" | "history";
  include_annotations: number;
  include_runs: number;
  from_outline_node_id: string | null;
  to_outline_node_id: string | null;
  filename: string;
  byte_size: number;
  content_hash: string;
  error_code: string | null;
  error_message: string | null;
  retry_of_batch_id: string | null;
  created_at: string;
}

function mapExportBatch(row: ExportBatchRow): ExportBatch {
  return {
    id: row.id,
    projectId: row.project_id,
    format: row.format,
    status: row.status,
    versionMode: row.version_mode,
    includeAnnotations: row.include_annotations === 1,
    includeRuns: row.include_runs === 1,
    fromOutlineNodeId: row.from_outline_node_id,
    toOutlineNodeId: row.to_outline_node_id,
    filename: row.filename,
    byteSize: row.byte_size,
    contentHash: row.content_hash,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    retryOfBatchId: row.retry_of_batch_id,
    createdAt: row.created_at,
  };
}
