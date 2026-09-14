import {
  createReaderPromise,
  transitionReaderPromise,
  type ReaderPromise,
  type ReaderPromiseAction,
  type ReaderPromiseEvent,
  type ReaderPromiseHealth,
  type ReaderPromiseOperation,
  type ReaderPromiseStatus,
  type ReaderPromiseView,
} from "@narralume/domain";

import type { NarrativeDatabase } from "./database.js";
import { PersistenceNotFoundError } from "./project-repository.js";

export type ReaderPromiseActionSource =
  "author" | "ai" | "settlement" | "restore";

export interface ReaderPromiseListOptions {
  status?: ReaderPromiseStatus;
  view?: "all" | "open" | "long_unadvanced" | "overloaded";
  currentChapterIndex?: number;
}

export class SqliteReaderPromiseRepository {
  constructor(private readonly database: NarrativeDatabase) {}

  get(projectId: string, id: string): ReaderPromise | null {
    const row = this.database.raw
      .prepare("SELECT * FROM reader_promises WHERE project_id = ? AND id = ?")
      .get(projectId, id) as ReaderPromiseRow | undefined;
    return row ? mapReaderPromise(row) : null;
  }

  require(projectId: string, id: string): ReaderPromise {
    const promise = this.get(projectId, id);
    if (!promise) throw new PersistenceNotFoundError("reader_promise", id);
    return promise;
  }

  list(projectId: string, status?: ReaderPromiseStatus): ReaderPromise[] {
    const rows = this.database.raw
      .prepare(
        `SELECT * FROM reader_promises
         WHERE project_id = ? AND (? IS NULL OR status = ?)
         ORDER BY opened_chapter_index, created_at, id`,
      )
      .all(
        projectId,
        status ?? null,
        status ?? null,
      ) as unknown as ReaderPromiseRow[];
    return rows.map(mapReaderPromise);
  }

  listEvents(projectId: string, promiseId: string): ReaderPromiseEvent[] {
    const rows = this.database.raw
      .prepare(
        `SELECT * FROM reader_promise_events
         WHERE project_id = ? AND promise_id = ?
         ORDER BY chapter_index,
           CASE action WHEN 'OPEN' THEN 0 WHEN 'ADVANCE' THEN 1 WHEN 'PAYOFF' THEN 2 END,
           created_at, id`,
      )
      .all(projectId, promiseId) as unknown as ReaderPromiseEventRow[];
    return rows.map(mapReaderPromiseEvent);
  }

  chapterIndex(projectId: string, chapterId: string): number {
    const row = this.database.raw
      .prepare(
        `WITH RECURSIVE tree(id, sort_path, kind) AS (
          SELECT id, printf('%08d', ordinal), kind
          FROM outline_nodes
          WHERE project_id = ? AND parent_id IS NULL
          UNION ALL
          SELECT child.id, tree.sort_path || '.' || printf('%08d', child.ordinal), child.kind
          FROM outline_nodes child
          JOIN tree ON child.parent_id = tree.id
          WHERE child.project_id = ?
        )
        SELECT (
          SELECT COUNT(*) FROM tree chapter
          WHERE chapter.kind = 'chapter'
            AND chapter.sort_path <= target.sort_path
        ) AS chapter_index
        FROM tree target
        WHERE target.id = ? AND target.kind = 'chapter'`,
      )
      .get(projectId, projectId, chapterId) as
      { chapter_index: number } | undefined;
    return row && row.chapter_index > 0 ? row.chapter_index : 1;
  }

  latestChapterIndex(projectId: string): number {
    const row = this.database.raw
      .prepare(
        "SELECT COUNT(*) AS chapter_count FROM outline_nodes WHERE project_id = ? AND kind = 'chapter'",
      )
      .get(projectId) as { chapter_count: number };
    return Math.max(1, row.chapter_count);
  }

  create(input: {
    id: string;
    projectId: string;
    title: string;
    description?: string | null;
    openedChapterId: string;
    targetChapterId?: string | null;
    now: string;
    source?: ReaderPromiseActionSource;
  }): ReaderPromise {
    return this.database.transaction(() => {
      const existing = this.get(input.projectId, input.id);
      if (existing) return existing;
      const promise = createReaderPromise({
        id: input.id,
        projectId: input.projectId,
        title: input.title,
        description: input.description ?? null,
        openedChapterId: input.openedChapterId,
        openedChapterIndex: this.chapterIndex(
          input.projectId,
          input.openedChapterId,
        ),
        targetChapterId: input.targetChapterId ?? null,
        now: input.now,
      });
      this.database.raw
        .prepare(
          `INSERT INTO reader_promises(
            id, project_id, title, description, status, opened_chapter_id,
            opened_chapter_index, target_chapter_id, paid_off_chapter_id,
            last_advanced_chapter_id, last_advanced_chapter_index,
            advance_count, version, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          promise.id,
          promise.projectId,
          promise.title,
          promise.description,
          promise.status,
          promise.openedChapterId,
          promise.openedChapterIndex,
          promise.targetChapterId,
          promise.paidOffChapterId,
          promise.lastAdvancedChapterId,
          promise.lastAdvancedChapterIndex,
          promise.advanceCount,
          promise.version,
          promise.createdAt,
          promise.updatedAt,
        );
      this.insertEvent({
        id: `${promise.id}:open`,
        projectId: promise.projectId,
        promiseId: promise.id,
        action: "OPEN",
        chapterId: input.openedChapterId,
        chapterIndex: promise.openedChapterIndex,
        note: promise.description,
        source: input.source ?? "author",
        createdAt: input.now,
      });
      return promise;
    });
  }

  applyAction(input: {
    projectId: string;
    promiseId: string;
    action: Exclude<ReaderPromiseAction, "OPEN">;
    chapterId: string;
    chapterIndex?: number;
    note?: string | null;
    source?: ReaderPromiseActionSource;
    now: string;
  }): ReaderPromise {
    return this.database.transaction(() => {
      const current = this.require(input.projectId, input.promiseId);
      const chapterIndex =
        input.chapterIndex ??
        this.chapterIndex(input.projectId, input.chapterId);
      const existingEvent = this.database.raw
        .prepare(
          `SELECT id FROM reader_promise_events
           WHERE project_id = ? AND promise_id = ? AND action = ? AND chapter_id = ?`,
        )
        .get(input.projectId, input.promiseId, input.action, input.chapterId);
      if (existingEvent) return current;
      const updated = transitionReaderPromise(
        current,
        input.action,
        input.chapterId,
        chapterIndex,
        input.now,
      );
      this.database.raw
        .prepare(
          `UPDATE reader_promises SET status = ?, paid_off_chapter_id = ?,
            last_advanced_chapter_id = ?, last_advanced_chapter_index = ?,
            advance_count = ?, version = ?, updated_at = ?
           WHERE project_id = ? AND id = ? AND version = ?`,
        )
        .run(
          updated.status,
          updated.paidOffChapterId,
          updated.lastAdvancedChapterId,
          updated.lastAdvancedChapterIndex,
          updated.advanceCount,
          updated.version,
          updated.updatedAt,
          input.projectId,
          input.promiseId,
          current.version,
        );
      this.insertEvent({
        id: `${input.promiseId}:${input.action}:${input.chapterId}`,
        projectId: input.projectId,
        promiseId: input.promiseId,
        action: input.action,
        chapterId: input.chapterId,
        chapterIndex,
        note: input.note ?? null,
        source: input.source ?? "author",
        createdAt: input.now,
      });
      return updated;
    });
  }

  /** Materialize typed Chapter Intent operations and make every transition
   * idempotent. The returned operations contain generated IDs for new OPENs,
   * so the saved intent can keep a stable relation to its promise entities. */
  applyChapterOperations(input: {
    projectId: string;
    chapterId: string;
    operations: readonly ReaderPromiseOperation[];
    source?: ReaderPromiseActionSource;
    now: string;
  }): ReaderPromiseOperation[] {
    return this.database.transaction(() => {
      const normalized: ReaderPromiseOperation[] = [];
      for (const operation of input.operations) {
        if (operation.action === "OPEN") {
          const promiseId =
            operation.promiseId ??
            `${input.chapterId}:promise:${normalized.length}`;
          const existing = this.get(input.projectId, promiseId);
          if (!existing) {
            if (!operation.title) {
              throw new Error("An OPEN reader promise requires a title");
            }
            this.create({
              id: promiseId,
              projectId: input.projectId,
              title: operation.title,
              description: operation.note,
              openedChapterId: input.chapterId,
              now: input.now,
              source: input.source ?? "author",
            });
          }
          normalized.push({ ...operation, promiseId });
          continue;
        }
        if (!operation.promiseId) {
          throw new Error(
            `${operation.action} reader promise requires promiseId`,
          );
        }
        this.applyAction({
          projectId: input.projectId,
          promiseId: operation.promiseId,
          action: operation.action,
          chapterId: input.chapterId,
          source: input.source ?? "author",
          note: operation.note,
          now: input.now,
        });
        normalized.push(operation);
      }
      return normalized;
    });
  }

  listViews(
    projectId: string,
    options: ReaderPromiseListOptions = {},
  ): { promises: ReaderPromiseView[]; health: ReaderPromiseHealth } {
    const currentChapterIndex = Math.max(
      1,
      options.currentChapterIndex ?? this.latestChapterIndex(projectId),
    );
    const source = this.list(projectId);
    const views = source.map((promise) => {
      const events = this.listEvents(projectId, promise.id);
      const lastAction = events.at(-1)?.action ?? "OPEN";
      const openForChapters =
        promise.status === "open"
          ? Math.max(0, currentChapterIndex - promise.openedChapterIndex + 1)
          : 0;
      const latestActivityIndex =
        promise.lastAdvancedChapterIndex ?? promise.openedChapterIndex;
      const warningCodes: string[] = [];
      if (
        promise.status === "open" &&
        currentChapterIndex - latestActivityIndex >= 6
      ) {
        warningCodes.push("promise.long_unadvanced");
      }
      if (promise.status === "open" && openForChapters >= 12) {
        warningCodes.push("promise.aging");
      }
      return {
        ...promise,
        openForChapters,
        lastAction,
        warningCodes,
      } satisfies ReaderPromiseView;
    });
    const open = views.filter((promise) => promise.status === "open");
    const longUnadvanced = open.filter((promise) =>
      promise.warningCodes.includes("promise.long_unadvanced"),
    );
    const overloaded = open.length >= 8;
    const health: ReaderPromiseHealth = {
      openCount: open.length,
      longUnadvancedCount: longUnadvanced.length,
      overloaded,
      warningCodes: [
        ...(longUnadvanced.length ? ["promise.long_unadvanced"] : []),
        ...(overloaded ? ["promise.overloaded"] : []),
      ],
    };
    const filtered = views.filter((promise) => {
      if (options.status && promise.status !== options.status) return false;
      switch (options.view ?? "all") {
        case "open":
          return promise.status === "open";
        case "long_unadvanced":
          return promise.warningCodes.includes("promise.long_unadvanced");
        case "overloaded":
          return overloaded && promise.status === "open";
        default:
          return true;
      }
    });
    return { promises: filtered, health };
  }

  private insertEvent(event: ReaderPromiseEvent): void {
    this.database.raw
      .prepare(
        `INSERT OR IGNORE INTO reader_promise_events(
          id, project_id, promise_id, action, chapter_id, chapter_index,
          note, source, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        event.id,
        event.projectId,
        event.promiseId,
        event.action,
        event.chapterId,
        event.chapterIndex,
        event.note,
        event.source,
        event.createdAt,
      );
  }
}

interface ReaderPromiseRow {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: ReaderPromiseStatus;
  opened_chapter_id: string | null;
  opened_chapter_index: number;
  target_chapter_id: string | null;
  paid_off_chapter_id: string | null;
  last_advanced_chapter_id: string | null;
  last_advanced_chapter_index: number | null;
  advance_count: number;
  version: number;
  created_at: string;
  updated_at: string;
}

interface ReaderPromiseEventRow {
  id: string;
  project_id: string;
  promise_id: string;
  action: ReaderPromiseAction;
  chapter_id: string | null;
  chapter_index: number;
  note: string | null;
  source: ReaderPromiseEvent["source"];
  created_at: string;
}

function mapReaderPromise(row: ReaderPromiseRow): ReaderPromise {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    description: row.description,
    status: row.status,
    openedChapterId: row.opened_chapter_id,
    openedChapterIndex: row.opened_chapter_index,
    targetChapterId: row.target_chapter_id,
    paidOffChapterId: row.paid_off_chapter_id,
    lastAdvancedChapterId: row.last_advanced_chapter_id,
    lastAdvancedChapterIndex: row.last_advanced_chapter_index,
    advanceCount: row.advance_count,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapReaderPromiseEvent(row: ReaderPromiseEventRow): ReaderPromiseEvent {
  return {
    id: row.id,
    projectId: row.project_id,
    promiseId: row.promise_id,
    action: row.action,
    chapterId: row.chapter_id,
    chapterIndex: row.chapter_index,
    note: row.note,
    source: row.source,
    createdAt: row.created_at,
  };
}
