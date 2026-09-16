import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export function openState(dbPath) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
  migrateState(db);
  return db;
}

export function migrateState(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chapters (
      id TEXT PRIMARY KEY,
      chapter_index INTEGER NOT NULL UNIQUE,
      title TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      sha256 TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS candidates (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('candidate','accepted','rejected')),
      payload_json TEXT NOT NULL,
      provenance_json TEXT NOT NULL,
      base_version INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      decided_at TEXT
    );
    CREATE TABLE IF NOT EXISTS entities (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      summary TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      attrs_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS relationships (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      relation_type TEXT NOT NULL,
      label TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      from_chapter INTEGER,
      to_chapter INTEGER,
      notes TEXT,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(source_id) REFERENCES entities(id) ON DELETE CASCADE,
      FOREIGN KEY(target_id) REFERENCES entities(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS timeline_events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      story_time TEXT,
      chapter_index INTEGER,
      summary TEXT,
      character_ids_json TEXT NOT NULL DEFAULT '[]',
      attrs_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS foreshadows (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      introduced_chapter INTEGER,
      target_chapter INTEGER,
      resolved_chapter INTEGER,
      notes TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS reader_promises (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      opened_chapter INTEGER NOT NULL,
      last_advanced_chapter INTEGER,
      target_chapter INTEGER,
      paid_off_chapter INTEGER,
      advance_count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS reader_promise_events (
      id TEXT PRIMARY KEY,
      promise_id TEXT NOT NULL,
      action TEXT NOT NULL CHECK(action IN ('OPEN','ADVANCE','PAYOFF')),
      chapter_index INTEGER NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(promise_id) REFERENCES reader_promises(id) ON DELETE CASCADE
    );
  `);
  ensureMeta(db, "project_version", "0");
  ensureMeta(db, "schema_version", "1");
}

function ensureMeta(db, key, value) {
  db.prepare("INSERT OR IGNORE INTO meta(key, value) VALUES (?, ?)").run(key, value);
}

export function getProjectVersion(db) {
  return Number(db.prepare("SELECT value FROM meta WHERE key = 'project_version'").get()?.value ?? 0);
}

export function bumpProjectVersion(db) {
  const next = getProjectVersion(db) + 1;
  db.prepare("UPDATE meta SET value = ? WHERE key = 'project_version'").run(String(next));
  return next;
}

export function rows(db, sql, ...params) {
  return db.prepare(sql).all(...params).map((row) => ({ ...row }));
}

export function row(db, sql, ...params) {
  const value = db.prepare(sql).get(...params);
  return value ? { ...value } : null;
}
