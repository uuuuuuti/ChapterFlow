import { readConfig, listChapters, readChapter } from "./project.mjs";
import {
  listEntities,
  listRelationships,
  listTimeline,
  listForeshadows,
  listReaderPromises,
  readerPromiseHealth,
} from "./story.mjs";
import { retrieveKnowledge } from "./knowledge.mjs";

export function buildContext(root, options = {}) {
  const config = readConfig(root);
  const chapters = listChapters(root);
  const latestIndex = chapters.at(-1)?.chapter_index ?? 0;
  const currentChapter = Number(options.chapterIndex ?? latestIndex + 1);
  const recentCount = clamp(Number(options.recentChapters ?? 3), 0, 8);
  const recent = chapters.slice(Math.max(0, chapters.length - recentCount)).map((chapter) => {
    const full = readChapter(root, chapter.chapter_index);
    return {
      index: Number(chapter.chapter_index),
      title: chapter.title,
      version: Number(chapter.version),
      excerpt: excerpt(full?.content ?? "", Number(options.maxChapterChars ?? 12000)),
    };
  });
  const stage = options.stage ?? inferStage(config, currentChapter);
  const knowledge = retrieveKnowledge({
    stage,
    genre: config.bookProfile?.genre ?? null,
    query: options.knowledgeQuery ?? null,
    limit: options.knowledgeLimit ?? 8,
  });
  return {
    contractVersion: "chapterflow-context/0.1",
    task: options.task ?? "general",
    stage,
    project: {
      id: config.id,
      title: config.title,
      premise: config.premise,
      language: config.language,
      platform: config.platform,
    },
    bookProfile: config.bookProfile,
    positioning: config.positioning,
    storyEngine: config.storyEngine,
    packaging: config.packaging,
    openingBlueprint: config.openingBlueprint,
    currentChapter,
    storyState: {
      entities: listEntities(root),
      relationships: listRelationships(root, currentChapter),
      timeline: listTimeline(root),
      foreshadows: listForeshadows(root),
      readerPromises: listReaderPromises(root),
      readerPromiseHealth: readerPromiseHealth(root, Math.max(0, currentChapter - 1)),
    },
    recentManuscript: recent,
    officialKnowledge: knowledge.map((card) => ({
      id: card.id,
      title: card.title,
      principle: card.principle,
      signals: card.signals,
      antiPatterns: card.antiPatterns,
      suggestions: card.suggestions,
      severity: card.severity,
      sourceRefs: card.sourceRefs,
    })),
    hostAgentRules: [
      "Treat officialKnowledge as sourced guidance or rules only; never turn ChapterFlow inference into an official platform rule.",
      "Generate creative output in the host agent. Persist formal changes through candidates before acceptance.",
      "Do not silently change locked story facts, reader promises, relationships, or existing manuscript text.",
      "When current platform requirements are uncertain, say they are unconfirmed instead of inventing fixed thresholds.",
    ],
  };
}

export function buildTaskPacket(root, task, options = {}) {
  const context = buildContext(root, { ...options, task });
  return {
    ...context,
    outputContract: contractFor(task),
  };
}

function contractFor(task) {
  switch (task) {
    case "start-book":
      return {
        candidateKinds: ["book_positioning", "story_engine", "packaging", "opening_blueprint"],
        rule: "Return concrete, editable candidates. Never claim signing success or probability.",
      };
    case "plan-story":
      return {
        expected: ["chapterPurpose", "goal", "conflict", "readerExpectation", "emotion", "payoff", "hook", "promiseOperations"],
        rule: "Advance existing promises deliberately; do not open new promises without a reason.",
      };
    case "write-chapter":
      return {
        candidateKind: "chapter_draft",
        fields: ["index", "title", "content"],
        rule: "The host model writes prose; ChapterFlow stores the draft as a candidate before acceptance.",
      };
    case "novel-editor":
      return {
        expected: ["strengths", "issues", "locations", "impact", "suggestions", "sourceType", "sourceRefs"],
        rule: "Separate deterministic signals, official guidance, and editorial inference.",
      };
    case "signing-sprint":
      return {
        expected: ["blockers", "highRisk", "improvements", "observations", "officialStatus"],
        rule: "Assess preparation only. Never predict or guarantee platform approval.",
      };
    default:
      return { rule: "Use ChapterFlow state as authoritative story context and preserve author agency." };
  }
}

function inferStage(config, chapterIndex) {
  if (!config.positioning) return "positioning";
  if (!config.storyEngine) return "story_engine";
  if (!config.packaging) return "packaging";
  if (!config.openingBlueprint || chapterIndex <= 3) return "opening";
  return "writing";
}

function excerpt(value, limit) {
  const text = String(value ?? "");
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 80))}\n\n…[truncated by ChapterFlow context builder]`;
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}
