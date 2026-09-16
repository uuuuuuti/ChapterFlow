import { randomUUID } from "node:crypto";

import { bumpProjectVersion, openState, row, rows } from "./state.mjs";
import { statePath } from "./project.mjs";

export function upsertEntity(root, input) {
  const id = String(input.id ?? randomUUID());
  const name = String(input.name ?? "").trim();
  const type = String(input.type ?? "character").trim();
  if (!name) throw new Error("Entity name is required");
  const now = new Date().toISOString();
  const db = openState(statePath(root));
  db.prepare(`INSERT INTO entities(id, type, name, summary, status, attrs_json, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET type=excluded.type, name=excluded.name, summary=excluded.summary,
                status=excluded.status, attrs_json=excluded.attrs_json, updated_at=excluded.updated_at`).run(
    id,
    type,
    name,
    input.summary ?? null,
    input.status ?? "active",
    JSON.stringify(input.attrs ?? {}),
    now,
  );
  bumpProjectVersion(db);
  const value = deserializeEntity(row(db, "SELECT * FROM entities WHERE id = ?", id));
  db.close();
  return value;
}

export function listEntities(root, type = null) {
  const db = openState(statePath(root));
  const values = type
    ? rows(db, "SELECT * FROM entities WHERE type = ? ORDER BY name", type)
    : rows(db, "SELECT * FROM entities ORDER BY type, name");
  db.close();
  return values.map(deserializeEntity);
}

export function upsertRelationship(root, input) {
  const sourceId = String(input.sourceId ?? "");
  const targetId = String(input.targetId ?? "");
  if (!sourceId || !targetId || sourceId === targetId) throw new Error("Relationship requires two different entity ids");
  const relationType = String(input.relationType ?? "related").trim();
  const label = String(input.label ?? relationType).trim();
  const now = new Date().toISOString();
  const db = openState(statePath(root));
  if (!row(db, "SELECT id FROM entities WHERE id = ?", sourceId) || !row(db, "SELECT id FROM entities WHERE id = ?", targetId)) {
    db.close();
    throw new Error("Relationship entities must exist first");
  }
  const id = String(input.id ?? randomUUID());
  db.prepare(`INSERT INTO relationships(id, source_id, target_id, relation_type, label, status, from_chapter, to_chapter, notes, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET source_id=excluded.source_id, target_id=excluded.target_id,
                relation_type=excluded.relation_type, label=excluded.label, status=excluded.status,
                from_chapter=excluded.from_chapter, to_chapter=excluded.to_chapter, notes=excluded.notes, updated_at=excluded.updated_at`).run(
    id, sourceId, targetId, relationType, label, input.status ?? "active",
    nullableChapter(input.fromChapter), nullableChapter(input.toChapter), input.notes ?? null, now,
  );
  bumpProjectVersion(db);
  const value = deserializeRelationship(row(db, "SELECT * FROM relationships WHERE id = ?", id));
  db.close();
  return value;
}

export function listRelationships(root, chapter = null) {
  const db = openState(statePath(root));
  let values = rows(db, "SELECT * FROM relationships ORDER BY updated_at, id");
  if (chapter !== null && chapter !== undefined) {
    const index = Number(chapter);
    values = values.filter((item) =>
      (item.from_chapter === null || Number(item.from_chapter) <= index) &&
      (item.to_chapter === null || Number(item.to_chapter) >= index),
    );
  }
  db.close();
  return values.map(deserializeRelationship);
}

export function upsertTimelineEvent(root, input) {
  const title = String(input.title ?? "").trim();
  if (!title) throw new Error("Timeline event title is required");
  const id = String(input.id ?? randomUUID());
  const now = new Date().toISOString();
  const db = openState(statePath(root));
  db.prepare(`INSERT INTO timeline_events(id, title, story_time, chapter_index, summary, character_ids_json, attrs_json, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET title=excluded.title, story_time=excluded.story_time,
                chapter_index=excluded.chapter_index, summary=excluded.summary,
                character_ids_json=excluded.character_ids_json, attrs_json=excluded.attrs_json, updated_at=excluded.updated_at`).run(
    id, title, input.storyTime ?? null, nullableChapter(input.chapterIndex), input.summary ?? null,
    JSON.stringify(input.characterIds ?? []), JSON.stringify(input.attrs ?? {}), now,
  );
  bumpProjectVersion(db);
  const value = deserializeTimeline(row(db, "SELECT * FROM timeline_events WHERE id = ?", id));
  db.close();
  return value;
}

export function listTimeline(root) {
  const db = openState(statePath(root));
  const values = rows(db, "SELECT * FROM timeline_events ORDER BY COALESCE(story_time, ''), COALESCE(chapter_index, 0), updated_at");
  db.close();
  return values.map(deserializeTimeline);
}

export function upsertForeshadow(root, input) {
  const title = String(input.title ?? "").trim();
  if (!title) throw new Error("Foreshadow title is required");
  const id = String(input.id ?? randomUUID());
  const now = new Date().toISOString();
  const db = openState(statePath(root));
  db.prepare(`INSERT INTO foreshadows(id, title, status, introduced_chapter, target_chapter, resolved_chapter, notes, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET title=excluded.title, status=excluded.status,
                introduced_chapter=excluded.introduced_chapter, target_chapter=excluded.target_chapter,
                resolved_chapter=excluded.resolved_chapter, notes=excluded.notes, updated_at=excluded.updated_at`).run(
    id, title, input.status ?? "open", nullableChapter(input.introducedChapter), nullableChapter(input.targetChapter),
    nullableChapter(input.resolvedChapter), input.notes ?? null, now,
  );
  bumpProjectVersion(db);
  const value = deserializeForeshadow(row(db, "SELECT * FROM foreshadows WHERE id = ?", id));
  db.close();
  return value;
}

export function listForeshadows(root) {
  const db = openState(statePath(root));
  const values = rows(db, "SELECT * FROM foreshadows ORDER BY COALESCE(introduced_chapter, 999999), updated_at");
  db.close();
  return values.map(deserializeForeshadow);
}

export function openReaderPromise(root, input) {
  const title = String(input.title ?? "").trim();
  const chapter = requiredChapter(input.chapterIndex);
  if (!title) throw new Error("Reader promise title is required");
  const id = String(input.id ?? randomUUID());
  const now = new Date().toISOString();
  const db = openState(statePath(root));
  db.prepare(`INSERT INTO reader_promises(id, title, description, status, opened_chapter, last_advanced_chapter, target_chapter, paid_off_chapter, advance_count, updated_at)
              VALUES (?, ?, ?, 'open', ?, NULL, ?, NULL, 0, ?)`).run(
    id, title, input.description ?? null, chapter, nullableChapter(input.targetChapter), now,
  );
  db.prepare(`INSERT INTO reader_promise_events(id, promise_id, action, chapter_index, note, created_at)
              VALUES (?, ?, 'OPEN', ?, ?, ?)`).run(randomUUID(), id, chapter, input.note ?? null, now);
  bumpProjectVersion(db);
  const value = getReaderPromiseWithEvents(db, id);
  db.close();
  return value;
}

export function transitionReaderPromise(root, input) {
  const id = String(input.promiseId ?? "");
  const action = String(input.action ?? "").toUpperCase();
  if (!['ADVANCE', 'PAYOFF'].includes(action)) throw new Error("Reader promise action must be ADVANCE or PAYOFF");
  const chapter = requiredChapter(input.chapterIndex);
  const now = new Date().toISOString();
  const db = openState(statePath(root));
  const current = row(db, "SELECT * FROM reader_promises WHERE id = ?", id);
  if (!current) {
    db.close();
    throw new Error(`Reader promise not found: ${id}`);
  }
  if (current.status !== "open") {
    db.close();
    throw new Error(`Reader promise ${id} is ${current.status}`);
  }
  if (action === "ADVANCE") {
    db.prepare(`UPDATE reader_promises SET last_advanced_chapter = ?, advance_count = advance_count + 1, updated_at = ? WHERE id = ?`).run(chapter, now, id);
  } else {
    db.prepare(`UPDATE reader_promises SET status = 'paid_off', paid_off_chapter = ?, last_advanced_chapter = ?, updated_at = ? WHERE id = ?`).run(chapter, chapter, now, id);
  }
  db.prepare(`INSERT INTO reader_promise_events(id, promise_id, action, chapter_index, note, created_at)
              VALUES (?, ?, ?, ?, ?, ?)`).run(randomUUID(), id, action, chapter, input.note ?? null, now);
  bumpProjectVersion(db);
  const value = getReaderPromiseWithEvents(db, id);
  db.close();
  return value;
}

export function listReaderPromises(root, status = null) {
  const db = openState(statePath(root));
  const values = status
    ? rows(db, "SELECT id FROM reader_promises WHERE status = ? ORDER BY opened_chapter", status)
    : rows(db, "SELECT id FROM reader_promises ORDER BY opened_chapter");
  const result = values.map((item) => getReaderPromiseWithEvents(db, item.id));
  db.close();
  return result;
}

export function readerPromiseHealth(root, currentChapter = null) {
  const promises = listReaderPromises(root, "open");
  const current = currentChapter === null ? Math.max(0, ...promises.map((item) => item.events.at(-1)?.chapterIndex ?? item.openedChapter)) : Number(currentChapter);
  const enriched = promises.map((promise) => {
    const last = promise.lastAdvancedChapter ?? promise.openedChapter;
    const idleChapters = Math.max(0, current - last);
    return { ...promise, idleChapters, warnings: idleChapters >= 10 ? ["long_unadvanced"] : [] };
  });
  return {
    currentChapter: current,
    openCount: enriched.length,
    longUnadvancedCount: enriched.filter((item) => item.warnings.includes("long_unadvanced")).length,
    overloaded: enriched.length >= 8,
    promises: enriched,
  };
}

function getReaderPromiseWithEvents(db, id) {
  const value = row(db, "SELECT * FROM reader_promises WHERE id = ?", id);
  if (!value) return null;
  const events = rows(db, "SELECT * FROM reader_promise_events WHERE promise_id = ? ORDER BY chapter_index, created_at", id);
  return {
    id: value.id,
    title: value.title,
    description: value.description,
    status: value.status,
    openedChapter: Number(value.opened_chapter),
    lastAdvancedChapter: value.last_advanced_chapter === null ? null : Number(value.last_advanced_chapter),
    targetChapter: value.target_chapter === null ? null : Number(value.target_chapter),
    paidOffChapter: value.paid_off_chapter === null ? null : Number(value.paid_off_chapter),
    advanceCount: Number(value.advance_count),
    updatedAt: value.updated_at,
    events: events.map((event) => ({ id: event.id, action: event.action, chapterIndex: Number(event.chapter_index), note: event.note, createdAt: event.created_at })),
  };
}

function deserializeEntity(value) {
  return value && { id: value.id, type: value.type, name: value.name, summary: value.summary, status: value.status, attrs: JSON.parse(value.attrs_json), updatedAt: value.updated_at };
}
function deserializeRelationship(value) {
  return value && { id: value.id, sourceId: value.source_id, targetId: value.target_id, relationType: value.relation_type, label: value.label, status: value.status, fromChapter: value.from_chapter === null ? null : Number(value.from_chapter), toChapter: value.to_chapter === null ? null : Number(value.to_chapter), notes: value.notes, updatedAt: value.updated_at };
}
function deserializeTimeline(value) {
  return value && { id: value.id, title: value.title, storyTime: value.story_time, chapterIndex: value.chapter_index === null ? null : Number(value.chapter_index), summary: value.summary, characterIds: JSON.parse(value.character_ids_json), attrs: JSON.parse(value.attrs_json), updatedAt: value.updated_at };
}
function deserializeForeshadow(value) {
  return value && { id: value.id, title: value.title, status: value.status, introducedChapter: value.introduced_chapter === null ? null : Number(value.introduced_chapter), targetChapter: value.target_chapter === null ? null : Number(value.target_chapter), resolvedChapter: value.resolved_chapter === null ? null : Number(value.resolved_chapter), notes: value.notes, updatedAt: value.updated_at };
}
function nullableChapter(value) {
  if (value === null || value === undefined || value === "") return null;
  return requiredChapter(value);
}
function requiredChapter(value) {
  const chapter = Number(value);
  if (!Number.isInteger(chapter) || chapter < 1) throw new Error("Chapter index must be a positive integer");
  return chapter;
}
