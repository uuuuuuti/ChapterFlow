import { createOutlineNode, createProject } from "@narralume/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { NodeNarrativeDatabase } from "../src/node.js";
import {
  SqliteProjectRepository,
  SqliteReaderPromiseRepository,
  SqliteStoryRepository,
  SqliteWebNovelRepository,
} from "../src/index.js";

const now = "2026-09-14T00:00:00.000Z";
let database: NodeNarrativeDatabase;

beforeEach(() => {
  database = new NodeNarrativeDatabase();
  database.migrate();
  new SqliteProjectRepository(database).insert(
    createProject({ id: "project-1", title: "潮汐灯塔", now }),
  );
  const story = new SqliteStoryRepository(database);
  const book = story.insertOutlineNode(
    createOutlineNode({
      id: "book-1",
      projectId: "project-1",
      parent: null,
      kind: "book",
      ordinal: 0,
      title: "潮汐灯塔",
      now,
    }),
  );
  for (const [id, ordinal] of [
    ["chapter-1", 0],
    ["chapter-2", 1],
    ["chapter-3", 2],
  ] as const) {
    story.insertOutlineNode(
      createOutlineNode({
        id,
        projectId: "project-1",
        parent: book,
        kind: "chapter",
        ordinal,
        title: id,
        now,
      }),
    );
  }
});

afterEach(() => database.close());

describe("SqliteReaderPromiseRepository", () => {
  it("persists operations, lifecycle events, idempotent replay, and warnings", () => {
    const repository = new SqliteReaderPromiseRepository(database);
    const [operation] = repository.applyChapterOperations({
      projectId: "project-1",
      chapterId: "chapter-1",
      operations: [
        {
          action: "OPEN",
          promiseId: null,
          title: "灯塔下的秘密",
          note: "读者等待秘密揭晓",
        },
      ],
      now,
    });
    expect(operation?.promiseId).toBe("chapter-1:promise:0");
    const promise = repository.require("project-1", operation!.promiseId!);
    expect(repository.listEvents("project-1", promise.id)).toHaveLength(1);

    repository.applyAction({
      projectId: "project-1",
      promiseId: promise.id,
      action: "ADVANCE",
      chapterId: "chapter-2",
      now,
    });
    repository.applyAction({
      projectId: "project-1",
      promiseId: promise.id,
      action: "ADVANCE",
      chapterId: "chapter-2",
      now,
    });
    expect(repository.listEvents("project-1", promise.id)).toHaveLength(2);

    const view = repository.listViews("project-1", {
      currentChapterIndex: 3,
    });
    expect(view.promises[0]).toMatchObject({
      status: "open",
      openForChapters: 3,
      advanceCount: 1,
    });
    expect(view.health).toMatchObject({
      openCount: 1,
      longUnadvancedCount: 0,
      overloaded: false,
    });
  });

  it("marks a promise long-unadvanced after the deterministic threshold", () => {
    const repository = new SqliteReaderPromiseRepository(database);
    repository.create({
      id: "old-promise",
      projectId: "project-1",
      title: "旧线索",
      openedChapterId: "chapter-1",
      now,
    });
    const view = repository.listViews("project-1", {
      currentChapterIndex: 7,
    });
    expect(view.promises[0]?.warningCodes).toContain("promise.long_unadvanced");
    expect(view.health.longUnadvancedCount).toBe(1);
    expect(
      repository.listViews("project-1", {
        status: "paid_off",
        currentChapterIndex: 7,
      }).health,
    ).toMatchObject({ openCount: 1, longUnadvancedCount: 1 });
  });

  it("uses outline order rather than UUID/path order for chapter age", () => {
    const projects = new SqliteProjectRepository(database);
    projects.insert(createProject({ id: "project-2", title: "顺序校验", now }));
    const story = new SqliteStoryRepository(database);
    const book = story.insertOutlineNode(
      createOutlineNode({
        id: "book-2",
        projectId: "project-2",
        parent: null,
        kind: "book",
        ordinal: 0,
        title: "顺序校验",
        now,
      }),
    );
    const first = story.insertOutlineNode(
      createOutlineNode({
        id: "z-chapter",
        projectId: "project-2",
        parent: book,
        kind: "chapter",
        ordinal: 0,
        title: "第一章",
        now,
      }),
    );
    const second = story.insertOutlineNode(
      createOutlineNode({
        id: "a-chapter",
        projectId: "project-2",
        parent: book,
        kind: "chapter",
        ordinal: 1,
        title: "第二章",
        now,
      }),
    );
    const repository = new SqliteReaderPromiseRepository(database);

    expect(repository.chapterIndex("project-2", first.id)).toBe(1);
    expect(repository.chapterIndex("project-2", second.id)).toBe(2);
  });

  it("keeps Chapter Intent fields and snapshots backward-compatible", () => {
    const planning = new SqliteWebNovelRepository(database);
    const saved = planning.upsertChapterBrief("project-1", "chapter-1", {
      purpose: "turning_point",
      secondaryPurposes: ["reveal"],
      goal: "逼出真相",
      readerExpectation: "主角会发现谁在撒谎",
      emotionTarget: "紧张",
      emotionCurve: [{ label: "逼近", intensity: 4 }],
      conflict: "证词互相矛盾",
      readerPromiseOperations: [],
      payoff: "拿到关键录音",
      payoffStrength: 4,
      hook: "录音里出现主角自己的声音",
      hookType: "identity",
      hookStrength: 5,
      informationGain: 4,
      endingPull: 5,
      sceneStructure: [
        {
          order: 1,
          purpose: "conflict",
          beat: "对质证人",
          payoff: "证词出现漏洞",
        },
      ],
      characterIds: [],
      foreshadowIds: [],
      timelineIds: [],
      targetWords: 2500,
      pacing: "cliffhanger",
      expectedVersion: null,
      now,
    });
    expect(saved).toMatchObject({
      purpose: "turning_point",
      readerExpectation: "主角会发现谁在撒谎",
      payoffStrength: 4,
      hookType: "identity",
      endingPull: 5,
    });
    const revised = planning.upsertChapterBrief("project-1", "chapter-1", {
      ...saved,
      expectedVersion: saved.version,
      now: "2026-09-14T00:01:00.000Z",
    });
    expect(revised.version).toBe(1);
    expect(
      planning.listChapterBriefHistory("project-1", "chapter-1")[0]?.snapshot,
    ).toMatchObject({
      purpose: "turning_point",
      sceneStructure: [{ purpose: "conflict" }],
    });
  });
});
