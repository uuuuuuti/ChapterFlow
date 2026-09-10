import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { BarChart3, Download, FileUp, RefreshCw } from "lucide-react";
import {
  useBookProfile,
  useChapters,
  useProjectOverview,
} from "../../entities/project/queries";
import { getProjectQuality } from "../../shared/api/delivery";
import { getReviewWorkspace } from "../../shared/api/review";
import {
  getPlatformMetrics,
  getPlatformMetricImportAudits,
  getPlatformMetricReport,
  getOpeningThreeCheckHistory,
  getPublishRecords,
  getExportBatches,
  rollbackPlatformMetricImport,
  savePlatformMetrics,
} from "../../shared/api/web-novel";
import type { ExportBatchDto, OpeningThreeCheckReport, PlatformMetricDto, PlatformMetricImportAuditDto, PublishRecordDto, ReviewWorkspaceReport, StoryDocument } from "../../shared/api/types";
import { ConfirmDialog, ErrorNote, ResourceErrorState } from "../../shared/ui";
import { queryKeys } from "../../shared/query/keys";

type PlatformMetric = {
  id: string;
  platform: string;
  chapter: string;
  date: string;
  words: number;
  views: number | null;
  likes: number | null;
  comments: number | null;
  updatedAt?: string;
};
type TrendRange = 7 | 30 | 90;
type TrendGrouping = "day" | "week" | "month";

const metricStorageKey = (projectId: string) => `chapterflow:metrics:${projectId}`;

export function AnalyticsPage() {
  const { projectId = "" } = useParams();
  const client = useQueryClient();
  const overview = useProjectOverview(projectId);
  const chapters = useChapters(projectId);
  const bookProfile = useBookProfile(projectId);
  const quality = useQuery({
    queryKey: queryKeys.qualityReports(projectId),
    queryFn: ({ signal }) => getProjectQuality(projectId, signal),
  });
  const reviews = useQuery({
    queryKey: queryKeys.review(projectId),
    queryFn: ({ signal }) => getReviewWorkspace(projectId, signal),
  });
  const openingChecks = useQuery({
    queryKey: queryKeys.openingCheckHistory(projectId),
    queryFn: ({ signal }) => getOpeningThreeCheckHistory(projectId, signal),
  });
  const remoteMetrics = useQuery({
    queryKey: queryKeys.platformMetrics(projectId),
    queryFn: ({ signal }) => getPlatformMetrics(projectId, signal),
  });
  const importAudits = useQuery({
    queryKey: queryKeys.platformMetricImports(projectId),
    queryFn: ({ signal }) => getPlatformMetricImportAudits(projectId, signal),
  });
  const metricReport = useQuery({
    queryKey: queryKeys.platformMetricReport(projectId),
    queryFn: ({ signal }) => getPlatformMetricReport(projectId, signal),
  });
  const publishRecords = useQuery({
    queryKey: queryKeys.publishRecords(projectId),
    queryFn: ({ signal }) => getPublishRecords(projectId, signal),
  });
  const exportBatches = useQuery({
    queryKey: queryKeys.exportBatches(projectId),
    queryFn: ({ signal }) => getExportBatches(projectId, signal),
  });
  const [platformMetrics, setPlatformMetrics] = useState<PlatformMetric[]>(() => readMetrics(projectId));
  const [importMessage, setImportMessage] = useState("");
  const [trendRange, setTrendRange] = useState<TrendRange>(30);
  const [trendGrouping, setTrendGrouping] = useState<TrendGrouping>("day");
  const [rollbackTarget, setRollbackTarget] = useState<PlatformMetricImportAuditDto | null>(null);
  const migratedLocal = useRef(false);
  const rollbackMutation = useMutation({
    mutationFn: (audit: PlatformMetricImportAuditDto) =>
      rollbackPlatformMetricImport(projectId, audit.id),
    onSuccess: async (audit) => {
      setRollbackTarget(null);
      setImportMessage(`已回滚 ${new Date(audit.createdAt).toLocaleString("zh-CN")} 的平台数据导入；新的平台记录已重新读取。`);
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.platformMetrics(projectId) }),
        client.invalidateQueries({ queryKey: queryKeys.platformMetricImports(projectId) }),
        client.invalidateQueries({ queryKey: queryKeys.platformMetricReport(projectId) }),
      ]);
    },
  });
  const effectivePlatformMetrics = remoteMetrics.isSuccess && remoteMetrics.data.length
    ? remoteMetrics.data.map(toLocalMetric)
    : platformMetrics;
  useEffect(() => {
    if (!remoteMetrics.isSuccess || migratedLocal.current) return;
    migratedLocal.current = true;
    const local = readMetrics(projectId);
    if (!remoteMetrics.data.length && local.length) {
      void savePlatformMetrics(projectId, local.map(toMetricInput))
        .then((saved) => {
          const records = saved.records.map(toLocalMetric);
          setPlatformMetrics(records);
          window.localStorage.setItem(metricStorageKey(projectId), JSON.stringify(records));
        })
        .catch(() => {
          setPlatformMetrics(local);
          setImportMessage("服务端暂时不可用，已保留本机数据；恢复连接后可再次导入同步。");
        });
    } else {
      const records = remoteMetrics.data.map(toLocalMetric);
      window.localStorage.setItem(metricStorageKey(projectId), JSON.stringify(records));
    }
  }, [projectId, remoteMetrics.data, remoteMetrics.isSuccess]);
  const project = overview.data?.project;
  const progress = overview.data?.progress;
  const lastWritingAt = progress?.lastWritingAt;
  const activeDays = useMemo(() => {
    const days = new Set((chapters.data ?? []).map((chapter) => chapter.updatedAt.slice(0, 10)));
    if (lastWritingAt) days.add(lastWritingAt.slice(0, 10));
    return days.size;
  }, [chapters.data, lastWritingAt]);
  const importedSummary = useMemo(() => {
    return effectivePlatformMetrics.reduce(
      (summary, row) => ({
        words: summary.words + row.words,
        views: summary.views + (row.views ?? 0),
        likes: summary.likes + (row.likes ?? 0),
        comments: summary.comments + (row.comments ?? 0),
      }),
      { words: 0, views: 0, likes: 0, comments: 0 },
    );
  }, [effectivePlatformMetrics]);
  const derived = useMemo(
    () =>
      deriveAuthoringMetrics(
        chapters.data ?? [],
        progress?.wordCount ?? 0,
        progress?.committedChapters ?? 0,
        bookProfile.data?.targetWordsPerChapter ?? null,
        lastWritingAt,
      ),
    [
      bookProfile.data?.targetWordsPerChapter,
      chapters.data,
      lastWritingAt,
      progress?.committedChapters,
      progress?.wordCount,
    ],
  );
  const metricCoverage = useMemo(() => getMetricCoverage(effectivePlatformMetrics), [effectivePlatformMetrics]);
  const latestMetricUpdatedAt = useMemo(() => {
    const timestamps = effectivePlatformMetrics
      .map((row) => row.updatedAt)
      .filter((value): value is string => Boolean(value));
    return timestamps.sort().at(-1) ?? null;
  }, [effectivePlatformMetrics]);
  const dailyTrend = useMemo(() => {
    const byDate = new Map<string, { views: number; likes: number; comments: number }>();
    for (const row of effectivePlatformMetrics) {
      const period = trendPeriod(row.date, trendGrouping);
      const current = byDate.get(period) ?? { views: 0, likes: 0, comments: 0 };
      current.views += row.views ?? 0;
      current.likes += row.likes ?? 0;
      current.comments += row.comments ?? 0;
      byDate.set(period, current);
    }
    return [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-trendRange)
      .map(([date, values]) => ({ date, ...values }));
  }, [effectivePlatformMetrics, trendGrouping, trendRange]);
  const qualityTrend = useMemo(
    () => buildQualityTrend(reviews.data?.reports ?? [], trendGrouping, trendRange),
    [reviews.data?.reports, trendGrouping, trendRange],
  );
  const metricInsights = useMemo(
    () => buildMetricInsights(effectivePlatformMetrics),
    [effectivePlatformMetrics],
  );
  const chapterEvidence = useMemo(
    () => buildChapterMetricEvidence(effectivePlatformMetrics, chapters.data ?? [], reviews.data?.reports ?? [], openingChecks.data ?? []),
    [effectivePlatformMetrics, chapters.data, openingChecks.data, reviews.data?.reports],
  );
  const publicationEvidence = useMemo(
    () => buildPublicationMetricEvidence(effectivePlatformMetrics, publishRecords.data ?? [], exportBatches.data ?? []),
    [effectivePlatformMetrics, exportBatches.data, publishRecords.data],
  );
  const exportCsv = () => {
    const header = "platform,chapter,date,words,views,likes,comments";
    const rows = effectivePlatformMetrics.map((row) =>
      [row.platform, row.chapter, row.date, row.words, row.views ?? "", row.likes ?? "", row.comments ?? ""]
        .map(csvCell)
        .join(","),
    );
    const blob = new Blob([`${header}\n${rows.join("\n")}\n`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${project?.title ?? "chapterflow"}-metrics.csv`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };
  const exportReport = () => {
    if (!metricReport.data) return;
    const payload = {
      report: metricReport.data,
      coverage: metricCoverage,
      metrics: effectivePlatformMetrics,
      insights: metricInsights,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${project?.title ?? "chapterflow"}-metrics-report.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };
  const importCsv = async (file: File) => {
    try {
      const parsed = parsePlatformMetricsCsvDetailed(await file.text());
      if (parsed.errors.length) downloadMetricErrors(parsed.errors, project?.title ?? "chapterflow");
      if (!parsed.records.length) {
        setImportMessage(`没有可保存的有效记录，已生成 ${parsed.errors.length} 条错误行文件。`);
        return;
      }
      const merged = mergePlatformMetrics(effectivePlatformMetrics, parsed.records);
      let savedRecords = merged.records;
      let syncNote = "";
      let serverDuplicateRows: number | null = null;
      try {
        const saved = await savePlatformMetrics(projectId, parsed.records.map(toMetricInput), {
          sourceRows: parsed.sourceRows,
        });
        serverDuplicateRows = saved.duplicateRows;
        savedRecords = saved.records.map(toLocalMetric);
        await Promise.all([
          client.invalidateQueries({ queryKey: queryKeys.platformMetrics(projectId) }),
          client.invalidateQueries({ queryKey: queryKeys.platformMetricImports(projectId) }),
          client.invalidateQueries({ queryKey: queryKeys.platformMetricReport(projectId) }),
        ]);
      } catch {
        syncNote = "服务端暂时不可用，已保留本机数据，之后可再次导入同步";
      }
      setPlatformMetrics(savedRecords);
      window.localStorage.setItem(metricStorageKey(projectId), JSON.stringify(savedRecords));
      const duplicateCount = serverDuplicateRows ?? parsed.duplicateRows;
      const duplicateNote = duplicateCount ? `，文件内去重 ${duplicateCount} 条` : "";
      const errorNote = parsed.errors.length ? `，${parsed.errors.length} 条错误行已下载` : "";
      setImportMessage(`已读取 ${parsed.sourceRows} 行：新增 ${merged.added} 条、更新 ${merged.replaced} 条${duplicateNote}${errorNote}。${syncNote}`);
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : "CSV 解析失败。");
    }
  };

  if (overview.isPending) return <div className="cf-page" role="status">正在读取复盘数据…</div>;
  if (overview.isError) return <div className="cf-page"><ResourceErrorState error={overview.error} backHref="/books" backLabel="回到作品库" title="找不到这本作品的数据" description="数据面板所属的作品可能已经被移除，或当前链接已经过期。" /></div>;
  return (
    <div className="cf-page cf-analytics-page">
      <div className="cf-page-title">
        <div>
          <Link className="cf-text-link" to={`/books/${projectId}/dashboard`}>← {project?.title ?? "作品"}</Link>
          <p className="cf-eyebrow">STORY REVIEW</p>
          <h1>数据复盘</h1>
          <p>只展示已经保存或导入的记录，不用虚构的热度替你做判断。</p>
        </div>
        <div className="cf-actions">
          <button className="cf-button" onClick={exportCsv} disabled={!effectivePlatformMetrics.length}><Download size={15} />导出 CSV</button>
          <button className="cf-button" onClick={exportReport} disabled={!metricReport.data}><Download size={15} />导出复盘报告</button>
          <label className="cf-button cf-file-button"><FileUp size={15} />导入平台数据<input type="file" accept=".csv,text/csv" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importCsv(file); }} /></label>
        </div>
      </div>
      {importMessage ? <p className="cf-import-message" role="status">{importMessage}</p> : null}
      <section className="cf-metric-grid">
        <MetricCard label="正文总字数" value={(progress?.wordCount ?? 0).toLocaleString()} note="来自已保存正文" />
        <MetricCard label="章节进度" value={`${progress?.committedChapters ?? 0} / ${progress?.totalChapters ?? 0}`} note="已定稿 / 总章节" />
        <MetricCard label="创作活跃日" value={activeDays} note="根据章节更新时间计算" />
        <MetricCard label="平台记录" value={effectivePlatformMetrics.length} note="手工导入，已保存到当前作品" />
      </section>
      <section className="cf-card cf-analytics-derived" aria-label="创作稳定度与目标完成率">
        <div className="cf-section-title"><div><h2>创作节奏</h2><p>根据已保存章节更新时间和作品目标计算；所有日期按 ISO 日期原值展示，不跨时区换算。</p></div><RefreshCw size={22} /></div>
        <div className="cf-analytics-derived-grid">
          <MetricCard label="创作稳定度" value={derived.stabilityRate === null ? "—" : `${derived.stabilityRate}%`} note={derived.spanDays ? `${derived.activeDays} / ${derived.spanDays} 个自然日有写作记录` : "至少需要两天记录"} />
          <MetricCard label="平均更新间隔" value={derived.averageIntervalDays === null ? "—" : `${derived.averageIntervalDays} 天`} note="相邻有写作日期的平均间隔" />
          <MetricCard label="当前连续创作" value={`${derived.currentStreakDays} 天`} note="从最近有记录日期向前计算" />
          <MetricCard label="最长断更区间" value={`${derived.longestGapDays} 天`} note="相邻记录之间没有写作的完整天数" />
          <MetricCard label="目标字数完成率" value={derived.targetCompletionRate === null ? "—" : `${derived.targetCompletionRate}%`} note={derived.targetWordsPerChapter ? `按每章 ${derived.targetWordsPerChapter.toLocaleString()} 字目标计算` : "先在作品定位设置每章目标字数"} />
        </div>
        {bookProfile.isError ? <small className="cf-error-text">作品定位暂时无法读取，目标字数完成率未计算；其余节奏指标仍可查看。</small> : null}
      </section>
      <div className="cf-analytics-grid">
        <section className="cf-card">
          <div className="cf-section-title"><div><h2>作品完成度</h2><p>把结构进度和质量检查放在一起看。</p></div><BarChart3 size={22} /></div>
          <div className="cf-analytics-progress"><strong>{progress?.totalChapters ? Math.round((progress.committedChapters / progress.totalChapters) * 100) : 0}%</strong><progress max={100} value={progress?.totalChapters ? (progress.committedChapters / progress.totalChapters) * 100 : 0} /></div>
          {quality.isPending ? <p role="status">正在检查作品…</p> : quality.isError ? <ErrorNote error={quality.error} /> : quality.data ? <div className="cf-quality-mini"><span>质量评分</span><b>{quality.data.score}</b><em>{quality.data.readiness === "ready" ? "可导出" : quality.data.readiness === "needs_attention" ? "建议处理" : "有阻塞项"}</em></div> : null}
          {quality.data?.metrics && Object.keys(quality.data.metrics).length ? <dl className="cf-analytics-list">{Object.entries(quality.data.metrics).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value.toLocaleString()}</dd></div>)}</dl> : null}
        </section>
        <section className="cf-card">
          <div className="cf-section-title"><div><h2>平台记录汇总</h2><p>记录来自你手工发布后的 CSV，不会自动上传或登录第三方平台。</p></div><RefreshCw size={22} /></div>
          {remoteMetrics.isError ? <ErrorNote error={remoteMetrics.error} title="平台记录同步失败" /> : null}
          <div className="cf-analytics-platform-summary"><MetricCard label="阅读" value={importedSummary.views.toLocaleString()} note="views" /><MetricCard label="点赞" value={importedSummary.likes.toLocaleString()} note="likes" /><MetricCard label="评论" value={importedSummary.comments.toLocaleString()} note="comments" /></div>
          {metricReport.isError ? <ErrorNote error={metricReport.error} title="复盘口径读取失败" /> : metricReport.isPending ? <p role="status">正在读取复盘口径…</p> : metricReport.data ? <div className="cf-analytics-provenance" role="note"><strong>{metricReport.data.sourceLabel}</strong><span>日期口径：{metricReport.data.timezone}</span><span>样本：{metricReport.data.viewSampleCount} 条带阅读量记录 / 建议至少 {metricReport.data.minimumRecommendedSamples} 条 · {metricReport.data.sampleSufficient ? "达到建议样本量" : "样本不足，结论仅供参考"}</span><span>覆盖：{metricReport.data.dateFrom ?? "—"} 至 {metricReport.data.dateTo ?? "—"} · {metricReport.data.recordedDays} 个有记录日期 · 空档 {metricReport.data.missingDays} 天</span><small>{metricReport.data.sampleNote} · 最近导入 {metricReport.data.latestImportAt ? new Date(metricReport.data.latestImportAt).toLocaleString("zh-CN") : "尚无服务端导入"}</small><details><summary>指标口径</summary><ul>{Object.entries(metricReport.data.metricDefinitions).map(([key, value]) => <li key={key}><strong>{key}</strong>：{value}</li>)}</ul></details></div> : null}
          {effectivePlatformMetrics.length ? <div className="cf-analytics-meta"><span>数据更新时间：{latestMetricUpdatedAt ? new Date(latestMetricUpdatedAt).toLocaleString("zh-CN") : "本机导入记录"}</span><span>覆盖：{metricCoverage.from} 至 {metricCoverage.to} · {metricCoverage.days} 个有记录日期</span>{metricCoverage.missingDays ? <strong>区间内缺少 {metricCoverage.missingDays} 天记录；空档不会补零。</strong> : null}</div> : null}
          {effectivePlatformMetrics.length ? <div className="cf-analytics-table-wrap"><table className="cf-analytics-table"><thead><tr><th>平台</th><th>章节</th><th>日期</th><th>阅读</th><th>点赞</th></tr></thead><tbody>{effectivePlatformMetrics.slice(-12).reverse().map((row) => <tr key={row.id}><td>{row.platform}</td><td>{row.chapter}</td><td>{row.date}</td><td>{row.views ?? "—"}</td><td>{row.likes ?? "—"}</td></tr>)}</tbody></table></div> : <div className="cf-empty cf-analytics-empty"><BarChart3 size={34} /><p>还没有平台数据。发布后导入 CSV，就能看到真实变化。</p></div>}
        </section>
      </div>
      <section className="cf-card cf-analytics-trend">
        <div className="cf-section-title"><div><h2>平台趋势</h2><p>按 CSV 中的发布日期汇总，不做时区换算；没有记录的日期不会补零。</p></div><div className="cf-actions"><label>范围<select aria-label="趋势范围" value={trendRange} onChange={(event) => setTrendRange(Number(event.target.value) as TrendRange)}><option value={7}>近 7 个周期</option><option value={30}>近 30 个周期</option><option value={90}>近 90 个周期</option></select></label><label>汇总<select aria-label="趋势汇总方式" value={trendGrouping} onChange={(event) => setTrendGrouping(event.target.value as TrendGrouping)}><option value="day">按日</option><option value="week">按周</option><option value="month">按月</option></select></label><RefreshCw size={22} /></div></div>
        {dailyTrend.length ? <div className="cf-trend-list">{dailyTrend.map((point) => { const max = Math.max(...dailyTrend.map((item) => item.views), 1); return <div className="cf-trend-row" key={point.date}><time>{point.date}</time><div className="cf-trend-bar"><span style={{ width: `${Math.round((point.views / max) * 100)}%` }} /></div><strong>{point.views.toLocaleString()}</strong><small>阅读 · {point.likes.toLocaleString()} 赞 · {point.comments.toLocaleString()} 评</small></div>; })}</div> : <div className="cf-empty cf-analytics-empty"><BarChart3 size={34} /><p>导入至少一条平台记录后，这里会按日期显示真实趋势。</p></div>}
      </section>
      <section className="cf-card cf-analytics-trend">
        <div className="cf-section-title"><div><h2>质量趋势</h2><p>只使用已经保存的章节检查报告；没有检查记录时不补造分数。</p></div><RefreshCw size={22} /></div>
        {reviews.isError ? <ErrorNote error={reviews.error} title="检查报告读取失败" /> : null}
        {qualityTrend.length ? <div className="cf-quality-trend-list">{qualityTrend.map((point) => <div className="cf-quality-trend-row" key={point.period}><time>{point.period}</time><strong>{point.averageScore} 分</strong><span>{point.reportCount} 次检查 · 通过 {point.passCount} · 需修改 {point.reviseCount} · 阻塞 {point.blockCount}</span><div className="cf-trend-bar"><span style={{ width: `${point.averageScore}%` }} /></div></div>)}</div> : <div className="cf-empty cf-analytics-empty"><BarChart3 size={34} /><p>{reviews.isPending ? "正在读取检查报告…" : "完成一次章节检查后，这里会显示质量分的真实变化。"}</p></div>}
      </section>
      <section className="cf-card cf-analytics-evidence">
        <div className="cf-section-title"><div><h2>章节与平台证据</h2><p>把平台记录按章节绑定回正文和前三章体检；无法可靠匹配的记录会单独列出，不会猜测章节。</p></div><BarChart3 size={22} /></div>
        {chapterEvidence.rows.length ? <div className="cf-analytics-evidence-list">{chapterEvidence.rows.map((row) => <article className="cf-analytics-evidence-row" key={row.documentId}><div><div className="cf-issue-heading"><strong>{row.title}</strong>{row.isOpening ? <span className="cf-badge">前三章</span> : null}</div><small>{row.recordCount} 条平台记录 · {row.platforms.join("、") || "未标注平台"}</small><p>{row.firstDate} → {row.latestDate} · 阅读 {row.firstViews === null ? "—" : row.firstViews.toLocaleString()} → {row.latestViews === null ? "—" : row.latestViews.toLocaleString()}{row.viewsDelta === null ? "" : `（${row.viewsDelta >= 0 ? "+" : ""}${row.viewsDelta.toLocaleString()}）`} · 累计 {row.totalViews.toLocaleString()}</p>{row.latestReview ? <small>最近检查：{row.latestReview.verdict === "pass" ? "通过" : row.latestReview.verdict === "revise" ? "需修改" : "阻塞"} · {reviewScore(row.latestReview)} 分 · 报告于 {new Date(row.latestReview.createdAt).toLocaleString("zh-CN")} · {row.openIssueCount ? `待处理问题 ${row.openIssueCount} 条` : "没有待处理问题"}</small> : <small>尚无对应正文检查报告</small>}{row.latestReview && row.issueCategories.length ? <small>问题类型：{row.issueCategories.map((category) => `${category}（${row.issueStatusCounts.openByCategory[category] ?? 0} 待处理）`).join("、")}；已处理 {row.issueStatusCounts.resolved + row.issueStatusCounts.accepted + row.issueStatusCounts.rejected} 条</small> : null}{row.openingCheckIssues.length ? <div className="cf-analytics-opening-issues"><small>前三章体检（{row.openingCheckGeneratedAt ? new Date(row.openingCheckGeneratedAt).toLocaleString("zh-CN") : ""}）</small>{row.openingCheckIssues.map((issue) => <small key={issue.id}>· {issue.title} · {issue.status === "open" ? "待处理" : issue.status === "resolved" ? "已处理" : "已忽略"}：{issue.evidence}</small>)}</div> : row.isOpening ? <small>尚无对应前三章体检问题记录</small> : null}</div><div className="cf-actions"><Link className="cf-text-link" to={`/books/${projectId}/write/${encodeURIComponent(row.documentId)}`}>打开正文</Link>{row.outlineNodeId ? <Link className="cf-text-link" to={`/books/${projectId}/advanced?tool=web-novel&chapter=${encodeURIComponent(row.outlineNodeId)}`}>打开简报</Link> : null}{row.latestReview && row.openIssueCount ? <Link className="cf-text-link" to={`/books/${projectId}/write/${encodeURIComponent(row.documentId)}?tab=review`}>处理问题</Link> : null}{row.isOpening ? <Link className="cf-text-link" to={`/books/${projectId}/advanced?tool=web-novel&chapter=${encodeURIComponent(row.outlineNodeId ?? "")}&check=1`}>打开体检</Link> : null}</div></article>)}</div> : <div className="cf-empty"><BarChart3 size={34} /><p>暂时没有能同时对应正文和平台记录的章节。</p></div>}
        {openingChecks.isError ? <p className="cf-analytics-meta">前三章体检历史暂时无法读取，平台数据仍保留；恢复连接后可重新查看问题联动。</p> : null}
        {chapterEvidence.unmatchedCount ? <p className="cf-analytics-meta">还有 {chapterEvidence.unmatchedCount} 条记录无法按章节标题可靠匹配；请统一 CSV 的章节列后重新导入。</p> : null}
      </section>
      <section className="cf-card cf-analytics-evidence cf-analytics-publication-evidence">
        <div className="cf-section-title"><div><h2>发布与导出证据链</h2><p>把手工发布记录、导出批次和平台指标放在同一条可回读链路里；章节范围或平台名称无法精确对应时会明确标记未关联。</p></div><BarChart3 size={22} /></div>
        {publishRecords.isError ? <ErrorNote error={publishRecords.error} title="发布记录读取失败" /> : null}
        {exportBatches.isError ? <ErrorNote error={exportBatches.error} title="导出批次读取失败" /> : null}
        {publishRecords.isPending || exportBatches.isPending ? <p role="status">正在读取发布证据…</p> : publicationEvidence.length ? <div className="cf-analytics-evidence-list">{publicationEvidence.map((item) => <article className="cf-analytics-evidence-row" key={item.record.id}><div><div className="cf-issue-heading"><strong>{item.record.platform} · {item.record.chapter}</strong><span className={`cf-badge ${item.record.status === "published" ? "cf-authority-confirmed" : "cf-authority-inferred"}`}>{item.record.status === "published" ? "已发布" : item.record.status === "scheduled" ? "已排期" : "待发布"}</span></div><small>手工记录于 {item.record.publishedAt}{item.record.url ? <> · <a href={item.record.url} target="_blank" rel="noreferrer">打开外部链接</a></> : null}</small>{item.batch ? <small>导出批次：{item.batch.status === "completed" ? "已完成" : "失败"} · {item.batch.format} · {item.batch.filename} · {item.batch.contentHash.slice(0, 16)}…{item.batch.retryOfBatchId ? ` · 重试自 ${item.batch.retryOfBatchId.slice(0, 8)}` : ""}</small> : <small>未关联导出批次</small>}{item.metrics.length ? <small>平台指标：{item.metrics.length} 条 · {item.metrics[0]?.date} → {item.metrics.at(-1)?.date} · 阅读 {item.metrics.reduce((sum, metric) => sum + (metric.views ?? 0), 0).toLocaleString()}</small> : <small className="cf-muted">未按平台/章节精确匹配平台指标；不会推断发布效果</small>}</div></article>)}</div> : <div className="cf-empty"><BarChart3 size={34} /><p>{publishRecords.isPending ? "正在读取发布记录…" : "还没有手工发布记录；保存发布记录后，这里会显示导出与平台指标的证据链。"}</p></div>}
        {publicationEvidence.some((item) => !item.metrics.length || !item.batch) ? <p className="cf-analytics-meta">部分链路仍未关联：平台指标使用不区分大小写的平台/章节精确匹配；发布记录里的范围文本、缺失批次或离线记录需要作者补充后才能形成完整证据。</p> : null}
      </section>
      <section className="cf-card cf-analytics-import-audits">
        <div className="cf-section-title"><div><h2>平台导入审计</h2><p>每次 CSV 导入都会记录来源摘要和变更数量；回滚前会检查数据是否被后续导入改动。</p></div><RefreshCw size={22} /></div>
        {importAudits.isError ? <ErrorNote error={importAudits.error} title="导入审计读取失败" /> : importAudits.isPending ? <p role="status">正在读取导入审计…</p> : importAudits.data?.length ? <div className="cf-analytics-import-audit-list">{importAudits.data.map((audit) => <article className="cf-analytics-import-audit-row" key={audit.id}><div><div className="cf-issue-heading"><strong>{audit.status === "active" ? "生效中的导入" : "已回滚的导入"}</strong><span className={`cf-badge ${audit.status === "active" ? "cf-authority-confirmed" : "cf-authority-inferred"}`}>{audit.status === "active" ? "可回滚" : "已回滚"}</span></div><p>{new Date(audit.createdAt).toLocaleString("zh-CN")} · 文件 {audit.sourceRows} 行 · 去重 {audit.duplicateRows} · 新增 {audit.addedCount} · 更新 {audit.replacedCount}</p><small>来源 SHA-256：{audit.sourceHash}</small>{audit.rolledBackAt ? <small>回滚于 {new Date(audit.rolledBackAt).toLocaleString("zh-CN")}</small> : null}</div>{audit.status === "active" ? <button type="button" className="cf-text-danger" disabled={rollbackMutation.isPending} onClick={() => setRollbackTarget(audit)}>回滚这次导入</button> : null}</article>)}</div> : <p className="cf-empty">还没有服务端导入审计。服务端恢复后，下一次 CSV 导入会开始记录可回滚批次。</p>}
      </section>
      <section className="cf-card cf-analytics-insights">
        <div className="cf-section-title">
          <div>
            <h2>异常与下一步</h2>
            <p>只根据已有平台记录解释变化；日期空档和缺失字段不会被当成零值。</p>
          </div>
          <RefreshCw size={22} />
        </div>
        {metricInsights.length ? (
          <ul className="cf-analytics-insight-list">
            {metricInsights.map((insight) => (
              <li key={`${insight.kind}-${insight.title}`} className={`is-${insight.severity}`}>
                <strong>{insight.title}</strong>
                <span>{insight.detail}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="cf-empty">至少导入三条带阅读量的记录后，这里会提示明显的趋势变化。</p>
        )}
        <div className="cf-actions">
          <Link className="cf-button" to={`/books/${projectId}/write?tab=review`}>回到检查工作台</Link>
          <Link className="cf-button" to={`/books/${projectId}/advanced?tool=web-novel`}>打开前三章体检</Link>
          <Link className="cf-button" to={`/books/${projectId}/publish`}>查看发布记录</Link>
        </div>
      </section>
      {rollbackTarget ? <ConfirmDialog title="回滚这次平台数据导入？" confirmLabel="确认回滚" danger pending={rollbackMutation.isPending} onCancel={() => setRollbackTarget(null)} onConfirm={() => rollbackMutation.mutate(rollbackTarget)}><p>这会撤销该批次写入的新增和更新记录。若这些记录已经被后续导入改动，系统会拒绝回滚并保留现状。</p><p className="cf-muted">来源摘要：{rollbackTarget.sourceHash.slice(0, 16)}… · 新增 {rollbackTarget.addedCount} · 更新 {rollbackTarget.replacedCount}</p></ConfirmDialog> : null}
    </div>
  );
}

function MetricCard({ label, value, note }: { label: string; value: string | number; note: string }) {
  return <article className="cf-card cf-metric-card"><span>{label}</span><strong>{value}</strong><small>{note}</small></article>;
}

export type AuthoringDerivedMetrics = {
  activeDays: number;
  spanDays: number;
  stabilityRate: number | null;
  averageIntervalDays: number | null;
  currentStreakDays: number;
  longestGapDays: number;
  targetWordsPerChapter: number | null;
  targetCompletionRate: number | null;
};

/**
 * 只从作品自身的保存时间和进度计算作者节奏，避免把平台阅读量误当成
 * 创作事实。日期以 updatedAt 的 ISO 日期部分为准，因而同一自然日只记一次。
 */
export function deriveAuthoringMetrics(
  chapters: readonly Pick<StoryDocument, "updatedAt">[],
  wordCount: number,
  committedChapters: number,
  targetWordsPerChapter: number | null,
  lastWritingAt: string | null = null,
): AuthoringDerivedMetrics {
  const days = new Set(
    chapters
      .map((chapter) => isoDay(chapter.updatedAt))
      .filter((day): day is string => Boolean(day)),
  );
  const lastDay = isoDay(lastWritingAt);
  if (lastDay) days.add(lastDay);
  const ordered = [...days].sort();
  const activeDays = ordered.length;
  const spanDays = activeDays > 1 ? dayDistance(ordered[0]!, ordered.at(-1)!) + 1 : activeDays;
  const gaps = ordered.slice(1).map((day, index) => dayDistance(ordered[index]!, day));
  const averageIntervalDays = gaps.length
    ? roundMetric(gaps.reduce((sum, value) => sum + value, 0) / gaps.length)
    : null;
  const longestGapDays = gaps.length ? Math.max(...gaps.map((gap) => Math.max(0, gap - 1))) : 0;
  let currentStreakDays = 0;
  if (ordered.length) {
    currentStreakDays = 1;
    for (let index = ordered.length - 1; index > 0; index -= 1) {
      if (dayDistance(ordered[index - 1]!, ordered[index]!) !== 1) break;
      currentStreakDays += 1;
    }
  }
  const target = typeof targetWordsPerChapter === "number" && targetWordsPerChapter > 0
    ? targetWordsPerChapter
    : null;
  const targetCompletionRate = target && committedChapters > 0
    ? Math.round((Math.max(0, wordCount) / (target * committedChapters)) * 100)
    : null;
  return {
    activeDays,
    spanDays,
    stabilityRate: spanDays > 0 ? Math.round((activeDays / spanDays) * 100) : null,
    averageIntervalDays,
    currentStreakDays,
    longestGapDays,
    targetWordsPerChapter: target,
    targetCompletionRate,
  };
}

function isoDay(value: string | null | undefined): string | null {
  if (!value) return null;
  const day = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/u.test(day) ? day : null;
}

function dayDistance(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  return Number.isFinite(start) && Number.isFinite(end)
    ? Math.max(0, Math.round((end - start) / 86_400_000))
    : 0;
}

function roundMetric(value: number): number {
  return Math.round(value * 10) / 10;
}

function readMetrics(projectId: string): PlatformMetric[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(metricStorageKey(projectId)) ?? "[]") as unknown;
    return Array.isArray(value) ? value.filter(isPlatformMetric) : [];
  } catch {
    return [];
  }
}

function isPlatformMetric(value: unknown): value is PlatformMetric {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<PlatformMetric>;
  return typeof row.id === "string" && typeof row.platform === "string" && typeof row.chapter === "string" && typeof row.date === "string" && typeof row.words === "number";
}

function toMetricInput(record: PlatformMetric): Omit<PlatformMetricDto, "id" | "projectId" | "updatedAt"> {
  return {
    platform: record.platform,
    chapter: record.chapter,
    date: record.date,
    words: record.words,
    views: record.views,
    likes: record.likes,
    comments: record.comments,
    source: "csv",
  };
}

function toLocalMetric(record: PlatformMetricDto): PlatformMetric {
  return {
    id: record.id,
    platform: record.platform,
    chapter: record.chapter,
    date: record.date,
    words: record.words,
    views: record.views,
    likes: record.likes,
    comments: record.comments,
    updatedAt: record.updatedAt,
  };
}

function getMetricCoverage(records: PlatformMetric[]): {
  from: string;
  to: string;
  days: number;
  missingDays: number;
} {
  const dates = [...new Set(records.map((record) => record.date))].sort();
  if (!dates.length) return { from: "—", to: "—", days: 0, missingDays: 0 };
  const start = new Date(`${dates[0]}T00:00:00Z`).valueOf();
  const end = new Date(`${dates.at(-1)}T00:00:00Z`).valueOf();
  const span = Math.max(0, Math.round((end - start) / 86_400_000) + 1);
  return { from: dates[0]!, to: dates.at(-1)!, days: dates.length, missingDays: Math.max(0, span - dates.length) };
}

export type MetricInsight = {
  kind: "coverage" | "drop" | "spike" | "missing" | "platform";
  severity: "info" | "warning";
  title: string;
  detail: string;
};

export type ChapterMetricEvidence = {
  documentId: string;
  outlineNodeId: string | null;
  title: string;
  isOpening: boolean;
  recordCount: number;
  totalViews: number;
  firstDate: string;
  firstViews: number | null;
  latestViews: number | null;
  latestDate: string;
  viewsDelta: number | null;
  platforms: string[];
  latestReview: ReviewWorkspaceReport | null;
  openIssueCount: number;
  issueCategories: string[];
  issueStatusCounts: {
    open: number;
    accepted: number;
    rejected: number;
    resolved: number;
    openByCategory: Record<string, number>;
  };
  openingCheckGeneratedAt: string | null;
  openingCheckIssues: Array<{
    id: string;
    title: string;
    evidence: string;
    status: "open" | "ignored" | "resolved";
    reportId: string;
  }>;
};

export function buildChapterMetricEvidence(
  records: readonly PlatformMetric[],
  documents: readonly StoryDocument[],
  reports: readonly ReviewWorkspaceReport[],
  openingReports: readonly OpeningThreeCheckReport[] = [],
): { rows: ChapterMetricEvidence[]; unmatchedCount: number } {
  const chapterDocuments = documents.filter(
    (document) =>
      Boolean(document.outlineNodeId) &&
      (document.kind === "chapter" || document.kind === "manuscript"),
  );
  const openingIds = new Set(
    chapterDocuments.slice(0, 3).map((document) => document.id),
  );
  const byDocument = new Map<string, PlatformMetric[]>();
  let unmatchedCount = 0;
  for (const record of records) {
    const document = chapterDocuments.find((candidate) =>
      sameChapterLabel(record.chapter, candidate.title),
    );
    if (!document) {
      unmatchedCount += 1;
      continue;
    }
    const bucket = byDocument.get(document.id) ?? [];
    bucket.push(record);
    byDocument.set(document.id, bucket);
  }
  const rows = chapterDocuments
    .map((document) => {
      const linked = byDocument.get(document.id) ?? [];
      if (!linked.length) return null;
      const sorted = [...linked].sort((a, b) => a.date.localeCompare(b.date));
      const first = sorted[0]!;
      const latest = sorted.at(-1)!;
      const review = [...reports]
        .filter((report) => report.documentId === document.id)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .at(-1) ?? null;
      const issueStatusCounts = summarizeIssueStatuses(review?.issues ?? []);
      const latestOpeningReport = [...openingReports]
        .filter((report) => report.chapterIds.includes(document.outlineNodeId ?? ""))
        .sort((a, b) => a.generatedAt.localeCompare(b.generatedAt))
        .at(-1) ?? null;
      const openingCheckIssues = latestOpeningReport?.issues
        .filter((issue) => issue.targetChapterId === document.outlineNodeId)
        .map((issue) => ({
          id: issue.id,
          title: issue.title,
          evidence: issue.evidence,
          status: issue.status,
          reportId: latestOpeningReport.id,
        })) ?? [];
      return {
        documentId: document.id,
        outlineNodeId: document.outlineNodeId,
        title: document.title,
        isOpening: openingIds.has(document.id),
        recordCount: linked.length,
        totalViews: linked.reduce((sum, item) => sum + (item.views ?? 0), 0),
        firstDate: first.date,
        firstViews: first.views,
        latestViews: latest.views,
        latestDate: latest.date,
        viewsDelta: first.views !== null && latest.views !== null ? latest.views - first.views : null,
        platforms: [...new Set(linked.map((item) => item.platform))],
        latestReview: review,
        openIssueCount: issueStatusCounts.open,
        issueCategories: [...new Set((review?.issues ?? []).map((issue) => issue.category))],
        issueStatusCounts,
        openingCheckGeneratedAt: latestOpeningReport?.generatedAt ?? null,
        openingCheckIssues,
      } satisfies ChapterMetricEvidence;
    })
    .filter((row): row is ChapterMetricEvidence => Boolean(row));
  return { rows, unmatchedCount };
}

export type PublicationMetricEvidence = {
  record: PublishRecordDto;
  batch: ExportBatchDto | null;
  metrics: PlatformMetric[];
};

/**
 * Joins the author's manual publication ledger to export history and imported
 * platform rows. The join is deliberately exact after case/whitespace
 * normalization: a range such as "第 1—3 章" must remain visibly unlinked
 * instead of being mistaken for three individual chapters.
 */
export function buildPublicationMetricEvidence(
  metrics: readonly PlatformMetric[],
  publishRecords: readonly PublishRecordDto[],
  exportBatches: readonly ExportBatchDto[],
): PublicationMetricEvidence[] {
  const byKey = new Map<string, PlatformMetric[]>();
  for (const metric of metrics) {
    const key = publicationMetricKey(metric.platform, metric.chapter);
    const bucket = byKey.get(key) ?? [];
    bucket.push(metric);
    byKey.set(key, bucket);
  }
  const batches = new Map(exportBatches.map((batch) => [batch.id, batch]));
  return [...publishRecords]
    .sort((left, right) => `${right.publishedAt}:${right.createdAt}`.localeCompare(`${left.publishedAt}:${left.createdAt}`))
    .map((record) => ({
      record,
      batch: record.exportBatchId ? batches.get(record.exportBatchId) ?? null : null,
      metrics: [...(byKey.get(publicationMetricKey(record.platform, record.chapter)) ?? [])].sort((left, right) => left.date.localeCompare(right.date)),
    }));
}

function publicationMetricKey(platform: string, chapter: string): string {
  return `${platform.trim().toLocaleLowerCase()}\u0000${chapter.trim().replace(/\s+/gu, " ").toLocaleLowerCase()}`;
}

function summarizeIssueStatuses(issues: ReviewWorkspaceReport["issues"]): ChapterMetricEvidence["issueStatusCounts"] {
  const counts: ChapterMetricEvidence["issueStatusCounts"] = {
    open: 0,
    accepted: 0,
    rejected: 0,
    resolved: 0,
    openByCategory: {},
  };
  for (const issue of issues) {
    counts[issue.status] += 1;
    if (issue.status === "open") counts.openByCategory[issue.category] = (counts.openByCategory[issue.category] ?? 0) + 1;
  }
  return counts;
}

function sameChapterLabel(metricLabel: string, documentTitle: string): boolean {
  const normalize = (value: string) =>
    value.trim().toLocaleLowerCase().replace(/[\s:：·—–-]+/gu, "");
  const metric = normalize(metricLabel);
  const title = normalize(documentTitle);
  return metric === title || metric === title.replace(/正文$/u, "");
}

function reviewScore(report: ReviewWorkspaceReport): number {
  const values = Object.values(report.scores).filter((value) => Number.isFinite(value));
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
}

export function buildMetricInsights(
  records: readonly PlatformMetric[],
): MetricInsight[] {
  if (!records.length) return [];
  const insights: MetricInsight[] = [];
  const coverage = getMetricCoverage([...records]);
  if (coverage.missingDays > 0) {
    insights.push({
      kind: "coverage",
      severity: "warning",
      title: "数据区间有空档",
      detail: `${coverage.from} 至 ${coverage.to} 共有 ${coverage.missingDays} 天没有记录，趋势没有用零值填补。`,
    });
  }
  const missingViews = records.filter((record) => record.views === null).length;
  if (missingViews > 0) {
    insights.push({
      kind: "missing",
      severity: "info",
      title: "部分记录缺少阅读量",
      detail: `${missingViews} 条记录只有字数或互动数据，暂不参与阅读趋势比较。`,
    });
  }
  const dates = [...new Set(records.map((record) => record.date))].sort();
  const current = averageViews(records, dates.slice(-3));
  const previous = averageViews(records, dates.slice(-6, -3));
  if (current !== null && previous !== null && previous > 0) {
    const ratio = current / previous;
    if (ratio <= 0.6) {
      insights.push({
        kind: "drop",
        severity: "warning",
        title: "最近阅读量明显下降",
        detail: `最近三条有阅读量的日期平均 ${Math.round(current).toLocaleString()}，比前一组三条日期低 ${Math.round((1 - ratio) * 100)}%。建议结合章节检查和发布记录核对原因。`,
      });
    } else if (ratio >= 1.8) {
      insights.push({
        kind: "spike",
        severity: "info",
        title: "最近阅读量明显上升",
        detail: `最近三条有阅读量的日期平均 ${Math.round(current).toLocaleString()}，约为前一组三条日期的 ${ratio.toFixed(1)} 倍。可以回看对应章节和发布节点。`,
      });
    }
  }
  const platformTotals = new Map<string, number>();
  for (const record of records) {
    platformTotals.set(
      record.platform,
      (platformTotals.get(record.platform) ?? 0) + (record.views ?? 0),
    );
  }
  const [topPlatform, topViews] = [...platformTotals.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
  if (topPlatform && topViews !== undefined && platformTotals.size > 1) {
    insights.push({
      kind: "platform",
      severity: "info",
      title: `${topPlatform} 是当前主要阅读来源`,
      detail: `已记录阅读量 ${topViews.toLocaleString()}，可优先在发布记录中补齐该平台的章节和日期。`,
    });
  }
  return insights.slice(0, 5);
}

function averageViews(records: readonly PlatformMetric[], dates: string[]): number | null {
  const values = records
    .filter((record) => dates.includes(record.date) && record.views !== null)
    .map((record) => record.views as number);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export type PlatformMetricCsvImport = {
  records: PlatformMetric[];
  sourceRows: number;
  duplicateRows: number;
  errors: PlatformMetricCsvIssue[];
};

export type PlatformMetricCsvIssue = {
  line: number;
  row: string[];
  message: string;
};

type MetricField = "platform" | "chapter" | "date" | "words" | "views" | "likes" | "comments";

const CSV_FIELD_ALIASES: Record<MetricField, string[]> = {
  platform: ["platform", "平台", "发布平台"],
  chapter: ["chapter", "章节", "章节或范围", "chapter_or_range"],
  date: ["date", "日期", "发布日期", "published_at"],
  words: ["words", "字数", "正文总字数"],
  views: ["views", "阅读", "阅读量", "浏览", "浏览量"],
  likes: ["likes", "点赞", "点赞数"],
  comments: ["comments", "评论", "评论数"],
};

export function parsePlatformMetricsCsv(text: string): PlatformMetricCsvImport {
  const result = parsePlatformMetricsCsvDetailed(text);
  if (result.errors.length) throw new Error(result.errors[0]!.message);
  return result;
}

export function parsePlatformMetricsCsvDetailed(text: string): PlatformMetricCsvImport {
  const rows = splitCsvRows(text);
  if (rows.length < 2) throw new Error("CSV 至少需要一行表头和一条记录。");
  const headers = rows[0]!.map(normalizeCsvHeader);
  const indexes = Object.fromEntries(
    (Object.keys(CSV_FIELD_ALIASES) as MetricField[]).map((field) => [field, findHeaderIndex(headers, field)]),
  ) as Record<MetricField, number>;
  for (const required of ["platform", "chapter", "date"] as const) {
    if (indexes[required] < 0) throw new Error(`CSV 缺少必填列：${CSV_FIELD_ALIASES[required][0]}。`);
  }

  const sourceRows = rows.slice(1).filter((row) => row.some((cell) => cell.trim().length > 0));
  const byKey = new Map<string, PlatformMetric>();
  const errors: PlatformMetricCsvIssue[] = [];
  let duplicateRows = 0;
  sourceRows.forEach((row, rowIndex) => {
    const line = rowIndex + 2;
    try {
      if (row.length > headers.length) throw new Error(`CSV 第 ${line} 行多出未声明的列。`);
      const platform = requiredCell(row, indexes.platform, line, "平台");
      const chapter = requiredCell(row, indexes.chapter, line, "章节");
      const date = normalizeMetricDate(requiredCell(row, indexes.date, line, "日期"), line);
      const metric: PlatformMetric = {
        id: stableMetricId(metricKey({ platform, chapter, date })),
        platform,
        chapter,
        date,
        words: parseMetricNumber(row, indexes.words, line, "字数") ?? 0,
        views: parseMetricNumber(row, indexes.views, line, "阅读量"),
        likes: parseMetricNumber(row, indexes.likes, line, "点赞数"),
        comments: parseMetricNumber(row, indexes.comments, line, "评论数"),
      };
      const key = metricKey(metric);
      if (byKey.has(key)) duplicateRows += 1;
      byKey.set(key, metric);
    } catch (error) {
      errors.push({ line, row, message: error instanceof Error ? error.message : `CSV 第 ${line} 行无法解析。` });
    }
  });
  return { records: [...byKey.values()], sourceRows: sourceRows.length, duplicateRows, errors };
}

export function mergePlatformMetrics(
  existing: PlatformMetric[],
  incoming: PlatformMetric[],
): { records: PlatformMetric[]; added: number; replaced: number } {
  const byKey = new Map(existing.map((record) => [metricKey(record), record]));
  let added = 0;
  let replaced = 0;
  for (const record of incoming) {
    const key = metricKey(record);
    const previous = byKey.get(key);
    if (previous) {
      byKey.set(key, { ...record, id: previous.id });
      replaced += 1;
    } else {
      byKey.set(key, record);
      added += 1;
    }
  }
  return { records: [...byKey.values()], added, replaced };
}

function normalizeCsvHeader(value: string): string {
  return value.replace(/^\uFEFF/u, "").trim().toLowerCase().replace(/[\s-]+/gu, "_");
}

function findHeaderIndex(headers: string[], field: MetricField): number {
  const aliases = CSV_FIELD_ALIASES[field].map((alias) => normalizeCsvHeader(alias));
  return headers.findIndex((header) => aliases.includes(header));
}

function requiredCell(row: string[], index: number, line: number, label: string): string {
  const value = (index >= 0 ? row[index] : "")?.trim() ?? "";
  if (!value) throw new Error(`CSV 第 ${line} 行缺少${label}。`);
  return value;
}

function parseMetricNumber(row: string[], index: number, line: number, label: string): number | null {
  if (index < 0 || !row[index]?.trim()) return null;
  const value = Number(row[index]);
  if (!Number.isInteger(value) || value < 0) throw new Error(`CSV 第 ${line} 行的${label}不是有效的非负整数。`);
  return value;
}

function normalizeMetricDate(value: string, line: number): string {
  const normalized = value.replaceAll("/", "-");
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(normalized)) throw new Error(`CSV 第 ${line} 行的日期必须是 YYYY-MM-DD。`);
  const parsed = new Date(`${normalized}T00:00:00Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== normalized) throw new Error(`CSV 第 ${line} 行的日期无效。`);
  return normalized;
}

function metricKey(record: Pick<PlatformMetric, "platform" | "chapter" | "date">): string {
  return `${record.platform.trim().toLocaleLowerCase()}\u0000${record.chapter.trim().toLocaleLowerCase()}\u0000${record.date}`;
}

function stableMetricId(key: string): string {
  let hash = 2166136261;
  for (const char of key) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return `metric-${(hash >>> 0).toString(36)}`;
}

function splitCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === "," && !quoted) {
      row.push(value.trim());
      value = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value.trim());
      value = "";
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      continue;
    }
    value += char;
  }
  if (quoted) throw new Error("CSV 引号未闭合。");
  row.push(value.trim());
  if (row.some((cell) => cell.length > 0)) rows.push(row);
  return rows;
}

function csvCell(value: string | number) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function downloadMetricErrors(errors: PlatformMetricCsvIssue[], title: string) {
  const rows = ["line,error,row", ...errors.map((issue) => [issue.line, issue.message, issue.row.join(",")].map(csvCell).join(","))];
  const blob = new Blob([`\uFEFF${rows.join("\n")}\n`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${title}-metrics-errors.csv`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function trendPeriod(date: string, grouping: TrendGrouping): string {
  if (grouping === "day") return date;
  if (grouping === "month") return date.slice(0, 7);
  const day = new Date(`${date}T00:00:00Z`);
  const weekday = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() - weekday + 1);
  return day.toISOString().slice(0, 10);
}

export type QualityTrendPoint = {
  period: string;
  averageScore: number;
  reportCount: number;
  passCount: number;
  reviseCount: number;
  blockCount: number;
};

export function buildQualityTrend(
  reports: readonly Pick<ReviewWorkspaceReport, "createdAt" | "scores" | "verdict">[],
  grouping: TrendGrouping,
  range: TrendRange,
): QualityTrendPoint[] {
  const periods = new Map<string, Omit<QualityTrendPoint, "period" | "averageScore"> & { scoreTotal: number; scoreCount: number }>();
  for (const report of reports) {
    const scores = Object.values(report.scores).filter((score) => Number.isFinite(score));
    if (!scores.length) continue;
    const period = trendPeriod(report.createdAt.slice(0, 10), grouping);
    const current = periods.get(period) ?? { reportCount: 0, passCount: 0, reviseCount: 0, blockCount: 0, scoreTotal: 0, scoreCount: 0 };
    current.reportCount += 1;
    current.scoreTotal += scores.reduce((sum, score) => sum + score, 0) / scores.length;
    current.scoreCount += 1;
    if (report.verdict === "pass") current.passCount += 1;
    if (report.verdict === "revise") current.reviseCount += 1;
    if (report.verdict === "block") current.blockCount += 1;
    periods.set(period, current);
  }
  return [...periods.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-range)
    .map(([period, point]) => ({
      period,
      averageScore: Math.round(point.scoreTotal / point.scoreCount),
      reportCount: point.reportCount,
      passCount: point.passCount,
      reviseCount: point.reviseCount,
      blockCount: point.blockCount,
    }));
}
