import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { basename, join, relative, resolve } from "node:path";

import { bumpProjectVersion, getProjectVersion, openState, rows } from "./state.mjs";

const CONFIG_NAME = "chapterflow.json";

export function resolveProjectRoot(root = process.cwd()) {
  return resolve(root);
}

export function statePath(root) {
  return join(resolveProjectRoot(root), ".chapterflow", "state.sqlite");
}

export function configPath(root) {
  return join(resolveProjectRoot(root), CONFIG_NAME);
}

export function initProject(root, input = {}) {
  const projectRoot = resolveProjectRoot(root);
  mkdirSync(projectRoot, { recursive: true });
  for (const dir of ["manuscript", "outline", "characters", "world", "notes", "outputs", ".chapterflow"]) {
    mkdirSync(join(projectRoot, dir), { recursive: true });
  }
  if (!existsSync(configPath(projectRoot))) {
    const now = new Date().toISOString();
    writeJson(configPath(projectRoot), {
      schemaVersion: 1,
      id: input.id ?? randomUUID(),
      title: input.title?.trim() || "未命名作品",
      premise: input.premise?.trim() || "",
      language: input.language ?? "zh-CN",
      platform: input.platform ?? "fanqie",
      createdAt: now,
      updatedAt: now,
      bookProfile: {
        genre: input.genre ?? null,
        audience: input.audience ?? null,
        promise: input.promise ?? null,
        tone: null,
        pov: null,
        targetWordsPerChapter: input.targetWordsPerChapter ?? 2500,
        boundaries: [],
      },
      positioning: null,
      storyEngine: null,
      packaging: null,
      openingBlueprint: null,
    });
  }
  const db = openState(statePath(projectRoot));
  db.close();
  syncProject(projectRoot);
  return projectSummary(projectRoot);
}

export function readConfig(root) {
  const path = configPath(root);
  if (!existsSync(path)) {
    throw new Error(`Not a ChapterFlow project: ${resolveProjectRoot(root)}`);
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

export function writeConfig(root, updater) {
  const current = readConfig(root);
  const next = typeof updater === "function" ? updater(structuredClone(current)) : updater;
  next.updatedAt = new Date().toISOString();
  writeJson(configPath(root), next);
  const db = openState(statePath(root));
  bumpProjectVersion(db);
  db.close();
  return next;
}

export function syncProject(root) {
  const projectRoot = resolveProjectRoot(root);
  readConfig(projectRoot);
  const manuscriptDir = join(projectRoot, "manuscript");
  mkdirSync(manuscriptDir, { recursive: true });
  const files = readdirSync(manuscriptDir)
    .filter((name) => /^\d+.*\.md$/iu.test(name))
    .sort((a, b) => a.localeCompare(b, "zh-CN", { numeric: true }));
  const db = openState(statePath(projectRoot));
  let changed = false;
  const seen = new Set();
  for (const filename of files) {
    const path = join(manuscriptDir, filename);
    const content = readFileSync(path, "utf8");
    const parsed = parseChapter(filename, content);
    if (!parsed) continue;
    seen.add(parsed.index);
    const sha256 = digest(content);
    const existing = db.prepare("SELECT * FROM chapters WHERE chapter_index = ?").get(parsed.index);
    if (!existing) {
      db.prepare(`INSERT INTO chapters(id, chapter_index, title, path, sha256, version, updated_at)
                  VALUES (?, ?, ?, ?, ?, 1, ?)`).run(
        randomUUID(), parsed.index, parsed.title, relative(projectRoot, path), sha256, new Date().toISOString(),
      );
      changed = true;
    } else if (existing.sha256 !== sha256 || existing.title !== parsed.title || existing.path !== relative(projectRoot, path)) {
      db.prepare(`UPDATE chapters SET title = ?, path = ?, sha256 = ?, version = version + 1, updated_at = ? WHERE chapter_index = ?`).run(
        parsed.title, relative(projectRoot, path), sha256, new Date().toISOString(), parsed.index,
      );
      changed = true;
    }
  }
  for (const chapter of rows(db, "SELECT chapter_index FROM chapters")) {
    if (!seen.has(Number(chapter.chapter_index))) {
      db.prepare("DELETE FROM chapters WHERE chapter_index = ?").run(chapter.chapter_index);
      changed = true;
    }
  }
  if (changed) bumpProjectVersion(db);
  const version = getProjectVersion(db);
  db.close();
  return { changed, version, chapters: files.length };
}

export function listChapters(root) {
  syncProject(root);
  const db = openState(statePath(root));
  const result = rows(db, "SELECT * FROM chapters ORDER BY chapter_index");
  db.close();
  return result;
}

export function readChapter(root, chapterIndex) {
  const chapter = listChapters(root).find((item) => Number(item.chapter_index) === Number(chapterIndex));
  if (!chapter) return null;
  const absolutePath = join(resolveProjectRoot(root), chapter.path);
  return { ...chapter, content: readFileSync(absolutePath, "utf8") };
}

export function writeChapter(root, input) {
  const projectRoot = resolveProjectRoot(root);
  const index = Number(input.index);
  if (!Number.isInteger(index) || index < 1) throw new Error("Chapter index must be a positive integer");
  const title = String(input.title ?? `第${index}章`).trim() || `第${index}章`;
  const body = String(input.content ?? "").trim();
  const filename = `${String(index).padStart(3, "0")}-${safeFilename(title)}.md`;
  const target = join(projectRoot, "manuscript", filename);
  const existing = listChapters(projectRoot).find((item) => Number(item.chapter_index) === index);
  if (existing && existing.path !== relative(projectRoot, target)) {
    const old = join(projectRoot, existing.path);
    if (existsSync(old)) {
      const oldContent = readFileSync(old, "utf8");
      if (oldContent.trim() !== `# ${title}\n\n${body}`.trim()) {
        throw new Error(`Chapter ${index} already exists at ${existing.path}; update through a candidate or rename explicitly.`);
      }
    }
  }
  writeFileSync(target, `# ${title}\n\n${body}\n`, "utf8");
  syncProject(projectRoot);
  return readChapter(projectRoot, index);
}

export function projectSummary(root) {
  const projectRoot = resolveProjectRoot(root);
  const config = readConfig(projectRoot);
  const chapters = listChapters(projectRoot);
  const db = openState(statePath(projectRoot));
  const projectVersion = getProjectVersion(db);
  const promises = Number(db.prepare("SELECT COUNT(*) AS count FROM reader_promises WHERE status = 'open'").get()?.count ?? 0);
  const unresolvedForeshadows = Number(db.prepare("SELECT COUNT(*) AS count FROM foreshadows WHERE status != 'resolved'").get()?.count ?? 0);
  db.close();
  return {
    root: projectRoot,
    id: config.id,
    title: config.title,
    premise: config.premise,
    platform: config.platform,
    projectVersion,
    chapterCount: chapters.length,
    latestChapter: chapters.at(-1) ?? null,
    openReaderPromises: promises,
    unresolvedForeshadows,
    configured: {
      positioning: Boolean(config.positioning),
      storyEngine: Boolean(config.storyEngine),
      packaging: Boolean(config.packaging),
      openingBlueprint: Boolean(config.openingBlueprint),
    },
  };
}

function parseChapter(filename, content) {
  const match = filename.match(/^(\d+)/u);
  if (!match) return null;
  const index = Number(match[1]);
  const heading = content.match(/^#\s+(.+)$/mu)?.[1]?.trim();
  const fallback = basename(filename, ".md").replace(/^\d+[-_.\s]*/u, "").trim();
  return { index, title: heading || fallback || `第${index}章` };
}

function safeFilename(value) {
  const cleaned = value.replace(/[\\/:*?"<>|]/gu, "-").replace(/\s+/gu, "-").replace(/-+/gu, "-").replace(/^-|-$/gu, "");
  return cleaned.slice(0, 60) || "chapter";
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
