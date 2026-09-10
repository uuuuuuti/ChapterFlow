import { randomUuid } from "@narralume/domain";
import type { NarrativeDatabase } from "./database.js";
import { PersistenceNotFoundError } from "./project-repository.js";

export interface PublishRecordInput {
  platform: string;
  chapter: string;
  publishedAt: string;
  url: string | null;
  status: "published" | "scheduled" | "draft";
  exportBatchId: string | null;
}

export interface PublishRecord {
  id: string;
  projectId: string;
  platform: string;
  chapter: string;
  publishedAt: string;
  url: string | null;
  status: PublishRecordInput["status"];
  exportBatchId: string | null;
  createdAt: string;
  updatedAt: string;
}

export class SqlitePublishRecordRepository {
  constructor(private readonly database: NarrativeDatabase) {}

  list(projectId: string): PublishRecord[] {
    const rows = this.database.raw
      .prepare(
        `SELECT * FROM publish_records
         WHERE project_id = ?
         ORDER BY published_at DESC, created_at DESC`,
      )
      .all(projectId) as unknown as PublishRecordRow[];
    return rows.map(mapRecord);
  }

  insert(
    projectId: string,
    input: PublishRecordInput,
    now: string,
  ): PublishRecord {
    const id = randomUuid();
    this.database.raw
      .prepare(
        `INSERT INTO publish_records(
          id, project_id, platform, chapter, published_at, url, status, export_batch_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        projectId,
        input.platform.trim(),
        input.chapter.trim(),
        input.publishedAt,
        input.url,
        input.status,
        input.exportBatchId,
        now,
        now,
      );
    return this.get(projectId, id)!;
  }

  update(
    projectId: string,
    id: string,
    input: PublishRecordInput & { expectedUpdatedAt: string },
    now: string,
  ): PublishRecord {
    const result = this.database.raw
      .prepare(
        `UPDATE publish_records
         SET platform = ?, chapter = ?, published_at = ?, url = ?, status = ?, export_batch_id = ?, updated_at = ?
         WHERE project_id = ? AND id = ? AND updated_at = ?`,
      )
      .run(
        input.platform.trim(),
        input.chapter.trim(),
        input.publishedAt,
        input.url,
        input.status,
        input.exportBatchId,
        now,
        projectId,
        id,
        input.expectedUpdatedAt,
      );
    if (result.changes !== 1) {
      const current = this.get(projectId, id);
      if (!current) throw new PersistenceNotFoundError("publish_record", id);
      throw new Error("publish record version conflict");
    }
    return this.get(projectId, id)!;
  }

  remove(projectId: string, id: string): void {
    const result = this.database.raw
      .prepare("DELETE FROM publish_records WHERE project_id = ? AND id = ?")
      .run(projectId, id);
    if (result.changes !== 1) {
      throw new PersistenceNotFoundError("publish_record", id);
    }
  }

  private get(projectId: string, id: string): PublishRecord | null {
    const row = this.database.raw
      .prepare("SELECT * FROM publish_records WHERE project_id = ? AND id = ?")
      .get(projectId, id) as PublishRecordRow | undefined;
    return row ? mapRecord(row) : null;
  }
}

interface PublishRecordRow {
  id: string;
  project_id: string;
  platform: string;
  chapter: string;
  published_at: string;
  url: string | null;
  status: PublishRecord["status"];
  export_batch_id: string | null;
  created_at: string;
  updated_at: string;
}

function mapRecord(row: PublishRecordRow): PublishRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    platform: row.platform,
    chapter: row.chapter,
    publishedAt: row.published_at,
    url: row.url,
    status: row.status,
    exportBatchId: row.export_batch_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
