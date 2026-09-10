import { describe, expect, it } from "vitest";

import {
  mergePlatformMetrics,
  parsePlatformMetricsCsv,
  parsePlatformMetricsCsvDetailed,
  buildQualityTrend,
  buildMetricInsights,
  buildChapterMetricEvidence,
  buildPublicationMetricEvidence,
  deriveAuthoringMetrics,
} from "../src/pages/analytics/analytics-page";

describe("platform metrics CSV", () => {
  it("maps Chinese headers, quoted cells and slash dates", () => {
    const result = parsePlatformMetricsCsv(
      "平台,章节,发布日期,字数,阅读,点赞,评论\n起点,\"第 1 章, 灯塔\",2026/09/08,3200,120,12,3",
    );
    expect(result.sourceRows).toBe(1);
    expect(result.records[0]).toMatchObject({
      platform: "起点",
      chapter: "第 1 章, 灯塔",
      date: "2026-09-08",
      words: 3200,
      views: 120,
      likes: 12,
      comments: 3,
    });
  });

  it("deduplicates the same platform, chapter and date with last row winning", () => {
    const result = parsePlatformMetricsCsv(
      "platform,chapter,date,words,views\nsite,1,2026-09-08,100,10\nsite,1,2026-09-08,200,20",
    );
    expect(result.sourceRows).toBe(2);
    expect(result.duplicateRows).toBe(1);
    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.words).toBe(200);
  });

  it("updates an existing row without changing its stable identity", () => {
    const existing = parsePlatformMetricsCsv(
      "platform,chapter,date,words\nsite,1,2026-09-08,100",
    ).records;
    const incoming = parsePlatformMetricsCsv(
      "platform,chapter,date,words\nsite,1,2026-09-08,250\nsite,2,2026-09-09,180",
    ).records;
    const merged = mergePlatformMetrics(existing, incoming);
    expect(merged).toMatchObject({ added: 1, replaced: 1 });
    expect(merged.records.find((row) => row.chapter === "1")).toMatchObject({
      id: existing[0]?.id,
      words: 250,
    });
  });

  it.each([
    ["platform,chapter\nsite,1", "缺少必填列"],
    ["platform,chapter,date\nsite,1,2026-02-30", "日期无效"],
    ["platform,chapter,date,views\nsite,1,2026-09-08,nope", "不是有效的非负整数"],
    ["platform,chapter,date,views\nsite,1,2026-09-08,1.5", "不是有效的非负整数"],
  ])("rejects malformed input: %s", (csv, message) => {
    expect(() => parsePlatformMetricsCsv(csv)).toThrow(message);
  });

  it("keeps valid rows and reports invalid rows for a downloadable error file", () => {
    const result = parsePlatformMetricsCsvDetailed(
      "platform,chapter,date,views\nsite,1,2026-09-08,10\nsite,2,2026-02-30,20",
    );
    expect(result.records).toHaveLength(1);
    expect(result.errors).toMatchObject([{ line: 3 }]);
    expect(result.errors[0]?.message).toContain("日期无效");
  });

  it("builds quality trends from saved report scores without inventing empty periods", () => {
    const trend = buildQualityTrend(
      [
        { createdAt: "2026-09-01T10:00:00.000Z", scores: { prose: 80, pacing: 90 }, verdict: "pass" },
        { createdAt: "2026-09-01T12:00:00.000Z", scores: { prose: 60 }, verdict: "revise" },
        { createdAt: "2026-09-03T12:00:00.000Z", scores: {}, verdict: "block" },
      ],
      "day",
      30,
    );
    expect(trend).toEqual([
      { period: "2026-09-01", averageScore: 73, reportCount: 2, passCount: 1, reviseCount: 1, blockCount: 0 },
    ]);
  });

  it("explains coverage gaps and sharp reading changes without treating missing values as zero", () => {
    const insight = buildMetricInsights([
      { id: "1", platform: "站点 A", chapter: "1", date: "2026-09-01", words: 100, views: 100, likes: null, comments: null },
      { id: "2", platform: "站点 A", chapter: "2", date: "2026-09-02", words: 100, views: 100, likes: null, comments: null },
      { id: "3", platform: "站点 A", chapter: "3", date: "2026-09-03", words: 100, views: 100, likes: null, comments: null },
      { id: "4", platform: "站点 A", chapter: "4", date: "2026-09-04", words: 100, views: 20, likes: null, comments: null },
      { id: "5", platform: "站点 A", chapter: "5", date: "2026-09-05", words: 100, views: 20, likes: null, comments: null },
      { id: "6", platform: "站点 A", chapter: "6", date: "2026-09-07", words: 100, views: 20, likes: null, comments: null },
      { id: "7", platform: "站点 B", chapter: "6", date: "2026-09-07", words: 100, views: null, likes: null, comments: null },
    ]);
    expect(insight.find((item) => item.kind === "coverage")?.detail).toContain("1 天");
    expect(insight.find((item) => item.kind === "missing")?.detail).toContain("1 条");
    expect(insight.find((item) => item.kind === "drop")?.title).toBe("最近阅读量明显下降");
  });

  it("links platform rows back to exact chapter documents and keeps unmatched rows explicit", () => {
    const result = buildChapterMetricEvidence(
      [
        { id: "m-1", platform: "站点 A", chapter: "第一章 灯灭", date: "2026-09-08", words: 3200, views: 120, likes: null, comments: null },
        { id: "m-2", platform: "站点 B", chapter: "第一章 灯灭", date: "2026-09-09", words: 3200, views: 150, likes: null, comments: null },
        { id: "m-3", platform: "站点 A", chapter: "不存在的章节", date: "2026-09-09", words: 3200, views: 20, likes: null, comments: null },
      ],
      [
        { id: "doc-1", projectId: "p-1", kind: "chapter", title: "第一章 灯灭", outlineNodeId: "outline-1", currentVersionId: "v-1", createdAt: "2026-09-01", updatedAt: "2026-09-08" },
        { id: "doc-2", projectId: "p-1", kind: "chapter", title: "第二章", outlineNodeId: "outline-2", currentVersionId: null, createdAt: "2026-09-01", updatedAt: "2026-09-08" },
      ],
      [{ id: "review-1", projectId: "p-1", runId: "run-1", stepId: "step-1", documentVersionId: "v-1", documentId: "doc-1", documentTitle: "第一章 灯灭", verdict: "pass", summary: "ok", scores: { prose: 80, pacing: 90 }, reviewedContent: null, reviewedContentHash: null, issues: [{ id: "issue-1", category: "continuity", severity: "minor", message: "待处理", evidence: [{ quote: "待处理" }], suggestedDirection: "补证据", requiresAuthorDecision: true, status: "open", decision: null }], createdAt: "2026-09-09" }],
      [{
        id: "opening-report-1",
        projectId: "p-1",
        scope: "opening-three",
        chapterIds: ["outline-1"],
        generatedAt: "2026-09-10T09:00:00.000Z",
        sourceVersions: [],
        score: 72,
        metrics: { availableChapters: 1, checkedChapters: 1, manuscriptCharacters: 1200, averageChapterCharacters: 1200, briefsCompleted: 1, chaptersWithHook: 1, chaptersWithConflict: 1, chaptersWithPayoff: 1, chaptersMeetingTarget: 1, targetWordsPerChapter: 3000, targetCompletionRate: 40 },
        issues: [{ id: "opening-issue-1", code: "opening.missing_hook", severity: "warning", title: "章尾钩子不明显", message: "结尾需要留下问题。", evidence: "章尾没有留下新的问题", suggestion: "补一个未解决的问题。", targetChapterId: "outline-1", targetDocumentId: "doc-1", targetDocumentVersionId: "v-1", status: "open", note: null, updatedAt: null }],
      }],
    );
    expect(result.unmatchedCount).toBe(1);
    expect(result.rows[0]).toMatchObject({
      documentId: "doc-1",
      outlineNodeId: "outline-1",
      isOpening: true,
      recordCount: 2,
      totalViews: 270,
      latestViews: 150,
      latestReview: { verdict: "pass" },
      openIssueCount: 1,
      firstDate: "2026-09-08",
      firstViews: 120,
      viewsDelta: 30,
      issueCategories: ["continuity"],
      issueStatusCounts: {
        open: 1,
        accepted: 0,
        rejected: 0,
        resolved: 0,
        openByCategory: { continuity: 1 },
      },
      openingCheckGeneratedAt: "2026-09-10T09:00:00.000Z",
      openingCheckIssues: [{ id: "opening-issue-1", title: "章尾钩子不明显", status: "open", reportId: "opening-report-1" }],
    });
  });

  it("derives cadence, streak, gaps and target completion from saved writing dates", () => {
    const metrics = deriveAuthoringMetrics(
      [
        { updatedAt: "2026-09-01T10:00:00.000Z" },
        { updatedAt: "2026-09-02T10:00:00.000Z" },
        { updatedAt: "2026-09-05T10:00:00.000Z" },
      ],
      7_000,
      2,
      3_000,
      "2026-09-05T12:00:00.000Z",
    );
    expect(metrics).toMatchObject({
      activeDays: 3,
      spanDays: 5,
      stabilityRate: 60,
      averageIntervalDays: 2,
      currentStreakDays: 1,
      longestGapDays: 2,
      targetWordsPerChapter: 3_000,
      targetCompletionRate: 117,
    });
  });

  it("joins manual publication records to export batches and exact platform rows", () => {
    const result = buildPublicationMetricEvidence(
      [
        { id: "metric-1", platform: "起点", chapter: "第一章 灯灭", date: "2026-09-08", words: 3200, views: 120, likes: 12, comments: 3 },
        { id: "metric-2", platform: "起点", chapter: "第一章 灯灭", date: "2026-09-09", words: 3200, views: 140, likes: 15, comments: 4 },
      ],
      [
        { id: "publish-1", projectId: "p-1", platform: "起点", chapter: "第一章 灯灭", publishedAt: "2026-09-08", url: "https://example.com/chapter-1", status: "published", exportBatchId: "batch-1", createdAt: "2026-09-08T10:00:00.000Z", updatedAt: "2026-09-08T10:00:00.000Z" },
        { id: "publish-2", projectId: "p-1", platform: "番茄", chapter: "第 1—3 章", publishedAt: "2026-09-09", url: null, status: "published", exportBatchId: null, createdAt: "2026-09-09T10:00:00.000Z", updatedAt: "2026-09-09T10:00:00.000Z" },
      ],
      [{ id: "batch-1", projectId: "p-1", format: "epub", status: "completed", versionMode: "current", includeAnnotations: false, includeRuns: false, fromOutlineNodeId: null, toOutlineNodeId: null, filename: "chapterflow.epub", byteSize: 1_024, contentHash: "a".repeat(64), errorCode: null, errorMessage: null, retryOfBatchId: null, createdAt: "2026-09-08T09:00:00.000Z" }],
    );
    expect(result[0]).toMatchObject({
      record: { id: "publish-2" },
      batch: null,
      metrics: [],
    });
    expect(result[1]).toMatchObject({
      record: { id: "publish-1" },
      batch: { id: "batch-1", format: "epub" },
      metrics: [{ id: "metric-1" }, { id: "metric-2" }],
    });
  });
});
