import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { listChapters, readChapter, readConfig } from "./project.mjs";

export function exportManuscript(root, options = {}) {
  const from = options.fromChapter ?? 1,
    to = options.toChapter ?? Number.MAX_SAFE_INTEGER;
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from)
    throw new Error("Invalid chapter range");
  const config = readConfig(root);
  const chapters = listChapters(root).filter(
    (item) => item.chapter_index >= from && item.chapter_index <= to,
  );
  if (!chapters.length)
    throw new Error("No accepted manuscript chapters in the requested range");
  const dir = join(resolve(root), "outputs", `manuscript-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "manuscript.md");
  const manifest = {
    title: config.title,
    exportedAt: new Date().toISOString(),
    chapters: chapters.map((c) => ({
      index: Number(c.chapter_index),
      title: c.title,
      version: Number(c.version),
      sha256: c.sha256,
      path: c.path,
    })),
  };
  writeFileSync(
    path,
    chapters
      .map((chapter) => readChapter(root, chapter.chapter_index).content.trim())
      .join("\n\n---\n\n") + "\n",
    "utf8",
  );
  const manifestPath = join(dir, "manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  return { path, manifestPath, chapterCount: chapters.length };
}
