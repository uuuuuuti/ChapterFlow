import {
  BookProfileSchema,
  BookProfileHistorySchema,
  ChapterBriefSchema,
  ChapterBriefHistorySchema,
  CreateCreativePresetRequestSchema,
  CreativePresetHistorySchema,
  CreativePresetSchema,
  UpdateBookProfileRequestSchema,
  RestoreBookProfileHistoryRequestSchema,
  RestoreCreativePresetHistoryRequestSchema,
  UpdateChapterBriefRequestSchema,
  RestoreChapterBriefHistoryRequestSchema,
  UpdateCreativePresetRequestSchema,
  OpeningThreeCheckReportSchema,
  OpeningCheckAuditRecordSchema,
  OpeningCheckAuditHistorySchema,
  PlatformMetricSchema,
  PlatformMetricImportAuditSchema,
  PlatformMetricReportSchema,
  PlatformMetricsImportResponseSchema,
  UpsertPlatformMetricsRequestSchema,
  CreatePublishRecordRequestSchema,
  UpdatePublishRecordRequestSchema,
  PublishRecordSchema,
  UpdateNovelCheckIssueRequestSchema,
} from "@narralume/contracts";
import { randomUuid } from "@narralume/domain";
import {
  CreativePersistenceError,
  PersistenceNotFoundError,
  SqliteProjectRepository,
  SqliteDocumentRepository,
  SqliteStoryRepository,
  SqliteCanonRepository,
  SqliteNarrativeStateRepository,
  SqlitePlatformMetricsRepository,
  SqlitePublishRecordRepository,
  SqliteExportBatchRepository,
  SqliteWebNovelRepository,
  type NarrativeDatabase,
} from "@narralume/persistence";
import { z } from "zod";
import type { RouteApp } from "./route-app.js";

const ProjectParamsSchema = z.object({ projectId: z.string().trim().min(1) });
const PresetParamsSchema = z.object({ presetId: z.string().trim().min(1) });
const PresetHistoryParamsSchema = PresetParamsSchema.extend({
  historyId: z.string().trim().min(1),
});
const BriefParamsSchema = ProjectParamsSchema.extend({
  outlineNodeId: z.string().trim().min(1),
});
const BookProfileHistoryParamsSchema = ProjectParamsSchema.extend({
  historyId: z.string().trim().min(1),
});
const ChapterBriefHistoryParamsSchema = ProjectParamsSchema.extend({
  outlineNodeId: z.string().trim().min(1),
  historyId: z.string().trim().min(1),
});
const ListPresetQuerySchema = z.object({
  projectId: z.string().trim().min(1).optional(),
});

/** ChapterFlow 网文规划的正式存储面：预设、作品档案和章节简报。 */
export function registerWebNovelRoutes(
  app: RouteApp,
  database: NarrativeDatabase,
): void {
  const projects = new SqliteProjectRepository(database);
  const planning = new SqliteWebNovelRepository(database);
  const metrics = new SqlitePlatformMetricsRepository(database);
  const publishRecords = new SqlitePublishRecordRepository(database);
  const exportBatches = new SqliteExportBatchRepository(database);

  app.route("GET", "/api/creative-presets", async (request) => {
    const query = ListPresetQuerySchema.parse(request.query);
    if (query.projectId) requireProject(projects, query.projectId);
    return planning
      .listPresets(query.projectId)
      .map((preset) => CreativePresetSchema.parse(preset));
  });

  app.route(
    "GET",
    "/api/creative-presets/:presetId/history",
    async (request) => {
      const { presetId } = PresetParamsSchema.parse(request.params);
      planning.requirePreset(presetId);
      return planning
        .listPresetHistory(presetId)
        .map((item) => CreativePresetHistorySchema.parse(item));
    },
  );

  app.route(
    "POST",
    "/api/creative-presets/:presetId/history/:historyId/restore",
    async (request) => {
      const { presetId, historyId } = PresetHistoryParamsSchema.parse(
        request.params,
      );
      planning.requirePreset(presetId);
      const input = RestoreCreativePresetHistoryRequestSchema.parse(
        request.body,
      );
      return CreativePresetSchema.parse(
        planning.restorePresetHistory(
          presetId,
          historyId,
          input.expectedVersion,
          now(),
        ),
      );
    },
  );

  app.route("POST", "/api/creative-presets", async (request) => {
    const input = CreateCreativePresetRequestSchema.parse(request.body);
    if (input.projectId) requireProject(projects, input.projectId);
    return {
      status: 201,
      body: CreativePresetSchema.parse(
        planning.insertPreset({ id: randomUuid(), ...input, now: now() }),
      ),
    };
  });

  app.route("PUT", "/api/creative-presets/:presetId", async (request) => {
    const { presetId } = PresetParamsSchema.parse(request.params);
    const input = UpdateCreativePresetRequestSchema.parse(request.body);
    return CreativePresetSchema.parse(
      planning.updatePreset(presetId, { ...input, now: now() }),
    );
  });

  app.route(
    "POST",
    "/api/projects/:projectId/creative-presets/:presetId/apply",
    async (request) => {
      const { projectId, presetId } = ProjectParamsSchema.extend(
        PresetParamsSchema.shape,
      ).parse(request.params);
      requireProject(projects, projectId);
      const preset = planning.requirePreset(presetId);
      if (preset.projectId && preset.projectId !== projectId) {
        throw new CreativePersistenceError(
          "creative_preset.scope_conflict",
          "This preset belongs to another project",
        );
      }
      const current = planning.getBookProfile(projectId);
      return BookProfileSchema.parse(
        planning.upsertBookProfile(projectId, {
          presetId: preset.id,
          genre: preset.genre,
          audience: preset.audience,
          promise: preset.promise,
          tone: current?.tone ?? null,
          endingDirection: current?.endingDirection ?? null,
          pov: current?.pov ?? null,
          updateCadence: preset.updateCadence,
          targetWordsPerChapter: preset.targetWordsPerChapter,
          boundaries: [
            ...new Set([...(current?.boundaries ?? []), ...preset.boundaries]),
          ],
          worldRules: current?.worldRules ?? [],
          arcNotes: current?.arcNotes ?? [],
          expectedVersion: current?.version ?? null,
          now: now(),
        }),
      );
    },
  );

  app.route(
    "PUT",
    "/api/projects/:projectId/publish-records/:recordId",
    async (request) => {
      const { projectId, recordId } = ProjectParamsSchema.extend({
        recordId: z.string().trim().min(1),
      }).parse(request.params);
      requireProject(projects, projectId);
      const input = UpdatePublishRecordRequestSchema.parse(request.body);
      requireExportBatch(exportBatches, projectId, input.exportBatchId);
      try {
        return PublishRecordSchema.parse(
          publishRecords.update(projectId, recordId, input, now()),
        );
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "publish record version conflict"
        ) {
          throw new CreativePersistenceError(
            "publish_record.version_conflict",
            "The publish record was updated elsewhere; refresh and try again",
          );
        }
        throw error;
      }
    },
  );

  app.route(
    "GET",
    "/api/projects/:projectId/chapter-briefs/:outlineNodeId/history",
    async (request) => {
      const { projectId, outlineNodeId } = BriefParamsSchema.parse(
        request.params,
      );
      requireChapter(projects, database, projectId, outlineNodeId);
      return planning
        .listChapterBriefHistory(projectId, outlineNodeId)
        .map((item) => ChapterBriefHistorySchema.parse(item));
    },
  );

  app.route(
    "POST",
    "/api/projects/:projectId/chapter-briefs/:outlineNodeId/history/:historyId/restore",
    async (request) => {
      const { projectId, outlineNodeId, historyId } =
        ChapterBriefHistoryParamsSchema.parse(request.params);
      requireChapter(projects, database, projectId, outlineNodeId);
      const input = RestoreChapterBriefHistoryRequestSchema.parse(request.body);
      return ChapterBriefSchema.parse(
        planning.restoreChapterBriefHistory(
          projectId,
          outlineNodeId,
          historyId,
          input.expectedVersion,
          now(),
        ),
      );
    },
  );

  app.route(
    "GET",
    "/api/projects/:projectId/publish-records",
    async (request) => {
      const { projectId } = ProjectParamsSchema.parse(request.params);
      requireProject(projects, projectId);
      return publishRecords
        .list(projectId)
        .map((record) => PublishRecordSchema.parse(record));
    },
  );

  app.route(
    "POST",
    "/api/projects/:projectId/publish-records",
    async (request) => {
      const { projectId } = ProjectParamsSchema.parse(request.params);
      requireProject(projects, projectId);
      const input = CreatePublishRecordRequestSchema.parse(request.body);
      requireExportBatch(exportBatches, projectId, input.exportBatchId);
      return PublishRecordSchema.parse(
        publishRecords.insert(projectId, input, now()),
      );
    },
  );

  app.route(
    "DELETE",
    "/api/projects/:projectId/publish-records/:recordId",
    async (request) => {
      const { projectId, recordId } = ProjectParamsSchema.extend({
        recordId: z.string().trim().min(1),
      }).parse(request.params);
      requireProject(projects, projectId);
      publishRecords.remove(projectId, recordId);
      return { status: 204 };
    },
  );

  app.route("GET", "/api/projects/:projectId/book-profile", async (request) => {
    const { projectId } = ProjectParamsSchema.parse(request.params);
    requireProject(projects, projectId);
    const profile = planning.getBookProfile(projectId);
    return profile ? BookProfileSchema.parse(profile) : null;
  });

  app.route(
    "GET",
    "/api/projects/:projectId/book-profile/history",
    async (request) => {
      const { projectId } = ProjectParamsSchema.parse(request.params);
      requireProject(projects, projectId);
      return planning
        .listBookProfileHistory(projectId)
        .map((item) => BookProfileHistorySchema.parse(item));
    },
  );

  app.route(
    "GET",
    "/api/projects/:projectId/metrics/platform",
    async (request) => {
      const { projectId } = ProjectParamsSchema.parse(request.params);
      requireProject(projects, projectId);
      return metrics
        .list(projectId)
        .map((record) => PlatformMetricSchema.parse(record));
    },
  );

  app.route(
    "POST",
    "/api/projects/:projectId/metrics/platform",
    async (request) => {
      const { projectId } = ProjectParamsSchema.parse(request.params);
      requireProject(projects, projectId);
      const input = UpsertPlatformMetricsRequestSchema.parse(request.body);
      const result = metrics.upsert(projectId, input.records, now(), {
        ...(input.sourceRows === undefined
          ? {}
          : { sourceRows: input.sourceRows }),
      });
      return PlatformMetricsImportResponseSchema.parse({
        ...result,
        records: result.records,
      });
    },
  );

  app.route(
    "GET",
    "/api/projects/:projectId/metrics/platform/imports",
    async (request) => {
      const { projectId } = ProjectParamsSchema.parse(request.params);
      requireProject(projects, projectId);
      return metrics
        .listAudits(projectId)
        .map((audit) => PlatformMetricImportAuditSchema.parse(audit));
    },
  );

  app.route(
    "GET",
    "/api/projects/:projectId/metrics/platform/report",
    async (request) => {
      const { projectId } = ProjectParamsSchema.parse(request.params);
      requireProject(projects, projectId);
      return PlatformMetricReportSchema.parse(metrics.report(projectId, now()));
    },
  );

  app.route(
    "POST",
    "/api/projects/:projectId/metrics/platform/imports/:importId/rollback",
    async (request) => {
      const { projectId, importId } = ProjectParamsSchema.extend({
        importId: z.string().trim().min(1).max(300),
      }).parse(request.params);
      requireProject(projects, projectId);
      try {
        return PlatformMetricImportAuditSchema.parse(
          metrics.rollback(projectId, importId, now()),
        );
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "platform metric import rollback conflict"
        ) {
          throw new CreativePersistenceError(
            "platform_metric_import.rollback_conflict",
            "Platform metrics changed after this import; refresh before rolling it back",
          );
        }
        throw error;
      }
    },
  );

  app.route("PUT", "/api/projects/:projectId/book-profile", async (request) => {
    const { projectId } = ProjectParamsSchema.parse(request.params);
    requireProject(projects, projectId);
    const input = UpdateBookProfileRequestSchema.parse(request.body);
    return BookProfileSchema.parse(
      planning.upsertBookProfile(projectId, { ...input, now: now() }),
    );
  });

  app.route(
    "POST",
    "/api/projects/:projectId/book-profile/history/:historyId/restore",
    async (request) => {
      const { projectId, historyId } = BookProfileHistoryParamsSchema.parse(
        request.params,
      );
      requireProject(projects, projectId);
      const input = RestoreBookProfileHistoryRequestSchema.parse(request.body);
      const history = planning.getBookProfileHistory(projectId, historyId);
      if (!history) {
        throw new PersistenceNotFoundError("book_profile_history", historyId);
      }
      return BookProfileSchema.parse(
        planning.upsertBookProfile(projectId, {
          ...history.snapshot,
          expectedVersion: input.expectedVersion,
          now: now(),
        }),
      );
    },
  );

  app.route(
    "GET",
    "/api/projects/:projectId/chapter-briefs/:outlineNodeId",
    async (request) => {
      const { projectId, outlineNodeId } = BriefParamsSchema.parse(
        request.params,
      );
      requireChapter(projects, database, projectId, outlineNodeId);
      const brief = planning.getChapterBrief(projectId, outlineNodeId);
      return brief ? ChapterBriefSchema.parse(brief) : null;
    },
  );

  app.route(
    "PUT",
    "/api/projects/:projectId/chapter-briefs/:outlineNodeId",
    async (request) => {
      const { projectId, outlineNodeId } = BriefParamsSchema.parse(
        request.params,
      );
      requireChapter(projects, database, projectId, outlineNodeId);
      const input = UpdateChapterBriefRequestSchema.parse(request.body);
      return ChapterBriefSchema.parse(
        planning.upsertChapterBrief(projectId, outlineNodeId, {
          ...input,
          now: now(),
        }),
      );
    },
  );

  app.route(
    "PUT",
    "/api/projects/:projectId/web-novel/checks/opening-three/issues/:issueId",
    async (request) => {
      const { projectId, issueId } = ProjectParamsSchema.extend({
        issueId: z.string().trim().min(1).max(300),
      }).parse(request.params);
      requireProject(projects, projectId);
      const input = UpdateNovelCheckIssueRequestSchema.parse(request.body);
      const knownReports = planning.listOpeningCheckReports(projectId, 100);
      const reportId =
        knownReports.find((report) => report.id === input.reportId)?.id ??
        findLatestOpeningCheckReportId(knownReports, issueId);
      return planning.updateOpeningCheckIssueState(projectId, issueId, {
        ...input,
        reportId,
        now: now(),
      });
    },
  );

  app.route(
    "GET",
    "/api/projects/:projectId/web-novel/checks/opening-three/history",
    async (request) => {
      const { projectId } = ProjectParamsSchema.parse(request.params);
      requireProject(projects, projectId);
      return planning
        .listOpeningCheckReports(projectId)
        .map((record) => OpeningThreeCheckReportSchema.parse(record.report));
    },
  );

  app.route(
    "GET",
    "/api/projects/:projectId/web-novel/checks/opening-three/audit",
    async (request) => {
      const { projectId } = ProjectParamsSchema.parse(request.params);
      requireProject(projects, projectId);
      return OpeningCheckAuditHistorySchema.parse(
        planning
          .listOpeningCheckAudits(projectId)
          .map((record) => OpeningCheckAuditRecordSchema.parse(record)),
      );
    },
  );

  app.route(
    "POST",
    "/api/projects/:projectId/web-novel/checks/opening-three",
    async (request) => {
      const { projectId } = ProjectParamsSchema.parse(request.params);
      requireProject(projects, projectId);
      const previousReport =
        planning.listOpeningCheckReports(projectId, 1)[0] ?? null;
      const story = new SqliteStoryRepository(database);
      const canon = new SqliteCanonRepository(database);
      const state = new SqliteNarrativeStateRepository(database, canon, story);
      const documents = new SqliteDocumentRepository(database);
      const chapters = story
        .listOutline(projectId)
        .filter((node) => node.kind === "chapter")
        .slice(0, 3);
      const profile = planning.getBookProfile(projectId);
      const targetWordsPerChapter = profile?.targetWordsPerChapter ?? null;
      const issues: OpeningCheckIssue[] = [];
      const chapterIds = chapters.map((chapter) => chapter.id);
      let manuscriptCharacters = 0;
      let briefsCompleted = 0;
      let chaptersWithHook = 0;
      let chaptersWithConflict = 0;
      let chaptersWithPayoff = 0;
      let chaptersMeetingTarget = 0;
      const sourceVersions: Array<{
        chapterId: string;
        documentId: string | null;
        documentVersionId: string | null;
      }> = [];
      for (const chapter of chapters) {
        const document = documents.getByOutlineNodeId(projectId, chapter.id);
        const version = document?.currentVersionId
          ? documents.getVersion(
              projectId,
              document.id,
              document.currentVersionId,
            )
          : null;
        sourceVersions.push({
          chapterId: chapter.id,
          documentId: document?.id ?? null,
          documentVersionId: document?.currentVersionId ?? null,
        });
        const content = version?.content ?? "";
        const characters = effectiveCharacterCount(content);
        manuscriptCharacters += characters;
        if (!content.trim()) {
          issues.push(
            issue(
              "opening.missing_manuscript",
              "error",
              "还没有正文",
              `${chapter.title} 尚未保存正文，前三章体检无法判断开篇承诺。`,
              "先写下本章的可读版本，再重新检查。",
              chapter.id,
              document?.id ?? null,
              document?.currentVersionId ?? null,
            ),
          );
        } else if (characters < 800) {
          issues.push(
            issue(
              "opening.short_chapter",
              "warning",
              "章节长度偏短",
              `${chapter.title} 当前约 ${characters} 字，样本不足以承载完整冲突与回报。`,
              "确认这是有意的短章，或补齐冲突推进和读者回报。",
              chapter.id,
              document?.id ?? null,
              document?.currentVersionId ?? null,
            ),
          );
        }
        const hasHook = /[?？!！…]$/u.test(content.trim().slice(-180));
        if (hasHook) chaptersWithHook += 1;
        else if (content.trim()) {
          issues.push(
            issue(
              "opening.missing_hook",
              "warning",
              "章尾钩子不明显",
              `${chapter.title} 的结尾 180 字没有检测到疑问、转折或悬念标点。`,
              "检查章尾是否留下下一章必须回答的问题。",
              chapter.id,
              document?.id ?? null,
              document?.currentVersionId ?? null,
            ),
          );
        }
        const brief = planning.getChapterBrief(projectId, chapter.id);
        const hasConflict = Boolean(
          chapter.conflict?.trim() || brief?.conflict?.trim(),
        );
        if (hasConflict) chaptersWithConflict += 1;
        if (brief?.payoff?.trim()) chaptersWithPayoff += 1;
        if (
          targetWordsPerChapter &&
          characters >= Math.round(targetWordsPerChapter * 0.8)
        ) {
          chaptersMeetingTarget += 1;
        }
        if (
          targetWordsPerChapter &&
          content.trim() &&
          characters < Math.round(targetWordsPerChapter * 0.5)
        ) {
          issues.push(
            issue(
              "opening.target_words_low",
              "warning",
              "章节字数明显低于目标",
              `${chapter.title} 当前约 ${characters} 字，仅达到每章 ${targetWordsPerChapter} 字目标的一半以内。`,
              "确认这是有意的短章，或补足冲突推进、读者回报和章尾钩子。",
              chapter.id,
              document?.id ?? null,
              document?.currentVersionId ?? null,
            ),
          );
        }
        if (
          brief &&
          document &&
          brief.documentVersionId !== document.currentVersionId
        ) {
          issues.push(
            issue(
              "opening.brief_stale",
              "warning",
              "章节简报基于旧正文",
              `${chapter.title} 的简报基于 ${
                brief.documentVersionId ? "较早的正文版本" : "未保存正文版本"
              }，当前正文已经变化。`,
              "先确认简报是否仍适合当前正文，保存后再重新运行前三章体检。",
              chapter.id,
              document.id,
              document.currentVersionId,
              document.currentVersionId ?? brief.documentVersionId ?? "none",
            ),
          );
        }
        if (
          brief &&
          brief.goal?.trim() &&
          brief.conflict?.trim() &&
          brief.payoff?.trim() &&
          brief.hook?.trim()
        ) {
          briefsCompleted += 1;
        } else {
          issues.push(
            issue(
              "opening.brief_incomplete",
              "warning",
              "章节简报不完整",
              `${chapter.title} 缺少目标、冲突、回报或钩子中的一项。`,
              "补齐章节简报后再开始修改，检查结果会更有依据。",
              chapter.id,
              document?.id ?? null,
              document?.currentVersionId ?? null,
            ),
          );
        }
      }
      if (chapters.length < 3) {
        issues.push(
          issue(
            "opening.three_chapters_missing",
            "error",
            "前三章样本不足",
            `当前只有 ${chapters.length} 个章节节点，无法完成完整的前三章体检。`,
            "先在大纲中补齐前三章，再重新运行体检。",
            null,
            null,
          ),
        );
      }
      const intent = story.getAuthorIntent(projectId);
      if (!profile?.promise?.trim() && !intent?.promise?.trim()) {
        issues.push(
          issue(
            "opening.promise_missing",
            "warning",
            "缺少作品核心承诺",
            "当前没有可用于校验前三章回报的读者承诺。",
            "先在网文作品档案或作品设定中写下核心承诺。",
            null,
            null,
          ),
        );
      }
      if (
        chapters.length >= 2 &&
        chaptersWithConflict < Math.min(2, chapters.length)
      ) {
        issues.push(
          issue(
            "opening.conflict_density",
            "warning",
            "开篇冲突密度偏低",
            `前三章中只有 ${chaptersWithConflict} 章明确记录了冲突，读者可能还没有足够的推进压力。`,
            "为至少两章补充可验证的阻力、代价或对手动作，再重新运行体检。",
            null,
            null,
          ),
        );
      }
      if (
        chapters.length >= 2 &&
        chaptersWithPayoff < Math.min(2, chapters.length)
      ) {
        issues.push(
          issue(
            "opening.payoff_coverage",
            "warning",
            "读者回报覆盖偏低",
            `前三章中只有 ${chaptersWithPayoff} 章在章节简报中明确记录了回报，读者承诺可能还没有得到连续兑现。`,
            "为关键章节补充可验证的阶段回报，并确认回报与作品核心承诺一致。",
            null,
            null,
          ),
        );
      }
      if (
        targetWordsPerChapter &&
        chapters.length > 0 &&
        chaptersMeetingTarget < Math.ceil(chapters.length / 2)
      ) {
        issues.push(
          issue(
            "opening.target_words_coverage",
            "warning",
            "目标字数达标率偏低",
            `前三章中只有 ${chaptersMeetingTarget} 章达到每章 ${targetWordsPerChapter} 字目标的 80%，当前样本的篇幅承载能力需要复核。`,
            "结合目标读者和更新节奏决定是否调整每章目标，或补足有效冲突与回报。",
            null,
            null,
          ),
        );
      }
      const unresolvedForeshadows = state
        .listForeshadows(projectId)
        .filter((item) => !["resolved", "abandoned"].includes(item.status));
      const highRiskForeshadows = unresolvedForeshadows.filter(
        (item) =>
          item.importance >= 4 &&
          !item.targetToNodeId &&
          !item.resolutionNodeId,
      );
      if (highRiskForeshadows.length) {
        issues.push(
          issue(
            "opening.foreshadow_risk",
            "warning",
            "高重要度伏笔缺少回收计划",
            `当前有 ${highRiskForeshadows.length} 个高重要度伏笔仍未设置目标章节或回收章节。`,
            "为伏笔补充目标章节、证据或回收计划，避免开篇承诺长期悬空。",
            null,
            null,
          ),
        );
      }
      const issueStates = new Map(
        planning
          .listOpeningCheckIssueStates(projectId)
          .map((state) => [state.issueId, state]),
      );
      const hydratedIssues = issues.map((item) => {
        const state = issueStates.get(item.id);
        return state
          ? {
              ...item,
              status: state.status,
              note: state.note,
              updatedAt: state.updatedAt,
            }
          : item;
      });
      const activeIssues = hydratedIssues.filter(
        (item) => item.status === "open",
      );
      const errors = activeIssues.filter(
        (item) => item.severity === "error",
      ).length;
      const warnings = activeIssues.filter(
        (item) => item.severity === "warning",
      ).length;
      const checkedChapters = chapters.length;
      const generatedAt = now();
      const report = OpeningThreeCheckReportSchema.parse({
        id: randomUuid(),
        projectId,
        scope: "opening-three",
        chapterIds,
        generatedAt,
        sourceVersions,
        score: Math.max(0, Math.min(100, 100 - errors * 20 - warnings * 8)),
        metrics: {
          availableChapters: story
            .listOutline(projectId)
            .filter((node) => node.kind === "chapter").length,
          checkedChapters,
          manuscriptCharacters,
          averageChapterCharacters: checkedChapters
            ? Math.round(manuscriptCharacters / checkedChapters)
            : 0,
          briefsCompleted,
          chaptersWithHook,
          chaptersWithConflict,
          chaptersWithPayoff,
          chaptersMeetingTarget,
          targetWordsPerChapter,
          targetCompletionRate:
            targetWordsPerChapter && checkedChapters > 0
              ? Math.round(
                  (manuscriptCharacters /
                    (targetWordsPerChapter * checkedChapters)) *
                    100,
                )
              : null,
        },
        issues: hydratedIssues,
      });
      planning.insertOpeningCheckReport(
        projectId,
        report as unknown as Record<string, unknown>,
        generatedAt,
      );
      planning.insertOpeningCheckAudit({
        projectId,
        reportId: report.id,
        eventType: "report_generated",
        action: previousReport ? "recheck" : "initial",
        before: previousReport
          ? openingCheckAuditSnapshot(previousReport.report)
          : null,
        after: openingCheckAuditSnapshot(report),
        createdAt: generatedAt,
      });
      return report;
    },
  );
}

interface OpeningCheckIssue {
  id: string;
  code: string;
  severity: "info" | "warning" | "error";
  title: string;
  message: string;
  evidence: string;
  suggestion: string;
  targetChapterId: string | null;
  targetDocumentId: string | null;
  targetDocumentVersionId: string | null;
  status: "open" | "ignored" | "resolved";
  note: string | null;
  updatedAt: string | null;
}

function issue(
  code: string,
  severity: OpeningCheckIssue["severity"],
  title: string,
  evidence: string,
  suggestion: string,
  targetChapterId: string | null,
  targetDocumentId: string | null,
  targetDocumentVersionId: string | null = null,
  idSuffix?: string,
): OpeningCheckIssue {
  return {
    id: `${code}:${targetChapterId ?? "book"}${idSuffix ? `:${idSuffix}` : ""}`,
    code,
    severity,
    title,
    message: evidence,
    evidence,
    suggestion,
    targetChapterId,
    targetDocumentId,
    targetDocumentVersionId,
    status: "open",
    note: null,
    updatedAt: null,
  };
}

function findLatestOpeningCheckReportId(
  reports: readonly { id: string; report: Record<string, unknown> }[],
  issueId: string,
): string | null {
  return (
    reports.find((record) => {
      const issues = record.report.issues;
      return (
        Array.isArray(issues) &&
        issues.some(
          (item) =>
            item &&
            typeof item === "object" &&
            !Array.isArray(item) &&
            (item as Record<string, unknown>).id === issueId,
        )
      );
    })?.id ?? null
  );
}

function openingCheckAuditSnapshot(
  report: Record<string, unknown>,
): Record<string, unknown> {
  const issues = Array.isArray(report.issues)
    ? report.issues.flatMap((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return [];
        const record = item as Record<string, unknown>;
        return typeof record.id === "string"
          ? [
              {
                id: record.id,
                code: typeof record.code === "string" ? record.code : null,
                status:
                  typeof record.status === "string" ? record.status : null,
              },
            ]
          : [];
      })
    : [];
  return {
    reportId: typeof report.id === "string" ? report.id : null,
    score: typeof report.score === "number" ? report.score : null,
    metrics:
      report.metrics &&
      typeof report.metrics === "object" &&
      !Array.isArray(report.metrics)
        ? report.metrics
        : null,
    issues,
  };
}

function requireProject(
  projects: SqliteProjectRepository,
  projectId: string,
): void {
  if (!projects.get(projectId)) {
    throw new PersistenceNotFoundError("project", projectId);
  }
}

function requireChapter(
  projects: SqliteProjectRepository,
  database: NarrativeDatabase,
  projectId: string,
  outlineNodeId: string,
): void {
  requireProject(projects, projectId);
  const node = database.raw
    .prepare("SELECT kind FROM outline_nodes WHERE id = ? AND project_id = ?")
    .get(outlineNodeId, projectId) as { kind?: string } | undefined;
  if (!node) throw new PersistenceNotFoundError("outline_node", outlineNodeId);
  if (node.kind !== "chapter") {
    throw new CreativePersistenceError(
      "chapter_brief.kind_invalid",
      "A chapter brief can only be attached to a chapter outline node",
    );
  }
}

function requireExportBatch(
  batches: SqliteExportBatchRepository,
  projectId: string,
  exportBatchId: string | null,
): void {
  if (exportBatchId && !batches.get(projectId, exportBatchId)) {
    throw new CreativePersistenceError(
      "publish_record.export_batch_not_found",
      "The selected export batch does not belong to this project",
    );
  }
}

function now(): string {
  return new Date().toISOString();
}

function effectiveCharacterCount(value: string): number {
  return Array.from(value.replace(/\s/gu, "")).length;
}
