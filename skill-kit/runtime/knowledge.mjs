import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const seedPath = join(here, "..", "knowledge", "fanqie", "seed.json");

let cache = null;

export function loadKnowledge() {
  if (!cache) cache = JSON.parse(readFileSync(seedPath, "utf8"));
  return structuredClone(cache);
}

export function retrieveKnowledge({ stage = null, genre = null, query = null, limit = 8 } = {}) {
  const knowledge = loadKnowledge();
  const sources = new Map(knowledge.sources.map((source) => [source.id, source]));
  const needle = String(query ?? "").trim().toLocaleLowerCase();
  const normalizedGenre = String(genre ?? "").trim().toLocaleLowerCase();
  return knowledge.cards
    .filter((card) => !stage || card.stage === stage)
    .map((card) => {
      const sourceRefs = card.sourceIds.map((id) => sources.get(id)).filter(Boolean);
      const text = [
        card.title,
        card.principle,
        ...card.signals,
        ...card.antiPatterns,
        ...card.suggestions,
        ...sourceRefs.map((source) => source.title),
      ].join(" ").toLocaleLowerCase();
      let score = 1;
      if (needle && text.includes(needle)) score += 10;
      if (normalizedGenre && text.includes(normalizedGenre)) score += 3;
      if (stage && card.stage === stage) score += 4;
      return {
        ...card,
        score,
        sourceRefs: sourceRefs.map((source) => ({
          id: source.id,
          title: source.title,
          url: source.url,
          authority: source.authority,
          publishedAt: source.publishedAt,
        })),
      };
    })
    .filter((card) => !needle || card.score > 1)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, "zh-CN"))
    .slice(0, Math.max(1, Math.min(20, Number(limit) || 8)));
}

export function knowledgeCoverage() {
  const knowledge = loadKnowledge();
  const stages = {};
  for (const card of knowledge.cards) {
    stages[card.stage] = (stages[card.stage] ?? 0) + 1;
  }
  const latest = knowledge.sources
    .map((source) => source.publishedAt)
    .filter(Boolean)
    .sort()
    .at(-1) ?? null;
  return {
    version: knowledge.version,
    platform: knowledge.platform,
    sourceCount: knowledge.sources.length,
    cardCount: knowledge.cards.length,
    stages,
    latestPublishedAt: latest,
    sources: knowledge.sources,
  };
}
