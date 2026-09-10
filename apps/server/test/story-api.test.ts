import { randomUUID } from "node:crypto";

import { buildCanonCandidateRecipe } from "@narralume/harness";
import { SqliteRunRepository } from "@narralume/persistence";
import { NodeNarrativeDatabase } from "@narralume/persistence/node";
import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import type { ServerConfig } from "../src/config.js";

const config: ServerConfig = {
  dataDirectory: ".",
  databasePath: ":memory:",
  host: "127.0.0.1",
  port: 4317,
  environment: "test",
};

const resources: {
  app: Awaited<ReturnType<typeof buildApp>>;
  database: NodeNarrativeDatabase;
}[] = [];

afterEach(async () => {
  while (resources.length) {
    const resource = resources.pop();
    await resource?.app.close();
    resource?.database.close();
  }
});

async function setup() {
  const database = new NodeNarrativeDatabase();
  const app = await buildApp({
    config,
    database,
    environment: {},
    logger: false,
  });
  resources.push({ app, database });
  return { app, database };
}

async function createProject(
  app: Awaited<ReturnType<typeof buildApp>>,
  title = "潮汐灯塔",
) {
  const response = await app.inject({
    method: "POST",
    url: "/api/projects",
    payload: {
      requestId: randomUUID(),
      title,
      premise: "守灯人的女儿发现每次灯塔熄灭，港口都会遗忘一个人。",
    },
  });
  expect(response.statusCode).toBe(201);
  return response.json() as { id: string; title: string };
}

describe("story kernel API", () => {
  it("replays manual project and document creation requests", async () => {
    const { app, database } = await setup();
    const projectRequest = {
      requestId: "manual-project-replay",
      title: "重放建书",
      premise: null,
    };
    const firstProject = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: projectRequest,
    });
    const replayedProject = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: projectRequest,
    });
    expect(firstProject.statusCode).toBe(201);
    expect(replayedProject.statusCode).toBe(201);
    expect(replayedProject.json()).toEqual(firstProject.json());

    const projectConflict = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { ...projectRequest, title: "不同书名" },
    });
    expect(projectConflict.statusCode).toBe(409);
    expect(projectConflict.json()).toMatchObject({
      error: { code: "project.create.idempotency_conflict" },
    });

    const projectId = firstProject.json().id as string;
    const documentRequest = {
      requestId: "manual-document-replay",
      kind: "note",
      title: "同一份笔记",
      outlineNodeId: null,
    };
    const firstDocument = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/documents`,
      payload: documentRequest,
    });
    const replayedDocument = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/documents`,
      payload: documentRequest,
    });
    expect(firstDocument.statusCode).toBe(201);
    expect(replayedDocument.statusCode).toBe(201);
    expect(replayedDocument.json()).toEqual(firstDocument.json());

    const documentConflict = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/documents`,
      payload: { ...documentRequest, title: "另一份笔记" },
    });
    expect(documentConflict.statusCode).toBe(409);
    expect(documentConflict.json()).toMatchObject({
      error: { code: "document.create.idempotency_conflict" },
    });
    expect(
      database.raw.prepare("SELECT COUNT(*) AS count FROM projects").get(),
    ).toEqual({ count: 1 });
    expect(
      database.raw
        .prepare("SELECT COUNT(*) AS count FROM documents WHERE project_id = ?")
        .get(projectId),
    ).toEqual({ count: 1 });
  });

  it("creates a chapter outline and manuscript atomically with replay protection", async () => {
    const { app, database } = await setup();
    const project = await createProject(app, "原子章节");
    const bible = (
      await app.inject({
        method: "GET",
        url: `/api/projects/${project.id}/story-bible`,
      })
    ).json() as { outline: Array<{ id: string; kind: string }> };
    const root = bible.outline.find((node) => node.kind === "book")!;
    const payload = {
      requestId: "chapter-create-replay",
      title: "潮声入港",
      parentId: root.id,
    };
    const first = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/chapters`,
      payload,
    });
    const replay = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/chapters`,
      payload,
    });
    expect(first.statusCode, first.body).toBe(201);
    expect(replay.statusCode, replay.body).toBe(201);
    expect(replay.json()).toEqual(first.json());
    expect(first.json()).toMatchObject({
      outline: {
        projectId: project.id,
        kind: "chapter",
        parentId: root.id,
        title: "潮声入港",
      },
      document: {
        projectId: project.id,
        kind: "chapter",
        outlineNodeId: expect.any(String),
        title: "潮声入港",
      },
    });
    expect(first.json().document.outlineNodeId).toBe(first.json().outline.id);
    expect(
      database.raw
        .prepare("SELECT COUNT(*) AS count FROM documents WHERE project_id = ?")
        .get(project.id),
    ).toEqual({ count: 1 });
    expect(
      database.raw
        .prepare(
          "SELECT COUNT(*) AS count FROM outline_nodes WHERE project_id = ? AND kind = 'chapter'",
        )
        .get(project.id),
    ).toEqual({ count: 1 });

    const conflict = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/chapters`,
      payload: { ...payload, title: "另一章" },
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toMatchObject({
      error: { code: "chapter.create.idempotency_conflict" },
    });
  });

  it("creates a fully initialized project and story-bible snapshot", async () => {
    const { app } = await setup();
    const project = await createProject(app);
    const response = await app.inject({
      method: "GET",
      url: `/api/projects/${project.id}/story-bible`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      project: { id: project.id, title: "潮汐灯塔" },
      intent: { projectId: project.id, themes: [], boundaries: [] },
      outline: [{ kind: "book", title: "潮汐灯塔", depth: 0 }],
      documents: [],
      entities: [],
      facts: [],
    });
  });

  it("indexes manuscript, version, and outline evidence for native canon links", async () => {
    const { app } = await setup();
    const project = await createProject(app, "证据索引");
    const entity = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/entities`,
      payload: {
        type: "character",
        name: "沈砚",
        aliases: ["守塔人"],
        description: null,
        attributes: {},
      },
    });
    expect(entity.statusCode, entity.body).toBe(201);
    const bible = (
      await app.inject({
        method: "GET",
        url: `/api/projects/${project.id}/story-bible`,
      })
    ).json() as { outline: Array<{ id: string; kind: string }> };
    const root = bible.outline.find((node) => node.kind === "book")!;
    const chapter = (
      await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/chapters`,
        payload: {
          requestId: "evidence-chapter",
          title: "雾港来信",
          parentId: root.id,
        },
      })
    ).json() as { outline: { id: string }; document: { id: string } };
    const first = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/documents/${chapter.document.id}/versions`,
      payload: {
        content: "第一版：雾港的钟声在凌晨响起。",
        source: "manual",
        expectedCurrentVersionId: null,
      },
    });
    expect(first.statusCode, first.body).toBe(201);
    const second = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/documents/${chapter.document.id}/versions`,
      payload: {
        content:
          "第二版：雾港的钟声在凌晨响起，沈砚带着一封未署名的信走进灯塔。",
        source: "manual",
        expectedCurrentVersionId: first.json().id,
      },
    });
    expect(second.statusCode, second.body).toBe(201);

    const response = await app.inject({
      method: "GET",
      url: `/api/projects/${project.id}/story-evidence`,
    });
    expect(response.statusCode, response.body).toBe(200);
    const refs = response.json() as Array<Record<string, unknown>>;
    expect(refs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceType: "document",
          sourceId: chapter.document.id,
          documentId: chapter.document.id,
          outlineNodeId: chapter.outline.id,
          versionId: second.json().id,
          excerpt: expect.stringContaining("未署名的信"),
          entityIds: [entity.json().id],
        }),
        expect.objectContaining({
          sourceType: "document_version",
          sourceId: first.json().id,
          documentId: chapter.document.id,
          wordCount: expect.any(Number),
        }),
        expect.objectContaining({
          sourceType: "outline_node",
          sourceId: chapter.outline.id,
          documentId: chapter.document.id,
          versionId: second.json().id,
        }),
      ]),
    );
  });

  it("previews outline removal impact before protecting referenced chapters", async () => {
    const { app } = await setup();
    const project = await createProject(app, "删除影响预览");
    const bible = (
      await app.inject({
        method: "GET",
        url: `/api/projects/${project.id}/story-bible`,
      })
    ).json() as { outline: Array<{ id: string; kind: string }> };
    const root = bible.outline.find((node) => node.kind === "book")!;
    const created = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/outline`,
      payload: {
        parentId: root.id,
        kind: "chapter",
        ordinal: 0,
        title: "会被引用的章节",
        summary: null,
        metadata: {},
      },
    });
    expect(created.statusCode, created.body).toBe(201);
    const chapter = created.json() as { id: string; updatedAt: string };

    const emptyImpact = await app.inject({
      method: "GET",
      url: `/api/projects/${project.id}/outline/${chapter.id}/removal-impact`,
    });
    expect(emptyImpact.statusCode, emptyImpact.body).toBe(200);
    expect(emptyImpact.json()).toMatchObject({
      id: chapter.id,
      totalReferences: 0,
      canDelete: true,
      dispositionIfConfirmed: "deleted",
    });

    const document = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/documents`,
      payload: {
        requestId: "outline-removal-impact-document",
        kind: "chapter",
        title: "正文引用",
        outlineNodeId: chapter.id,
      },
    });
    expect(document.statusCode, document.body).toBe(201);

    const referencedImpact = await app.inject({
      method: "GET",
      url: `/api/projects/${project.id}/outline/${chapter.id}/removal-impact`,
    });
    expect(referencedImpact.statusCode, referencedImpact.body).toBe(200);
    expect(referencedImpact.json()).toMatchObject({
      id: chapter.id,
      canDelete: false,
      dispositionIfConfirmed: "abandoned",
      references: [
        expect.objectContaining({
          table: "documents",
          column: "outline_node_id",
          label: "正文绑定",
          count: 1,
        }),
      ],
    });

    const removed = await app.inject({
      method: "DELETE",
      url: `/api/projects/${project.id}/outline/${chapter.id}`,
      payload: { expectedUpdatedAt: chapter.updatedAt },
    });
    expect(removed.statusCode, removed.body).toBe(200);
    expect(removed.json()).toMatchObject({
      id: chapter.id,
      disposition: "abandoned",
      references: 1,
    });
  });

  it("reports shelf writing progress and supports optimistic rename and archive", async () => {
    const { app } = await setup();
    const project = await createProject(app, "旧书名");
    const note = (
      await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/documents`,
        payload: {
          requestId: "shelf-progress-note",
          kind: "note",
          title: "开篇笔记",
          outlineNodeId: null,
        },
      })
    ).json() as { id: string };
    await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/documents/${note.id}/versions`,
      payload: {
        content: "潮水退去，盐痕留在石阶上。",
        source: "manual",
        expectedCurrentVersionId: null,
      },
    });

    const shelf = await app.inject({ method: "GET", url: "/api/projects" });
    expect(shelf.statusCode).toBe(200);
    expect(shelf.json()).toEqual([
      expect.objectContaining({
        id: project.id,
        wordCount: 0,
        lastWritingAt: null,
        committedChapters: 0,
        totalChapters: 0,
      }),
    ]);
    const current = shelf.json()[0] as { updatedAt: string };
    const archived = await app.inject({
      method: "PUT",
      url: `/api/projects/${project.id}`,
      payload: {
        title: "潮痕",
        subtitle: null,
        premise: "守灯人的女儿发现每次灯塔熄灭，港口都会遗忘一个人。",
        archived: true,
        expectedUpdatedAt: current.updatedAt,
      },
    });
    expect(archived.statusCode).toBe(200);
    expect(archived.json()).toMatchObject({
      title: "潮痕",
      archivedAt: expect.any(String),
    });
    expect(
      (await app.inject({ method: "GET", url: "/api/projects" })).json(),
    ).toEqual([]);
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/projects?includeArchived=true",
        })
      ).json(),
    ).toEqual([expect.objectContaining({ id: project.id, title: "潮痕" })]);
  });

  it("pages the project shelf beyond the first 100 records", async () => {
    const { app, database } = await setup();
    const insert = database.raw.prepare(
      `INSERT INTO projects(
         id, title, subtitle, premise, language, phase, archived_at, created_at, updated_at
       ) VALUES (?, ?, NULL, NULL, 'zh-CN', 'idea', NULL, ?, ?)`,
    );
    database.transaction(() => {
      for (let index = 0; index < 101; index += 1) {
        const id = `project-${String(index).padStart(3, "0")}`;
        const timestamp = new Date(
          Date.UTC(2026, 7, 1, 0, index),
        ).toISOString();
        insert.run(id, `作品 ${index}`, timestamp, timestamp);
      }
    });

    const first = await app.inject({ method: "GET", url: "/api/projects" });
    const second = await app.inject({
      method: "GET",
      url: "/api/projects?offset=100",
    });
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(first.json()).toHaveLength(100);
    expect(second.json()).toHaveLength(1);
    expect([
      ...(first.json() as { id: string }[]),
      ...(second.json() as { id: string }[]),
    ]).toHaveLength(101);
  });

  it("returns narrative state validation errors as actionable 422 responses", async () => {
    const { app } = await setup();
    const project = await createProject(app, "因果校验");
    const response = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/timeline`,
      payload: {
        title: "不存在的因果后件",
        description: null,
        outlineNodeId: null,
        storyTimeStart: "第一日",
        storyTimeEnd: null,
        sequence: 1,
        participants: [],
        causes: ["missing-cause"],
        visibility: "reader",
        sourceId: null,
      },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({
      error: {
        code: "timeline.cause.not_found",
        message: "Causal antecedent missing-cause does not exist",
        requestId: expect.any(String),
      },
    });
    const bible = await app.inject({
      method: "GET",
      url: `/api/projects/${project.id}/story-bible`,
    });
    expect(bible.json()).toMatchObject({ timeline: [] });
  });

  it("returns one product overview with chapter progress and the next action", async () => {
    const { app } = await setup();
    const project = await createProject(app, "总览测试");
    const bible = (
      await app.inject({
        method: "GET",
        url: `/api/projects/${project.id}/story-bible`,
      })
    ).json() as { outline: Array<{ id: string; kind: string }> };
    const chapter = (
      await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/outline`,
        payload: {
          parentId: bible.outline.find((node) => node.kind === "book")!.id,
          kind: "chapter",
          ordinal: 0,
          title: "第一章",
        },
      })
    ).json() as { id: string };

    const initial = await app.inject({
      method: "GET",
      url: `/api/projects/${project.id}/overview`,
    });
    expect(initial.statusCode, initial.body).toBe(200);
    expect(initial.json()).toMatchObject({
      progress: { wordCount: 0, committedChapters: 0, totalChapters: 1 },
      currentChapter: {
        outlineNodeId: chapter.id,
        title: "第一章",
        documentId: null,
      },
      activeTask: null,
      pending: {
        foundationCandidates: 0,
        reviewIssues: 0,
        revisionProposals: 0,
        canonChangeSets: 0,
      },
      nextAction: { kind: "write_chapter", targetId: chapter.id },
    });

    const document = (
      await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/documents`,
        payload: {
          requestId: "overview-chapter-document",
          kind: "chapter",
          title: "第一章",
          outlineNodeId: chapter.id,
        },
      })
    ).json() as { id: string };
    const committed = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/documents/${document.id}/versions`,
      payload: {
        content: "第一章正文",
        source: "manual",
        expectedCurrentVersionId: null,
      },
    });
    expect(committed.statusCode, committed.body).toBe(201);

    const completed = await app.inject({
      method: "GET",
      url: `/api/projects/${project.id}/overview`,
    });
    expect(completed.statusCode, completed.body).toBe(200);
    expect(completed.json()).toMatchObject({
      progress: { wordCount: 5, committedChapters: 1, totalChapters: 1 },
      currentChapter: null,
      nextAction: { kind: "complete", targetId: null },
    });
  });

  it("does not promote local AI runs to the project primary task (CR-06)", async () => {
    const { app, database } = await setup();
    const project = await createProject(app, "局部任务隔离");
    const runId = randomUUID();
    const recipe = buildCanonCandidateRecipe(runId);
    new SqliteRunRepository(database).create({
      id: runId,
      projectId: project.id,
      recipe: recipe.name,
      recipeVersion: recipe.version,
      mode: "manual",
      targetOutlineNodeId: null,
      policy: {},
      budgetLimit: {
        maxInputTokens: 10_000,
        maxOutputTokens: 2_000,
        maxCalls: 2,
        maxCostUsd: null,
        maxWallTimeMs: 60_000,
      },
      steps: recipe.steps,
      now: new Date().toISOString(),
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/projects/${project.id}/overview`,
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({
      activeTask: null,
      nextAction: { kind: "build_outline", targetId: null },
    });
  });

  it("round-trips the story bible and compiles an auditable context", async () => {
    const { app, database } = await setup();
    const project = await createProject(app);
    const initial = (
      await app.inject({
        method: "GET",
        url: `/api/projects/${project.id}/story-bible`,
      })
    ).json() as {
      outline: { id: string }[];
      documents: { id: string; currentVersionId: string | null }[];
      intent: { updatedAt: string } | null;
    };
    const bookId = initial.outline[0]!.id;

    const intent = await app.inject({
      method: "PUT",
      url: `/api/projects/${project.id}/intent`,
      payload: {
        promise: "每一次超自然异象都必须付出可见代价。",
        themes: ["记忆", "责任"],
        tone: "潮湿、克制、带微光",
        boundaries: ["不以失忆作为廉价反转"],
        lockedFields: ["promise", "boundaries"],
        expectedUpdatedAt: initial.intent?.updatedAt ?? null,
      },
    });
    expect(intent.statusCode).toBe(200);

    const heroResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/entities`,
      payload: {
        type: "character",
        name: "林昼",
        aliases: ["阿昼"],
        description: "守灯人的女儿，能记住被港口遗忘的人。",
        attributes: { age: 19 },
      },
    });
    const harborResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/entities`,
      payload: {
        type: "location",
        name: "沉雾港",
        aliases: [],
        description: "被潮汐与遗忘规则笼罩的港口。",
      },
    });
    expect(heroResponse.statusCode).toBe(201);
    expect(harborResponse.statusCode).toBe(201);
    const hero = heroResponse.json() as { id: string };
    const harbor = harborResponse.json() as { id: string };

    const chapterResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/outline`,
      payload: {
        parentId: bookId,
        kind: "chapter",
        ordinal: 0,
        title: "雾港失灯",
        summary: "林昼回港当夜，灯塔第一次在她面前熄灭。",
        goal: "让林昼发现遗忘规则",
        conflict: "父亲拒绝承认失踪者存在",
        metadata: {},
      },
    });
    expect(chapterResponse.statusCode).toBe(201);
    const chapter = chapterResponse.json() as { id: string };

    const fact1 = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/facts`,
      payload: {
        subjectId: hero.id,
        predicate: "居住于",
        objectEntityId: harbor.id,
        authority: "candidate",
        knowledgeScope: "reader",
      },
    });
    expect(fact1.statusCode).toBe(201);
    const firstFact = fact1.json() as { fact: { id: string } };
    const promotion = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/facts/${firstFact.fact.id}/promote`,
      payload: { authority: "locked" },
    });
    expect(promotion.statusCode).toBe(201);

    const conflicting = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/facts`,
      payload: {
        subjectId: hero.id,
        predicate: "居住于",
        value: "内陆旧城",
        authority: "candidate",
      },
    });
    expect(conflicting.statusCode).toBe(201);
    expect(conflicting.json()).toMatchObject({
      conflicts: [{ reason: "different_object" }],
    });

    const relationship = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/relationships`,
      payload: {
        fromEntityId: hero.id,
        toEntityId: harbor.id,
        relation: "守护",
        intensity: 0.8,
        state: { reluctant: true },
        outlineNodeId: chapter.id,
        storyTime: "海历 117 年·秋",
        sourceId: null,
      },
    });
    expect(relationship.statusCode).toBe(201);
    const relationshipEvent = relationship.json() as { id: string };
    const relationshipCorrection = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/relationships`,
      payload: {
        fromEntityId: hero.id,
        toEntityId: harbor.id,
        relation: "守护",
        intensity: 0.95,
        state: { willing: true },
        outlineNodeId: chapter.id,
        storyTime: "海历 117 年·冬",
        sourceId: null,
        supersedesEventId: relationshipEvent.id,
      },
    });
    expect(relationshipCorrection.statusCode).toBe(201);
    const staleRelationshipCorrection = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/relationships`,
      payload: {
        fromEntityId: hero.id,
        toEntityId: harbor.id,
        relation: "守护",
        intensity: 0.7,
        state: { stale: true },
        outlineNodeId: chapter.id,
        storyTime: "海历 117 年·春",
        sourceId: null,
        supersedesEventId: relationshipEvent.id,
      },
    });
    expect(staleRelationshipCorrection.statusCode).toBe(409);
    expect(staleRelationshipCorrection.json().error.code).toBe(
      "relationship.version.conflict",
    );
    const relationshipHistory = await app.inject({
      method: "GET",
      url: `/api/projects/${project.id}/relationships/history`,
    });
    expect(relationshipHistory.statusCode, relationshipHistory.body).toBe(200);
    expect(relationshipHistory.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: relationshipEvent.id,
          supersedesEventId: null,
        }),
        expect.objectContaining({ supersedesEventId: relationshipEvent.id }),
      ]),
    );

    const timelineResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/timeline`,
      payload: {
        title: "灯塔熄灭",
        description: "第一位居民从所有人的记忆中消失。",
        outlineNodeId: chapter.id,
        storyTimeStart: "海历 117-09-03 23:40",
        storyTimeEnd: null,
        sequence: 10,
        participants: [hero.id],
        causes: [],
        visibility: "reader",
        sourceId: null,
      },
    });
    expect(timelineResponse.statusCode).toBe(201);
    const timeline = timelineResponse.json() as {
      id: string;
      createdAt: string;
      updatedAt: string;
    };

    const foreshadow = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/foreshadows`,
      payload: {
        title: "银钥匙上的盐",
        description: "钥匙来自已被淹没的旧港仓库。",
        status: "planted",
        importance: 4,
        targetFromNodeId: chapter.id,
        targetToNodeId: null,
        dependencies: [],
        evidenceNodeIds: [chapter.id],
        resolutionNodeId: null,
      },
    });
    expect(foreshadow.statusCode).toBe(201);
    const foreshadowItem = foreshadow.json() as {
      id: string;
      updatedAt: string;
    };

    const correctedTimeline = await app.inject({
      method: "PUT",
      url: `/api/projects/${project.id}/timeline/${timeline.id}`,
      payload: {
        title: "灯塔在午夜熄灭",
        description: "第一位居民从所有人的记忆中消失。",
        outlineNodeId: chapter.id,
        storyTimeStart: "海历 117-09-04 00:00",
        storyTimeEnd: null,
        sequence: 11,
        participants: [hero.id],
        causes: [],
        visibility: "reader",
        sourceId: timeline.id,
        expectedUpdatedAt: timeline.updatedAt,
      },
    });
    expect(correctedTimeline.statusCode).toBe(200);
    expect(correctedTimeline.json()).toMatchObject({
      title: "灯塔在午夜熄灭",
      sequence: 11,
    });

    const correctedForeshadow = await app.inject({
      method: "PUT",
      url: `/api/projects/${project.id}/foreshadows/${foreshadowItem.id}`,
      payload: {
        title: "银钥匙上的盐",
        description: "钥匙来自已被淹没的旧港仓库。",
        status: "developing",
        importance: 5,
        targetFromNodeId: chapter.id,
        targetToNodeId: null,
        dependencies: [],
        evidenceNodeIds: [chapter.id],
        resolutionNodeId: null,
        expectedUpdatedAt: foreshadowItem.updatedAt,
      },
    });
    expect(correctedForeshadow.statusCode).toBe(200);
    expect(correctedForeshadow.json()).toMatchObject({
      status: "developing",
      importance: 5,
    });

    const entitiesList = await app.inject({
      method: "GET",
      url: `/api/projects/${project.id}/entities?includeRetired=true`,
    });
    expect(entitiesList.statusCode).toBe(200);
    expect(entitiesList.json().map((item: { id: string }) => item.id)).toEqual(
      expect.arrayContaining([hero.id, harbor.id]),
    );
    const factsList = await app.inject({
      method: "GET",
      url: `/api/projects/${project.id}/facts?includeCandidates=true`,
    });
    expect(factsList.statusCode).toBe(200);
    expect(factsList.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ subjectId: hero.id, authority: "locked" }),
      ]),
    );
    const relationshipsList = await app.inject({
      method: "GET",
      url: `/api/projects/${project.id}/relationships`,
    });
    expect(relationshipsList.statusCode).toBe(200);
    expect(relationshipsList.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ supersedesEventId: relationshipEvent.id }),
      ]),
    );
    const timelineList = await app.inject({
      method: "GET",
      url: `/api/projects/${project.id}/timeline`,
    });
    expect(timelineList.statusCode).toBe(200);
    expect(timelineList.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: timeline.id, sequence: 11 }),
      ]),
    );
    const foreshadowsList = await app.inject({
      method: "GET",
      url: `/api/projects/${project.id}/foreshadows`,
    });
    expect(foreshadowsList.statusCode).toBe(200);
    expect(foreshadowsList.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: foreshadowItem.id, importance: 5 }),
      ]),
    );
    const invalidResource = await app.inject({
      method: "GET",
      url: "/api/projects/missing-project/facts",
    });
    expect(invalidResource.statusCode).toBe(404);

    const preview = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/context/preview`,
      payload: {
        purpose: "chapter-draft",
        task: "续写林昼进入熄灭的灯塔，不得改变锁定事实。",
        query: "灯塔熄灭",
        entityIds: [hero.id, harbor.id],
        currentOutlineNodeId: chapter.id,
        access: { audience: "author", includeCandidates: false },
      },
    });
    expect(preview.statusCode).toBe(200);
    const compiled = preview.json() as {
      text: string;
      sections: { kind: string }[];
      receipt: { id: string; compiledHash: string; entries: unknown[] };
    };
    expect(compiled.text).toContain("本轮任务");
    expect(compiled.sections.map((section) => section.kind)).toEqual(
      expect.arrayContaining(["author-intent", "task", "canon", "outline"]),
    );
    expect(compiled.receipt.compiledHash).toMatch(/^[a-f0-9]{64}$/);
    expect(
      database.raw
        .prepare("SELECT COUNT(*) AS count FROM context_receipts WHERE id = ?")
        .get(compiled.receipt.id),
    ).toEqual({ count: 1 });

    const snapshot = (
      await app.inject({
        method: "GET",
        url: `/api/projects/${project.id}/story-bible`,
      })
    ).json() as {
      facts: unknown[];
      relationships: unknown[];
      timeline: unknown[];
      foreshadows: unknown[];
    };
    expect(snapshot).toMatchObject({
      relationships: [{ relation: "守护", intensity: 0.95 }],
      timeline: [{ title: "灯塔在午夜熄灭" }],
      foreshadows: [{ title: "银钥匙上的盐", status: "developing" }],
    });
    expect(snapshot.facts).toHaveLength(2);
  });

  it("keeps document writes optimistic and rollback-safe", async () => {
    const { app } = await setup();
    const project = await createProject(app);
    const note = (
      await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/documents`,
        payload: {
          requestId: "optimistic-note",
          kind: "note",
          title: "乐观锁笔记",
          outlineNodeId: null,
        },
      })
    ).json() as { id: string };
    const documentId = note.id;

    const first = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/documents/${documentId}/versions`,
      payload: {
        content: "第一稿",
        source: "manual",
        expectedCurrentVersionId: null,
      },
    });
    expect(first.statusCode).toBe(201);
    const version = first.json() as { id: string };

    const stale = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/documents/${documentId}/versions`,
      payload: {
        content: "过期写入",
        source: "manual",
        expectedCurrentVersionId: null,
      },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({
      error: {
        code: "document.version.conflict",
        details: { actual: version.id },
      },
    });

    const restore = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/documents/${documentId}/restore`,
      payload: {
        targetVersionId: version.id,
        expectedCurrentVersionId: version.id,
      },
    });
    expect(restore.statusCode).toBe(201);
    expect(restore.json()).toMatchObject({
      content: "第一稿",
      parentVersionId: version.id,
    });
  });

  it("lets authors correct entities, outline nodes, and immutable facts with conflict protection", async () => {
    const { app } = await setup();
    const project = await createProject(app, "正典修订样本");
    const initial = (
      await app.inject({
        method: "GET",
        url: `/api/projects/${project.id}/story-bible`,
      })
    ).json() as { outline: { id: string }[] };
    const entityResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/entities`,
      payload: {
        type: "character",
        name: "旧名",
        aliases: [],
        description: "待修订",
        attributes: {},
      },
    });
    const entity = entityResponse.json() as {
      id: string;
      updatedAt: string;
    };
    const updatedEntityResponse = await app.inject({
      method: "PUT",
      url: `/api/projects/${project.id}/entities/${entity.id}`,
      payload: {
        name: "林昼",
        aliases: ["阿昼"],
        description: "能记住被遗忘者。",
        attributes: { age: 19 },
        status: "active",
        expectedUpdatedAt: entity.updatedAt,
      },
    });
    expect(updatedEntityResponse.statusCode).toBe(200);
    const updatedEntity = updatedEntityResponse.json() as {
      updatedAt: string;
    };
    expect(Date.parse(updatedEntity.updatedAt)).toBeGreaterThan(
      Date.parse(entity.updatedAt),
    );
    const staleEntity = await app.inject({
      method: "PUT",
      url: `/api/projects/${project.id}/entities/${entity.id}`,
      payload: {
        name: "会被拒绝",
        aliases: [],
        description: null,
        attributes: {},
        status: "active",
        expectedUpdatedAt: entity.updatedAt,
      },
    });
    expect(staleEntity.statusCode).toBe(409);
    expect(staleEntity.json()).toMatchObject({
      error: { code: "canon.entity.version.conflict" },
    });

    const chapterResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/outline`,
      payload: {
        parentId: initial.outline[0]!.id,
        kind: "chapter",
        ordinal: 0,
        title: "旧标题",
        summary: null,
        metadata: {},
      },
    });
    const chapter = chapterResponse.json() as {
      id: string;
      updatedAt: string;
    };
    const updatedChapter = await app.inject({
      method: "PUT",
      url: `/api/projects/${project.id}/outline/${chapter.id}`,
      payload: {
        title: "雾港失灯",
        goal: "发现遗忘规则",
        conflict: "父亲拒绝承认失踪者",
        status: "review",
        expectedUpdatedAt: chapter.updatedAt,
      },
    });
    expect(updatedChapter.statusCode).toBe(200);
    expect(updatedChapter.json()).toMatchObject({
      title: "雾港失灯",
      goal: "发现遗忘规则",
      status: "review",
    });
    const secondChapterResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/outline`,
      payload: {
        parentId: initial.outline[0]!.id,
        kind: "chapter",
        ordinal: 1,
        title: "第二章 潮声",
        summary: null,
        metadata: {},
      },
    });
    const secondChapter = secondChapterResponse.json() as {
      id: string;
      updatedAt: string;
    };
    const movedChapter = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/outline/${chapter.id}/move`,
      payload: {
        parentId: initial.outline[0]!.id,
        ordinal: 1,
        expectedUpdatedAt: (updatedChapter.json() as { updatedAt: string })
          .updatedAt,
      },
    });
    expect(movedChapter.statusCode).toBe(200);
    expect(movedChapter.json()).toMatchObject({ ordinal: 1 });
    const movedOutline = (
      await app.inject({
        method: "GET",
        url: `/api/projects/${project.id}/story-bible`,
      })
    ).json() as { outline: { id: string; ordinal: number }[] };
    expect(
      movedOutline.outline.find((node) => node.id === chapter.id)?.ordinal,
    ).toBe(1);
    expect(
      movedOutline.outline.find((node) => node.id === secondChapter.id)
        ?.ordinal,
    ).toBe(0);
    const volumeResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/outline`,
      payload: {
        parentId: initial.outline[0]!.id,
        kind: "volume",
        ordinal: 2,
        title: "第一卷",
        summary: null,
        metadata: {},
      },
    });
    const volume = volumeResponse.json() as { id: string; path: string };
    const crossLevelMove = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/outline/${chapter.id}/move`,
      payload: {
        parentId: volume.id,
        ordinal: 0,
        expectedUpdatedAt: (movedChapter.json() as { updatedAt: string })
          .updatedAt,
      },
    });
    expect(crossLevelMove.statusCode).toBe(200);
    expect(crossLevelMove.json()).toMatchObject({
      parentId: volume.id,
      path: `${volume.path}/${chapter.id}`,
      depth: 2,
    });
    const illegalMove = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/outline/${chapter.id}/move`,
      payload: {
        parentId: chapter.id,
        ordinal: 0,
        expectedUpdatedAt: (crossLevelMove.json() as { updatedAt: string })
          .updatedAt,
      },
    });
    expect(illegalMove.statusCode).toBe(409);

    const factResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/facts`,
      payload: {
        subjectId: entity.id,
        predicate: "害怕",
        value: "黑暗",
        authority: "locked",
        knowledgeScope: "omniscient",
      },
    });
    const fact = factResponse.json() as {
      fact: { id: string; createdAt: string };
    };
    const correction = {
      subjectId: entity.id,
      predicate: "害怕",
      objectEntityId: null,
      value: "深水",
      validFromNodeId: null,
      validToNodeId: null,
      knowledgeScope: "reader",
      knowledgeSubjectId: null,
      authority: "confirmed",
      confidence: 1,
    };
    const lockedRejection = await app.inject({
      method: "PUT",
      url: `/api/projects/${project.id}/facts/${fact.fact.id}`,
      payload: { ...correction, confirmLockedRevision: false },
    });
    expect(lockedRejection.statusCode).toBe(409);
    expect(lockedRejection.json()).toMatchObject({
      error: { code: "canon.fact.locked" },
    });
    const revisedResponse = await app.inject({
      method: "PUT",
      url: `/api/projects/${project.id}/facts/${fact.fact.id}`,
      payload: { ...correction, confirmLockedRevision: true },
    });
    expect(revisedResponse.statusCode).toBe(201);
    const revised = revisedResponse.json() as {
      fact: { id: string; createdAt: string; value: string };
    };
    expect(revised).toMatchObject({
      fact: {
        value: "深水",
        authority: "confirmed",
        knowledgeScope: "reader",
        supersedesFactId: fact.fact.id,
      },
    });

    const snapshot = (
      await app.inject({
        method: "GET",
        url: `/api/projects/${project.id}/story-bible`,
      })
    ).json() as {
      entities: { name: string; updatedAt: string }[];
      facts: { value: string }[];
    };
    expect(snapshot.entities[0]).toMatchObject({
      name: "林昼",
      updatedAt: updatedEntity.updatedAt,
    });
    expect(snapshot.facts).toEqual([
      expect.objectContaining({ value: "深水" }),
    ]);

    const withdrawnResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/facts/${revised.fact.id}/withdraw`,
      payload: {
        reason: "这一恐惧设定已废弃",
        confirmLockedWithdrawal: false,
      },
    });
    expect(withdrawnResponse.statusCode).toBe(201);
    expect(withdrawnResponse.json()).toMatchObject({
      factId: revised.fact.id,
      reason: "这一恐惧设定已废弃",
    });
    const afterWithdrawal = (
      await app.inject({
        method: "GET",
        url: `/api/projects/${project.id}/story-bible`,
      })
    ).json() as { facts: unknown[] };
    expect(afterWithdrawal.facts).toEqual([]);
  });

  it("moves outline selections atomically and supports safe copy and undo", async () => {
    const { app } = await setup();
    const project = await createProject(app, "结构操作回归");
    const initial = (
      await app.inject({
        method: "GET",
        url: `/api/projects/${project.id}/story-bible`,
      })
    ).json() as {
      outline: Array<{ id: string; kind: string; updatedAt: string }>;
    };
    const root = initial.outline.find((node) => node.kind === "book")!;
    const volume = (
      await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/outline`,
        payload: {
          parentId: root.id,
          kind: "volume",
          ordinal: 0,
          title: "第一卷",
          summary: null,
          metadata: {},
        },
      })
    ).json() as { id: string; path: string; updatedAt: string };
    const chapterOne = (
      await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/outline`,
        payload: {
          parentId: root.id,
          kind: "chapter",
          ordinal: 1,
          title: "第一章",
          summary: null,
          metadata: {},
        },
      })
    ).json() as { id: string; updatedAt: string };
    const chapterTwo = (
      await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/outline`,
        payload: {
          parentId: root.id,
          kind: "chapter",
          ordinal: 2,
          title: "第二章",
          summary: null,
          metadata: {},
        },
      })
    ).json() as { id: string; updatedAt: string };

    const moved = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/outline/batch-move`,
      payload: {
        parentId: volume.id,
        ordinal: 0,
        items: [
          { nodeId: chapterOne.id, expectedUpdatedAt: chapterOne.updatedAt },
          { nodeId: chapterTwo.id, expectedUpdatedAt: chapterTwo.updatedAt },
        ],
      },
    });
    expect(moved.statusCode, moved.body).toBe(200);
    expect(moved.json()).toMatchObject({
      operation: { operation: "batch_move", undoneAt: null },
      nodes: expect.arrayContaining([
        expect.objectContaining({
          id: chapterOne.id,
          parentId: volume.id,
          path: `${volume.path}/${chapterOne.id}`,
          ordinal: 0,
        }),
        expect.objectContaining({
          id: chapterTwo.id,
          parentId: volume.id,
          path: `${volume.path}/${chapterTwo.id}`,
          ordinal: 1,
        }),
      ]),
    });
    const operationId = moved.json().operation.id as string;
    const stale = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/outline/batch-move`,
      payload: {
        parentId: root.id,
        ordinal: 0,
        items: [
          { nodeId: chapterOne.id, expectedUpdatedAt: chapterOne.updatedAt },
        ],
      },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({
      error: { code: "outline.version.conflict" },
    });

    const snapshotAfterMove = (
      await app.inject({
        method: "GET",
        url: `/api/projects/${project.id}/story-bible`,
      })
    ).json() as { outline: Array<{ id: string; updatedAt: string }> };
    const undone = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/outline/operations/${operationId}/undo`,
      payload: {
        expectedUpdatedAtByNode: Object.fromEntries(
          snapshotAfterMove.outline.map((node) => [node.id, node.updatedAt]),
        ),
      },
    });
    expect(undone.statusCode, undone.body).toBe(200);
    expect(undone.json()).toMatchObject({
      operation: { id: operationId, undoneAt: expect.any(String) },
    });
    const restored = (
      await app.inject({
        method: "GET",
        url: `/api/projects/${project.id}/story-bible`,
      })
    ).json() as {
      outline: Array<{
        id: string;
        parentId: string | null;
        updatedAt: string;
      }>;
    };
    expect(
      restored.outline.find((node) => node.id === chapterOne.id)?.parentId,
    ).toBe(root.id);
    expect(
      restored.outline.find((node) => node.id === chapterTwo.id)?.parentId,
    ).toBe(root.id);

    const copied = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/outline/${chapterOne.id}/copy`,
      payload: {
        parentId: volume.id,
        ordinal: 0,
        expectedUpdatedAt: restored.outline.find(
          (node) => node.id === chapterOne.id,
        )!.updatedAt,
      },
    });
    expect(copied.statusCode, copied.body).toBe(201);
    expect(copied.json()).toMatchObject({
      root: { parentId: volume.id, title: "第一章（副本）" },
      operation: { operation: "copy" },
    });
    const copyOperationId = copied.json().operation.id as string;
    const copiedSnapshot = (
      await app.inject({
        method: "GET",
        url: `/api/projects/${project.id}/story-bible`,
      })
    ).json() as { outline: Array<{ id: string; updatedAt: string }> };
    const copyUndo = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/outline/operations/${copyOperationId}/undo`,
      payload: {
        expectedUpdatedAtByNode: Object.fromEntries(
          copiedSnapshot.outline.map((node) => [node.id, node.updatedAt]),
        ),
      },
    });
    expect(copyUndo.statusCode, copyUndo.body).toBe(200);
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/api/projects/${project.id}/story-bible`,
        })
      ).json().outline,
    ).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: "第一章（副本）" }),
      ]),
    );
  });

  it("saves outline character and foreshadow associations with version guards", async () => {
    const { app } = await setup();
    const project = await createProject(app, "关联工作流");
    const initial = (
      await app.inject({
        method: "GET",
        url: `/api/projects/${project.id}/story-bible`,
      })
    ).json() as { outline: { id: string; kind: string }[] };
    const root = initial.outline.find((node) => node.kind === "book")!;
    const chapter = (
      await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/outline`,
        payload: {
          parentId: root.id,
          kind: "chapter",
          ordinal: 0,
          title: "关联章节",
          summary: null,
          metadata: {},
        },
      })
    ).json() as { id: string; updatedAt: string };
    const entity = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/entities`,
      payload: {
        type: "character",
        name: "林昼",
        aliases: [],
        description: "守灯人的女儿",
        attributes: {},
      },
    });
    expect(entity.statusCode, entity.body).toBe(201);
    const foreshadow = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/foreshadows`,
      payload: {
        title: "第三下钟声",
        description: "灯塔每次熄灭前都会响起第三下钟声。",
        status: "planned",
        importance: 4,
        targetFromNodeId: chapter.id,
        targetToNodeId: null,
        dependencies: [],
        evidenceNodeIds: [],
        resolutionNodeId: null,
      },
    });
    expect(foreshadow.statusCode, foreshadow.body).toBe(201);
    const foreshadowItem = foreshadow.json() as {
      id: string;
      updatedAt: string;
    };
    const timeline = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/timeline`,
      payload: {
        title: "潮声退去",
        description: "港口在钟声后短暂失去潮汐。",
        outlineNodeId: null,
        storyTimeStart: null,
        storyTimeEnd: null,
        sequence: 0,
        participants: [],
        causes: [],
        visibility: "reader",
        sourceId: null,
      },
    });
    expect(timeline.statusCode, timeline.body).toBe(201);
    const timelineItem = timeline.json() as { id: string; updatedAt: string };
    const associated = await app.inject({
      method: "PUT",
      url: `/api/projects/${project.id}/outline/${chapter.id}/associations`,
      payload: {
        povEntityId: entity.json().id,
        foreshadowIds: [foreshadowItem.id],
        timelineEventIds: [timelineItem.id],
        expectedUpdatedAt: chapter.updatedAt,
        expectedForeshadowUpdatedAt: {
          [foreshadowItem.id]: foreshadowItem.updatedAt,
        },
        expectedTimelineUpdatedAt: {
          [timelineItem.id]: timelineItem.updatedAt,
        },
      },
    });
    expect(associated.statusCode, associated.body).toBe(200);
    expect(associated.json()).toMatchObject({
      node: { id: chapter.id, povEntityId: entity.json().id },
      foreshadows: [{ id: foreshadowItem.id, evidenceNodeIds: [chapter.id] }],
      timelines: [{ id: timelineItem.id, outlineNodeId: chapter.id }],
    });
    const stale = await app.inject({
      method: "PUT",
      url: `/api/projects/${project.id}/outline/${chapter.id}/associations`,
      payload: {
        povEntityId: null,
        foreshadowIds: [],
        expectedUpdatedAt: chapter.updatedAt,
        expectedForeshadowUpdatedAt: {
          [foreshadowItem.id]: foreshadowItem.updatedAt,
        },
      },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({
      error: { code: "outline.version.conflict" },
    });
  });
});
