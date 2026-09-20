import { listChapters, readConfig, readChapter } from "./project.mjs";
import {
  listEntities,
  listRelationships,
  listTimeline,
  listForeshadows,
  listReaderPromises,
} from "./story.mjs";
import { analyzeChapter } from "./review.mjs";

export const VIEW_TYPES = [
  "workspace",
  "character_graph",
  "timeline",
  "promise_board",
  "foreshadow_map",
  "story_map",
  "chapter_health",
];

export function buildViewSpec(root, type, options = {}) {
  if (!VIEW_TYPES.includes(type))
    throw new Error(`Unsupported view type: ${type}`);
  if (
    options.chapterIndex !== undefined &&
    (!Number.isInteger(options.chapterIndex) || options.chapterIndex < 1)
  )
    throw new Error("chapterIndex must be a positive integer");
  if (type === "workspace")
    return {
      type,
      title: `${readConfig(root).title} · 创作梳理`,
      generatedAt: new Date().toISOString(),
      views: VIEW_TYPES.filter((value) => value !== "workspace").map((value) =>
        buildViewSpec(root, value, options),
      ),
    };
  switch (type) {
    case "character_graph":
      return characterGraph(root, options);
    case "timeline":
      return timeline(root, options);
    case "promise_board":
      return promiseBoard(root);
    case "foreshadow_map":
      return foreshadowMap(root);
    case "story_map":
      return storyMap(root);
    case "chapter_health":
      return chapterHealth(root, options);
    default:
      throw new Error(`Unsupported view type: ${type}`);
  }
}

function characterGraph(root, options) {
  const entities = listEntities(root).filter(
    (entity) => entity.status !== "archived",
  );
  const relationships = listRelationships(
    root,
    options.chapterIndex ?? null,
  ).filter((relation) => relation.status === "active");
  return {
    type: "character_graph",
    title: options.chapterIndex
      ? `人物关系 · 第 ${options.chapterIndex} 章`
      : "当前人物关系",
    nodes: entities.map((entity) => ({
      id: entity.id,
      label: entity.name,
      group: entity.type,
      summary: entity.summary,
      attrs: entity.attrs,
    })),
    edges: relationships
      .filter(
        (relation) =>
          entities.some((e) => e.id === relation.sourceId) &&
          entities.some((e) => e.id === relation.targetId),
      )
      .map((relation) => ({
        id: relation.id,
        source: relation.sourceId,
        target: relation.targetId,
        label: relation.label,
        relationType: relation.relationType,
        notes: relation.notes,
        fromChapter: relation.fromChapter,
        toChapter: relation.toChapter,
      })),
    filters: { chapterIndex: options.chapterIndex ?? null },
  };
}

function timeline(root, options) {
  const names = new Map(
    listEntities(root).map((entity) => [entity.id, entity.name]),
  );
  return {
    type: "timeline",
    title: "故事时间线",
    events: listTimeline(root)
      .filter(
        (event) =>
          !options.chapterIndex || event.chapterIndex === options.chapterIndex,
      )
      .map((event) => ({
        id: event.id,
        title: event.title,
        storyTime: event.storyTime,
        chapterIndex: event.chapterIndex,
        summary: event.summary,
        characterIds: event.characterIds,
        characterNames: event.characterIds.map(
          (id) => names.get(id) ?? `未找到人物：${id}`,
        ),
        attrs: event.attrs,
      })),
  };
}

function promiseBoard(root) {
  const latest = Number(listChapters(root).at(-1)?.chapter_index ?? 0);
  return {
    type: "promise_board",
    title: "读者期待",
    promises: listReaderPromises(root).map((promise) => ({
      id: promise.id,
      title: promise.title,
      description: promise.description,
      status: promise.status,
      targetChapter: promise.targetChapter,
      overdue:
        promise.status === "open" &&
        promise.targetChapter !== null &&
        promise.targetChapter < latest,
      idleChapters: Math.max(
        0,
        latest - (promise.lastAdvancedChapter ?? promise.openedChapter),
      ),
      events: promise.events,
    })),
  };
}

function foreshadowMap(root) {
  const latest = Number(listChapters(root).at(-1)?.chapter_index ?? 0);
  return {
    type: "foreshadow_map",
    title: "伏笔地图",
    foreshadows: listForeshadows(root).map((item) => ({
      ...item,
      overdue:
        item.status === "open" &&
        item.targetChapter !== null &&
        item.targetChapter < latest,
    })),
  };
}

function storyMap(root) {
  const config = readConfig(root);
  const chapters = listChapters(root);
  const planned = [
    ...new Map(
      [
        ...(config.openingBlueprint?.firstThreeChapters ?? []),
        ...(config.openingBlueprint?.firstArcChapters ?? []),
        ...(config.storyPlan?.chapters ?? []),
      ].map((chapter) => [Number(chapter.index), chapter]),
    ).values(),
  ];
  const all = [
    ...new Map(
      [
        ...chapters.map((chapter) => ({
          index: Number(chapter.chapter_index),
          title: chapter.title,
        })),
        ...planned,
      ].map((chapter) => [Number(chapter.index), chapter]),
    ).values(),
  ].sort((a, b) => a.index - b.index);
  return {
    type: "story_map",
    title: "剧情地图",
    arcs: config.storyPlan?.arcs ?? [],
    arc: config.openingBlueprint
      ? {
          title: config.openingBlueprint.firstArcTitle ?? "第一阶段",
          goal: config.openingBlueprint.firstArcGoal ?? null,
          conflict: config.openingBlueprint.firstArcConflict ?? null,
          payoff: config.openingBlueprint.firstArcPayoff ?? null,
        }
      : null,
    chapters: all.map((chapter) => ({
      ...chapter,
      index: chapter.index,
      title: chapter.title,
      purpose: chapter.purpose,
      conflict: chapter.conflict,
      readerExpectation: chapter.readerExpectation,
      emotionTarget: chapter.emotionTarget,
      hook: chapter.hook,
      payoff: chapter.payoff,
      written: chapters.some(
        (item) => Number(item.chapter_index) === Number(chapter.index),
      ),
    })),
  };
}

function chapterHealth(root, options) {
  const chapters = listChapters(root).filter(
    (chapter) =>
      !options.chapterIndex ||
      Number(chapter.chapter_index) === options.chapterIndex,
  );
  return {
    type: "chapter_health",
    title: "章节体检",
    chapters: chapters
      .map((item) =>
        analyzeChapter(
          readChapter(root, item.chapter_index)?.content ?? "",
          Number(item.chapter_index),
          item.title,
        ),
      )
      .map((chapter) => ({
        index: chapter.chapterIndex,
        title: chapter.title,
        metrics: chapter.metrics,
        risks: chapter.signals.filter((signal) => signal.risk),
      })),
    note: "这些是辅助回看的文本信号，不是文学质量评分或平台签约预测。",
  };
}
