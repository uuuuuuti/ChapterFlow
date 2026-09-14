import { NodeNarrativeDatabase } from "@narralume/persistence/node";
import type { FastifyInstance } from "fastify";
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
let app: FastifyInstance | null = null;
let database: NodeNarrativeDatabase | null = null;

afterEach(async () => {
  await app?.close();
  app = null;
  database?.close();
  database = null;
});

async function setup() {
  database = new NodeNarrativeDatabase();
  app = await buildApp({
    config,
    database,
    environment: {},
    logger: false,
    enableRunWorker: false,
  });
  return app;
}

describe("网文规划 API", () => {
  it("在手工建书时原子保存完整作品档案，并把档案纳入幂等键", async () => {
    const server = await setup();
    const payload = {
      requestId: "manual-profile-project",
      title: "纸上星河",
      premise: "一名修复师在旧书中发现来自未来的留言。",
      language: "zh-CN",
      bookProfile: {
        presetId: null,
        genre: "都市悬疑",
        audience: "喜欢慢热推理的读者",
        promise: "每章揭开一层时间谜团",
        tone: "克制、温柔",
        endingDirection: "主角选择留下真相而不是改写过去",
        pov: "近距离第三人称",
        updateCadence: "日更一章",
        targetWordsPerChapter: 3200,
        boundaries: ["不靠巧合解决核心谜题"],
        worldRules: ["跨时留言只能传递一次"],
        arcNotes: ["第一卷查明留言来源", "第二卷面对改写代价"],
      },
    };
    const created = await server.inject({
      method: "POST",
      url: "/api/projects",
      payload,
    });
    expect(created.statusCode).toBe(201);
    const projectId = created.json().id as string;

    const profile = await server.inject({
      method: "GET",
      url: `/api/projects/${projectId}/book-profile`,
    });
    expect(profile.statusCode).toBe(200);
    expect(profile.json()).toMatchObject({
      projectId,
      version: 0,
      genre: "都市悬疑",
      audience: "喜欢慢热推理的读者",
      promise: "每章揭开一层时间谜团",
      targetWordsPerChapter: 3200,
      boundaries: ["不靠巧合解决核心谜题"],
      worldRules: ["跨时留言只能传递一次"],
      arcNotes: ["第一卷查明留言来源", "第二卷面对改写代价"],
    });

    const replay = await server.inject({
      method: "POST",
      url: "/api/projects",
      payload,
    });
    expect(replay.statusCode).toBe(201);
    expect(replay.json().id).toBe(projectId);

    const conflictingReplay = await server.inject({
      method: "POST",
      url: "/api/projects",
      payload: {
        ...payload,
        bookProfile: { ...payload.bookProfile, tone: "冷峻" },
      },
    });
    expect(conflictingReplay.statusCode).toBe(409);
    expect(conflictingReplay.json().error.code).toBe(
      "project.create.idempotency_conflict",
    );
  });

  it("创建作品后可以应用预设、保存档案和章节简报，并生成前三章体检", async () => {
    const server = await setup();
    const created = await server.inject({
      method: "POST",
      url: "/api/projects",
      payload: {
        requestId: "web-novel-project",
        title: "潮汐灯塔",
        premise: "灯灭时，港口会遗忘一个人。",
        language: "zh-CN",
      },
    });
    expect(created.statusCode).toBe(201);
    const projectId = created.json().id as string;

    const presets = await server.inject({
      method: "GET",
      url: `/api/creative-presets?projectId=${projectId}`,
    });
    expect(presets.statusCode).toBe(200);
    expect(
      presets
        .json()
        .some((item: { id: string }) => item.id === "preset-web-novel-fast"),
    ).toBe(true);

    const customPreset = await server.inject({
      method: "POST",
      url: "/api/creative-presets",
      payload: {
        projectId,
        name: "追更悬疑草案",
        genre: "悬疑",
        audience: "追更读者",
        promise: "每章留下一个新问题",
        pacing: "fast",
        targetWordsPerChapter: 2800,
        updateCadence: "日更",
        boundaries: ["不靠巧合收尾"],
        checkRules: ["章尾必须有新问题"],
        defaultTemplate: null,
      },
    });
    expect(customPreset.statusCode).toBe(201);
    const customPresetBody = customPreset.json();
    const editedPreset = await server.inject({
      method: "PUT",
      url: `/api/creative-presets/${customPresetBody.id}`,
      payload: {
        name: "追更悬疑正式版",
        genre: "都市悬疑",
        audience: "追更读者",
        promise: "每章留下一个新问题",
        pacing: "cliffhanger",
        targetWordsPerChapter: 3000,
        updateCadence: "日更一章",
        boundaries: ["不靠巧合收尾"],
        checkRules: ["章尾必须有新问题"],
        defaultTemplate: null,
        status: "active",
        expectedVersion: customPresetBody.version,
      },
    });
    expect(editedPreset.statusCode).toBe(200);
    expect(editedPreset.json()).toMatchObject({
      name: "追更悬疑正式版",
      pacing: "cliffhanger",
      version: 1,
    });
    const archivedPreset = await server.inject({
      method: "PUT",
      url: `/api/creative-presets/${customPresetBody.id}`,
      payload: {
        ...editedPreset.json(),
        status: "archived",
        expectedVersion: editedPreset.json().version,
      },
    });
    expect(archivedPreset.statusCode).toBe(200);
    expect(archivedPreset.json().status).toBe("archived");
    const customPresetHistory = await server.inject({
      method: "GET",
      url: `/api/creative-presets/${customPresetBody.id}/history`,
    });
    expect(customPresetHistory.statusCode).toBe(200);
    expect(customPresetHistory.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          presetId: customPresetBody.id,
          presetVersion: 0,
          snapshot: expect.objectContaining({ name: "追更悬疑草案" }),
        }),
        expect.objectContaining({
          presetId: customPresetBody.id,
          presetVersion: 1,
          snapshot: expect.objectContaining({ name: "追更悬疑正式版" }),
        }),
      ]),
    );
    const stalePreset = await server.inject({
      method: "PUT",
      url: `/api/creative-presets/${customPresetBody.id}`,
      payload: {
        ...archivedPreset.json(),
        name: "过期预设修改",
        expectedVersion: 0,
      },
    });
    expect(stalePreset.statusCode).toBe(409);
    expect(stalePreset.json().error).toMatchObject({
      code: "creative_preset.version_conflict",
      details: {
        expectedVersion: 0,
        currentPreset: {
          id: customPresetBody.id,
          version: 2,
          status: "archived",
        },
      },
    });

    const applied = await server.inject({
      method: "POST",
      url: `/api/projects/${projectId}/creative-presets/preset-web-novel-fast/apply`,
      payload: {},
    });
    expect(applied.statusCode).toBe(200);
    expect(applied.json()).toMatchObject({
      projectId,
      presetId: "preset-web-novel-fast",
      targetWordsPerChapter: 3000,
    });

    const profile = await server.inject({
      method: "PUT",
      url: `/api/projects/${projectId}/book-profile`,
      payload: {
        presetId: "preset-web-novel-fast",
        genre: "都市悬疑",
        audience: "追更读者",
        promise: "每章推进一个新线索",
        tone: "克制",
        endingDirection: null,
        pov: "第三人称",
        updateCadence: "日更",
        targetWordsPerChapter: 3200,
        boundaries: ["不靠误会拖延"],
        worldRules: [],
        arcNotes: [],
        expectedVersion: applied.json().version,
      },
    });
    expect(profile.statusCode).toBe(200);
    expect(profile.json().version).toBe(2);

    const reapplied = await server.inject({
      method: "POST",
      url: `/api/projects/${projectId}/creative-presets/preset-web-novel-fast/apply`,
      payload: {},
    });
    expect(reapplied.statusCode).toBe(200);
    expect(reapplied.json()).toMatchObject({
      tone: "克制",
      pov: "第三人称",
      boundaries: ["不靠误会拖延", "不靠重复误会拖延冲突"],
    });

    const profileHistory = await server.inject({
      method: "GET",
      url: `/api/projects/${projectId}/book-profile/history`,
    });
    expect(profileHistory.statusCode).toBe(200);
    expect(profileHistory.json()).toHaveLength(3);
    expect(profileHistory.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          projectId,
          profileVersion: 0,
          snapshot: expect.objectContaining({
            targetWordsPerChapter: null,
            tone: null,
          }),
        }),
        expect.objectContaining({
          projectId,
          profileVersion: 1,
          snapshot: expect.objectContaining({
            targetWordsPerChapter: 3000,
            tone: null,
          }),
        }),
        expect.objectContaining({
          projectId,
          profileVersion: 2,
          snapshot: expect.objectContaining({
            targetWordsPerChapter: 3200,
            tone: "克制",
          }),
        }),
      ]),
    );
    const originalProfile = profileHistory
      .json()
      .find((item: { profileVersion: number }) => item.profileVersion === 1);
    const restoredProfile = await server.inject({
      method: "POST",
      url: `/api/projects/${projectId}/book-profile/history/${originalProfile.id}/restore`,
      payload: { expectedVersion: reapplied.json().version },
    });
    expect(restoredProfile.statusCode).toBe(200);
    expect(restoredProfile.json()).toMatchObject({
      version: 4,
      targetWordsPerChapter: 3000,
      tone: null,
      pov: null,
    });
    const staleRestore = await server.inject({
      method: "POST",
      url: `/api/projects/${projectId}/book-profile/history/${originalProfile.id}/restore`,
      payload: { expectedVersion: reapplied.json().version },
    });
    expect(staleRestore.statusCode).toBe(409);
    expect(staleRestore.json().error.code).toBe(
      "book_profile.version_conflict",
    );

    const staleProfile = await server.inject({
      method: "PUT",
      url: `/api/projects/${projectId}/book-profile`,
      payload: {
        ...profile.json(),
        expectedVersion: 0,
      },
    });
    expect(staleProfile.statusCode).toBe(409);
    expect(staleProfile.json().error.code).toBe(
      "book_profile.version_conflict",
    );
    expect(staleProfile.json().error.details).toMatchObject({
      expectedVersion: 0,
      currentProfile: { projectId, version: 4, targetWordsPerChapter: 3000 },
    });

    const metric = await server.inject({
      method: "POST",
      url: `/api/projects/${projectId}/metrics/platform`,
      payload: {
        records: [
          {
            platform: "手工站点",
            chapter: "第一章",
            date: "2026-09-08",
            words: 3200,
            views: 120,
            likes: 12,
            comments: 3,
            source: "csv",
          },
        ],
      },
    });
    expect(metric.statusCode).toBe(200);
    expect(metric.json()).toMatchObject({ added: 1, replaced: 0 });
    const firstMetricImportId = metric.json().importId as string;
    expect(metric.json().sourceHash).toMatch(/^[a-f0-9]{64}$/u);
    const metricUpdate = await server.inject({
      method: "POST",
      url: `/api/projects/${projectId}/metrics/platform`,
      payload: {
        records: [
          {
            platform: "手工站点",
            chapter: "第一章",
            date: "2026-09-08",
            words: 3200,
            views: 140,
            likes: 14,
            comments: 4,
            source: "csv",
          },
        ],
      },
    });
    expect(metricUpdate.statusCode).toBe(200);
    expect(metricUpdate.json()).toMatchObject({ added: 0, replaced: 1 });
    const secondMetricImportId = metricUpdate.json().importId as string;
    const metricImports = await server.inject({
      method: "GET",
      url: `/api/projects/${projectId}/metrics/platform/imports`,
    });
    expect(metricImports.statusCode).toBe(200);
    expect(metricImports.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: firstMetricImportId,
          addedCount: 1,
          status: "active",
        }),
        expect.objectContaining({
          id: secondMetricImportId,
          replacedCount: 1,
          status: "active",
        }),
      ]),
    );
    const rolledBackUpdate = await server.inject({
      method: "POST",
      url: `/api/projects/${projectId}/metrics/platform/imports/${secondMetricImportId}/rollback`,
      payload: {},
    });
    expect(rolledBackUpdate.statusCode).toBe(200);
    expect(rolledBackUpdate.json()).toMatchObject({
      id: secondMetricImportId,
      status: "rolled_back",
    });
    const restoredMetrics = await server.inject({
      method: "GET",
      url: `/api/projects/${projectId}/metrics/platform`,
    });
    expect(restoredMetrics.statusCode).toBe(200);
    expect(restoredMetrics.json()).toEqual([
      expect.objectContaining({
        chapter: "第一章",
        views: 120,
        likes: 12,
        comments: 3,
      }),
    ]);
    const laterMetricUpdate = await server.inject({
      method: "POST",
      url: `/api/projects/${projectId}/metrics/platform`,
      payload: {
        records: [
          {
            platform: "手工站点",
            chapter: "第一章",
            date: "2026-09-08",
            words: 3200,
            views: 160,
            likes: 16,
            comments: 5,
            source: "csv",
          },
        ],
      },
    });
    expect(laterMetricUpdate.statusCode).toBe(200);
    const staleRollback = await server.inject({
      method: "POST",
      url: `/api/projects/${projectId}/metrics/platform/imports/${firstMetricImportId}/rollback`,
      payload: {},
    });
    expect(staleRollback.statusCode).toBe(409);
    expect(staleRollback.json().error.code).toBe(
      "platform_metric_import.rollback_conflict",
    );

    const duplicateMetric = await server.inject({
      method: "POST",
      url: `/api/projects/${projectId}/metrics/platform`,
      payload: {
        sourceRows: 3,
        records: [
          {
            platform: "第二站点",
            chapter: "第二章",
            date: "2026-09-09",
            words: 3000,
            views: 20,
            likes: 2,
            comments: 1,
            source: "csv",
          },
          {
            platform: "第二站点",
            chapter: "第二章",
            date: "2026-09-09",
            words: 3000,
            views: 21,
            likes: 3,
            comments: 1,
            source: "csv",
          },
        ],
      },
    });
    expect(duplicateMetric.statusCode).toBe(200);
    expect(duplicateMetric.json()).toMatchObject({
      added: 1,
      replaced: 0,
      sourceRows: 3,
      duplicateRows: 2,
    });
    expect(duplicateMetric.json().records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          platform: "第二站点",
          chapter: "第二章",
          views: 21,
        }),
      ]),
    );
    const duplicateImportId = duplicateMetric.json().importId as string;
    const duplicateAudits = await server.inject({
      method: "GET",
      url: `/api/projects/${projectId}/metrics/platform/imports`,
    });
    expect(duplicateAudits.statusCode).toBe(200);
    expect(duplicateAudits.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: duplicateImportId,
          sourceRows: 3,
          duplicateRows: 2,
        }),
      ]),
    );
    const metricReport = await server.inject({
      method: "GET",
      url: `/api/projects/${projectId}/metrics/platform/report`,
    });
    expect(metricReport.statusCode).toBe(200);
    expect(metricReport.json()).toMatchObject({
      projectId,
      source: "csv",
      dateSemantics: "source_calendar_date",
      timezone: "源文件日期；不进行时区换算",
      recordCount: 2,
      viewSampleCount: 2,
      likesSampleCount: 2,
      commentsSampleCount: 2,
      minimumRecommendedSamples: 3,
      sampleSufficient: false,
      sampleNote: expect.stringContaining("少于建议"),
      dateFrom: "2026-09-08",
      dateTo: "2026-09-09",
      recordedDays: 2,
      missingDays: 0,
      importCount: 4,
      latestSourceHash: duplicateMetric.json().sourceHash,
    });

    const publish = await server.inject({
      method: "POST",
      url: `/api/projects/${projectId}/publish-records`,
      payload: {
        platform: "手工站点",
        chapter: "第一章",
        publishedAt: "2026-09-08",
        url: "https://example.com/chapter-1",
        status: "published",
      },
    });
    expect(publish.statusCode).toBe(200);
    const publishId = publish.json().id as string;
    const editedPublish = await server.inject({
      method: "PUT",
      url: `/api/projects/${projectId}/publish-records/${publishId}`,
      payload: {
        platform: "手工站点",
        chapter: "第一章 灯灭",
        publishedAt: "2026-09-08",
        url: "https://example.com/chapter-1-updated",
        status: "scheduled",
        expectedUpdatedAt: publish.json().updatedAt,
      },
    });
    expect(editedPublish.statusCode).toBe(200);
    expect(editedPublish.json()).toMatchObject({
      chapter: "第一章 灯灭",
      status: "scheduled",
      url: "https://example.com/chapter-1-updated",
    });
    const publishList = await server.inject({
      method: "GET",
      url: `/api/projects/${projectId}/publish-records`,
    });
    expect(publishList.statusCode).toBe(200);
    expect(publishList.json()).toHaveLength(1);
    expect(publishList.json()[0]).toMatchObject({ status: "scheduled" });
    const removedPublish = await server.inject({
      method: "DELETE",
      url: `/api/projects/${projectId}/publish-records/${publishId}`,
    });
    expect(removedPublish.statusCode).toBe(204);

    const story = await server.inject({
      method: "GET",
      url: `/api/projects/${projectId}/story-bible`,
    });
    expect(story.statusCode, story.body).toBe(200);
    const rootId = story.json().outline[0].id as string;
    const chapter = await server.inject({
      method: "POST",
      url: `/api/projects/${projectId}/outline`,
      payload: {
        parentId: rootId,
        kind: "chapter",
        ordinal: 0,
        title: "第一章 灯灭",
      },
    });
    expect(chapter.statusCode).toBe(201);
    const chapterId = chapter.json().id as string;
    const paidPromise = await server.inject({
      method: "POST",
      url: `/api/projects/${projectId}/reader-promises`,
      payload: {
        requestId: "00000000-0000-4000-8000-000000000001",
        title: "灯灭后谁会被遗忘",
        description: "开篇先让读者等待答案。",
        openedChapterId: chapterId,
        targetChapterId: chapterId,
      },
    });
    expect(paidPromise.statusCode).toBe(201);
    const paidPromiseId = paidPromise.json().id as string;
    const advancedPromise = await server.inject({
      method: "POST",
      url: `/api/projects/${projectId}/reader-promises/${paidPromiseId}/actions`,
      payload: {
        action: "ADVANCE",
        chapterId,
        note: "找到一半线索",
      },
    });
    expect(advancedPromise.statusCode).toBe(200);
    const paid = await server.inject({
      method: "POST",
      url: `/api/projects/${projectId}/reader-promises/${paidPromiseId}/actions`,
      payload: {
        action: "PAYOFF",
        chapterId,
        note: "兑现本章答案",
      },
    });
    expect(paid.statusCode).toBe(200);
    expect(paid.json()).toMatchObject({
      status: "paid_off",
      lastAction: "PAYOFF",
    });
    const openPromise = await server.inject({
      method: "POST",
      url: `/api/projects/${projectId}/reader-promises`,
      payload: {
        requestId: "00000000-0000-4000-8000-000000000002",
        title: "未来日期的船票",
        description: "下一章继续核对船票日期。",
        openedChapterId: chapterId,
        targetChapterId: null,
      },
    });
    expect(openPromise.statusCode).toBe(201);
    const openPromiseId = openPromise.json().id as string;
    const promisesBeforeBrief = await server.inject({
      method: "GET",
      url: `/api/projects/${projectId}/reader-promises?view=open&chapterId=${chapterId}`,
    });
    expect(promisesBeforeBrief.statusCode).toBe(200);
    expect(promisesBeforeBrief.json()).toMatchObject({
      health: { openCount: 1 },
      promises: [
        expect.objectContaining({ id: openPromiseId, status: "open" }),
      ],
    });
    const document = await server.inject({
      method: "POST",
      url: `/api/projects/${projectId}/documents`,
      payload: {
        requestId: "chapter-brief-document",
        kind: "chapter",
        title: "第一章 灯灭",
        outlineNodeId: chapterId,
      },
    });
    expect(document.statusCode).toBe(201);
    const documentId = document.json().id as string;
    const firstVersion = await server.inject({
      method: "POST",
      url: `/api/projects/${projectId}/documents/${documentId}/versions`,
      payload: {
        content: "正文".repeat(500),
        source: "manual",
        expectedCurrentVersionId: null,
      },
    });
    expect(firstVersion.statusCode).toBe(201);

    const brief = await server.inject({
      method: "PUT",
      url: `/api/projects/${projectId}/chapter-briefs/${chapterId}`,
      payload: {
        purpose: "turning_point",
        secondaryPurposes: ["reveal"],
        goal: "发现第一条线索",
        readerExpectation: "主角会发现谁在撒谎",
        emotionTarget: "紧张",
        emotionCurve: [{ label: "逼近", intensity: 4 }],
        conflict: "证人拒绝开口",
        readerPromiseOperations: [
          {
            action: "ADVANCE",
            promiseId: openPromiseId,
            title: null,
            note: "拿到船票背面的编号",
          },
          {
            action: "PAYOFF",
            promiseId: paidPromiseId,
            title: null,
            note: "答案已兑现",
          },
        ],
        payoff: "拿到旧船票",
        payoffStrength: 4,
        hook: "船票上的日期尚未到来？",
        hookType: "question",
        hookStrength: 5,
        informationGain: 4,
        endingPull: 5,
        sceneStructure: [
          {
            order: 1,
            purpose: "conflict",
            beat: "证人拒绝开口",
            payoff: "留下船票",
          },
        ],
        characterIds: [],
        foreshadowIds: [],
        timelineIds: [],
        targetWords: 3200,
        pacing: "fast",
        expectedVersion: null,
      },
    });
    expect(brief.statusCode).toBe(200);
    expect(brief.json()).toMatchObject({
      purpose: "turning_point",
      readerExpectation: "主角会发现谁在撒谎",
      emotionTarget: "紧张",
      readerPromiseOperations: [
        expect.objectContaining({
          action: "ADVANCE",
          promiseId: openPromiseId,
        }),
        expect.objectContaining({ action: "PAYOFF", promiseId: paidPromiseId }),
      ],
      characterIds: [],
      foreshadowIds: [],
      timelineIds: [],
      documentVersionId: firstVersion.json().id,
    });
    const editedBrief = await server.inject({
      method: "PUT",
      url: `/api/projects/${projectId}/chapter-briefs/${chapterId}`,
      payload: {
        ...brief.json(),
        hook: "船票上的日期尚未到来。",
        expectedVersion: brief.json().version,
      },
    });
    expect(editedBrief.statusCode).toBe(200);
    expect(editedBrief.json()).toMatchObject({ version: 1 });
    const secondVersion = await server.inject({
      method: "POST",
      url: `/api/projects/${projectId}/documents/${documentId}/versions`,
      payload: {
        content: "更新后的正文".repeat(500),
        source: "manual",
        expectedCurrentVersionId: firstVersion.json().id,
      },
    });
    expect(secondVersion.statusCode).toBe(201);
    const staleBrief = await server.inject({
      method: "PUT",
      url: `/api/projects/${projectId}/chapter-briefs/${chapterId}`,
      payload: {
        ...editedBrief.json(),
        goal: "过期的本地修改",
        expectedVersion: 0,
      },
    });
    expect(staleBrief.statusCode).toBe(409);
    expect(staleBrief.json().error).toMatchObject({
      code: "chapter_brief.version_conflict",
      details: {
        expectedVersion: 0,
        currentBrief: {
          outlineNodeId: chapterId,
          version: 1,
          goal: "发现第一条线索",
        },
      },
    });
    const briefHistory = await server.inject({
      method: "GET",
      url: `/api/projects/${projectId}/chapter-briefs/${chapterId}/history`,
    });
    expect(briefHistory.statusCode).toBe(200);
    expect(briefHistory.json()).toEqual([
      expect.objectContaining({
        outlineNodeId: chapterId,
        briefVersion: 0,
        snapshot: expect.objectContaining({
          hook: "船票上的日期尚未到来？",
          targetWords: 3200,
        }),
      }),
    ]);

    const check = await server.inject({
      method: "POST",
      url: `/api/projects/${projectId}/web-novel/checks/opening-three`,
      payload: {},
    });
    expect(check.statusCode).toBe(200);
    expect(check.json()).toMatchObject({
      projectId,
      scope: "opening-three",
      metrics: {
        availableChapters: 1,
        checkedChapters: 1,
        briefsCompleted: 1,
        chaptersWithConflict: 1,
        chaptersWithPayoff: 1,
        chaptersMeetingTarget: 1,
        targetWordsPerChapter: 3000,
        targetCompletionRate: expect.any(Number),
      },
    });
    expect(check.json().id).toEqual(expect.any(String));
    expect(check.json().sourceVersions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          chapterId,
          documentId,
          documentVersionId: secondVersion.json().id,
        }),
      ]),
    );
    const firstHistory = await server.inject({
      method: "GET",
      url: `/api/projects/${projectId}/web-novel/checks/opening-three/history`,
    });
    expect(firstHistory.statusCode).toBe(200);
    expect(firstHistory.json()).toHaveLength(1);
    expect(firstHistory.json()[0]).toMatchObject({ id: check.json().id });
    expect(
      check
        .json()
        .issues.some(
          (item: { code: string }) =>
            item.code === "opening.three_chapters_missing",
        ),
    ).toBe(true);
    expect(check.json().issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "opening.brief_stale",
          targetDocumentId: documentId,
          targetDocumentVersionId: secondVersion.json().id,
        }),
      ]),
    );

    const missingManuscript = check
      .json()
      .issues.find(
        (item: { code: string }) =>
          item.code === "opening.three_chapters_missing",
      ) as { id: string; status: string } | undefined;
    expect(missingManuscript?.status).toBe("open");
    const resolvedIssue = await server.inject({
      method: "PUT",
      url: `/api/projects/${projectId}/web-novel/checks/opening-three/issues/${encodeURIComponent(missingManuscript!.id)}`,
      payload: {
        status: "resolved",
        note: "已补写并保存正文",
        expectedStatus: "open",
      },
    });
    expect(resolvedIssue.statusCode).toBe(200);
    expect(resolvedIssue.json()).toMatchObject({
      issueId: missingManuscript?.id,
      status: "resolved",
      note: "已补写并保存正文",
    });
    const refreshedCheck = await server.inject({
      method: "POST",
      url: `/api/projects/${projectId}/web-novel/checks/opening-three`,
      payload: {},
    });
    expect(refreshedCheck.statusCode).toBe(200);
    expect(
      refreshedCheck
        .json()
        .issues.find(
          (item: { id: string }) => item.id === missingManuscript?.id,
        ),
    ).toMatchObject({ status: "resolved", note: "已补写并保存正文" });
    const secondHistory = await server.inject({
      method: "GET",
      url: `/api/projects/${projectId}/web-novel/checks/opening-three/history`,
    });
    expect(secondHistory.statusCode).toBe(200);
    expect(secondHistory.json()).toHaveLength(2);
    expect(secondHistory.json().map((item: { id: string }) => item.id)).toEqual(
      expect.arrayContaining([check.json().id, refreshedCheck.json().id]),
    );
    const audit = await server.inject({
      method: "GET",
      url:
        "/api/projects/" + projectId + "/web-novel/checks/opening-three/audit",
    });
    expect(audit.statusCode).toBe(200);
    expect(audit.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "report_generated",
          action: "initial",
          reportId: check.json().id,
        }),
        expect.objectContaining({
          eventType: "issue_decided",
          action: "resolved",
          issueId: missingManuscript?.id,
          reportId: check.json().id,
          before: { status: "open" },
          after: { status: "resolved", note: "已补写并保存正文" },
        }),
        expect.objectContaining({
          eventType: "report_generated",
          action: "recheck",
          reportId: refreshedCheck.json().id,
        }),
      ]),
    );
    const staleIssue = await server.inject({
      method: "PUT",
      url: `/api/projects/${projectId}/web-novel/checks/opening-three/issues/${encodeURIComponent(missingManuscript!.id)}`,
      payload: {
        status: "ignored",
        note: null,
        expectedStatus: "open",
      },
    });
    expect(staleIssue.statusCode).toBe(409);
    expect(staleIssue.json().error.code).toBe(
      "opening_check_issue.version_conflict",
    );
    const restoredBrief = await server.inject({
      method: "POST",
      url: `/api/projects/${projectId}/chapter-briefs/${chapterId}/history/${briefHistory.json()[0].id}/restore`,
      payload: { expectedVersion: editedBrief.json().version },
    });
    expect(restoredBrief.statusCode).toBe(200);
    expect(restoredBrief.json()).toMatchObject({
      version: 2,
      hook: "船票上的日期尚未到来？",
      documentVersionId: secondVersion.json().id,
    });

    const restoredPreset = await server.inject({
      method: "POST",
      url: `/api/creative-presets/${customPresetBody.id}/history/${customPresetHistory.json().find((item: { presetVersion: number }) => item.presetVersion === 0).id}/restore`,
      payload: { expectedVersion: archivedPreset.json().version },
    });
    expect(restoredPreset.statusCode).toBe(200);
    expect(restoredPreset.json()).toMatchObject({
      version: 3,
      name: "追更悬疑草案",
      status: "active",
    });
    const appliedCustomPreset = await server.inject({
      method: "POST",
      url: `/api/projects/${projectId}/creative-presets/${customPresetBody.id}/apply`,
      payload: {},
    });
    expect(appliedCustomPreset.statusCode).toBe(200);
    expect(appliedCustomPreset.json()).toMatchObject({
      presetId: customPresetBody.id,
    });

    const planningBundle = await server.inject({
      method: "GET",
      url: `/api/projects/${projectId}/exports/narrative-bundle?versionMode=history&includeAnnotations=true&includeRuns=false`,
    });
    expect(planningBundle.statusCode).toBe(200);
    const planningBundleBody = planningBundle.json();
    expect(planningBundleBody.manifest.counts.creativePresets).toBe(1);
    expect(planningBundleBody.manifest.counts.creativePresetHistory).toBe(3);
    expect(planningBundleBody.creativePresets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "追更悬疑草案",
          projectId,
          version: 3,
        }),
      ]),
    );
    expect(planningBundleBody.bookProfile.presetId).toBe(customPresetBody.id);
    expect(planningBundleBody.creativePresetHistory).toHaveLength(3);
    expect(planningBundleBody.manifest.counts.chapterBriefs).toBe(1);
    expect(planningBundleBody.manifest.counts.chapterBriefHistory).toBe(2);
    expect(planningBundleBody.manifest.counts.readerPromises).toBe(2);
    expect(planningBundleBody.manifest.counts.readerPromiseEvents).toBe(5);
    expect(planningBundleBody.readerPromises).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "灯灭后谁会被遗忘",
          status: "paid_off",
        }),
        expect.objectContaining({ title: "未来日期的船票", status: "open" }),
      ]),
    );
    expect(planningBundleBody.readerPromiseEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ promiseId: paidPromiseId, action: "PAYOFF" }),
        expect.objectContaining({
          promiseId: openPromiseId,
          action: "ADVANCE",
        }),
      ]),
    );
    expect(planningBundleBody.chapterBriefHistory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          outlineNodeId: chapterId,
          briefVersion: 0,
          snapshot: expect.objectContaining({
            hook: "船票上的日期尚未到来？",
          }),
        }),
        expect.objectContaining({
          outlineNodeId: chapterId,
          briefVersion: 1,
          snapshot: expect.objectContaining({
            hook: "船票上的日期尚未到来。",
          }),
        }),
      ]),
    );

    const bundlePreview = await server.inject({
      method: "POST",
      url: "/api/imports/preview",
      payload: {
        targetProjectId: null,
        filename: "潮汐灯塔.narrative.json",
        format: "narrative-bundle",
        contentBase64: planningBundle.rawPayload.toString("base64"),
      },
    });
    expect(bundlePreview.statusCode).toBe(201);
    const bundleRoundTrip = await server.inject({
      method: "POST",
      url: `/api/imports/${bundlePreview.json().batch.id}/actions`,
      payload: { action: "apply", selectedCandidateIds: [] },
    });
    expect(bundleRoundTrip.statusCode).toBe(200);
    const restoredProjectId = bundleRoundTrip.json().projectId as string;
    const restoredPresets = await server.inject({
      method: "GET",
      url: `/api/creative-presets?projectId=${restoredProjectId}`,
    });
    expect(restoredPresets.statusCode).toBe(200);
    const restoredCustomPreset = restoredPresets
      .json()
      .find((item: { name: string }) => item.name === "追更悬疑草案");
    expect(restoredCustomPreset).toMatchObject({
      projectId: restoredProjectId,
      version: 3,
    });
    const roundTripProfile = await server.inject({
      method: "GET",
      url: `/api/projects/${restoredProjectId}/book-profile`,
    });
    expect(roundTripProfile.statusCode).toBe(200);
    expect(roundTripProfile.json().presetId).toBe(restoredCustomPreset.id);
    const restoredPresetHistory = await server.inject({
      method: "GET",
      url: `/api/creative-presets/${restoredCustomPreset.id}/history`,
    });
    expect(restoredPresetHistory.statusCode).toBe(200);
    expect(restoredPresetHistory.json()).toHaveLength(3);
    const restoredPromises = await server.inject({
      method: "GET",
      url: `/api/projects/${restoredProjectId}/reader-promises?view=all`,
    });
    expect(restoredPromises.statusCode).toBe(200);
    expect(restoredPromises.json().promises).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "灯灭后谁会被遗忘",
          status: "paid_off",
        }),
        expect.objectContaining({ title: "未来日期的船票", status: "open" }),
      ]),
    );
    const restoredOpenPromise = restoredPromises
      .json()
      .promises.find(
        (item: { title: string }) => item.title === "未来日期的船票",
      );
    const restoredEvents = await server.inject({
      method: "GET",
      url: `/api/projects/${restoredProjectId}/reader-promises/${restoredOpenPromise.id}/events`,
    });
    expect(restoredEvents.statusCode).toBe(200);
    expect(restoredEvents.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "OPEN" }),
        expect.objectContaining({ action: "ADVANCE" }),
      ]),
    );
    const restoredStory = await server.inject({
      method: "GET",
      url: `/api/projects/${restoredProjectId}/story-bible`,
    });
    expect(restoredStory.statusCode).toBe(200);
    const restoredChapterId = restoredStory
      .json()
      .outline.find(
        (item: { kind: string; title: string }) =>
          item.kind === "chapter" && item.title === "第一章 灯灭",
      ).id as string;
    const restoredBriefResponse = await server.inject({
      method: "GET",
      url: `/api/projects/${restoredProjectId}/chapter-briefs/${restoredChapterId}`,
    });
    expect(restoredBriefResponse.statusCode).toBe(200);
    expect(restoredBriefResponse.json()).toMatchObject({
      purpose: "turning_point",
      readerPromiseOperations: [
        expect.objectContaining({ action: "ADVANCE" }),
        expect.objectContaining({ action: "PAYOFF" }),
      ],
    });
  });
});
