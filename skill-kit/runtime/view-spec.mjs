import { listChapters, readConfig } from "./project.mjs";
import {
  listEntities,
  listRelationships,
  listTimeline,
  listForeshadows,
  listReaderPromises,
} from "./story.mjs";
import { reviewOpening } from "./review.mjs";

export const VIEW_TYPES = [
  "character_graph",
  "timeline",
  "promise_board",
  "foreshadow_map",
  "story_map",
  "chapter_health",
];

export function buildViewSpec(root, type, options = {}) {
  if (!VIEW_TYPES.includes(type)) throw new Error(`Unsupported view type: ${type}`);
  switch (type) {
    case "character_graph":
      return characterGraph(root, options);
    case "timeline":
      return timeline(root);
    case "promise_board":
      return promiseBoard(root);
    case "foreshadow_map":
      return foreshadowMap(root);
    case "story_map":
      return storyMap(root);
    case "chapter_health":
      return chapterHealth(root);
    default:
      throw new Error(`Unsupported view type: ${type}`);
  }
}

function characterGraph(root, options) {
  const entities = listEntities(root).filter((entity) => entity.status !== "archived");
  const relationships = listRelationships(root, options.chapterIndex ?? null).filter((relation) => relation.status === "active");
  return {
    type: "character_graph",
    title: options.chapterIndex ? `人物关系 · 第 ${options.chapterIndex} 章` : "当前人物关系",
    nodes: entities.map((entity) => ({ id: entity.id, label: entity.name, group: entity.type, summary: entity.summary, attrs: entity.attrs })),
    edges: relationships.map((relation) => ({ id: relation.id, source: relation.sourceId, target: relation.targetId, label: relation.label, relationType: relation.relationType, notes: relation.notes })),
    filters: { chapterIndex: options.chapterIndex ?? null },
  };
}

function timeline(root) {
  return {
    type: "timeline",
    title: "故事时间线",
    events: listTimeline(root).map((event) => ({
      id: event.id,
      title: event.title,
      storyTime: event.storyTime,
      chapterIndex: event.chapterIndex,
      summary: event.summary,
      characterIds: event.characterIds,
      attrs: event.attrs,
    })),
  };
}

function promiseBoard(root) {
  return {
    type: "promise_board",
    title: "读者期待",
    promises: listReaderPromises(root).map((promise) => ({
      id: promise.id,
      title: promise.title,
      description: promise.description,
      status: promise.status,
      targetChapter: promise.targetChapter,
      events: promise.events,
    })),
  };
}

function foreshadowMap(root) {
  return {
    type: "foreshadow_map",
    title: "伏笔地图",
    foreshadows: listForeshadows(root),
  };
}

function storyMap(root) {
  const config = readConfig(root);
  const chapters = listChapters(root);
  const planned = config.openingBlueprint?.firstArcChapters ?? config.openingBlueprint?.firstThreeChapters ?? [];
  return {
    type: "story_map",
    title: "剧情地图",
    arc: config.openingBlueprint
      ? {
          title: config.openingBlueprint.firstArcTitle ?? "第一阶段",
          goal: config.openingBlueprint.firstArcGoal ?? null,
          conflict: config.openingBlueprint.firstArcConflict ?? null,
          payoff: config.openingBlueprint.firstArcPayoff ?? null,
        }
      : null,
    chapters: planned.length
      ? planned.map((chapter) => ({
          index: chapter.index,
          title: chapter.title,
          purpose: chapter.purpose,
          conflict: chapter.conflict,
          readerExpectation: chapter.readerExpectation,
          emotionTarget: chapter.emotionTarget,
          hook: chapter.hook,
          payoff: chapter.payoff,
          written: chapters.some((item) => Number(item.chapter_index) === Number(chapter.index)),
        }))
      : chapters.map((chapter) => ({ index: Number(chapter.chapter_index), title: chapter.title, written: true })),
  };
}

function chapterHealth(root) {
  const report = reviewOpening(root, { chapterCount: 3 });
  return {
    type: "chapter_health",
    title: "开篇体检",
    chapters: report.chapters.map((chapter) => ({
      index: chapter.chapterIndex,
      title: chapter.title,
      metrics: chapter.metrics,
      risks: chapter.signals.filter((signal) => signal.risk),
    })),
    note: report.note,
  };
}
