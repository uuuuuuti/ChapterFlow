import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { Archive, CheckCircle2, Download, FileDown, Plus, ShieldCheck, Trash2 } from "lucide-react";
import JSZip from "jszip";
import { useProjectOverview, useStory } from "../../entities/project/queries";
import { createProjectBackup, getProjectBackups, getProjectExport, getProjectQuality, restoreProjectBackup } from "../../shared/api/delivery";
import { createPublishRecord, deletePublishRecord, getExportBatches, getPublishRecords, updatePublishRecord } from "../../shared/api/web-novel";
import { ErrorNote, ConfirmDialog, ResourceErrorState } from "../../shared/ui";
import { queryKeys } from "../../shared/query/keys";
import type { ExportFormat, ProjectBackup, PublishRecordDto } from "../../shared/api/types";

type PublishRecord = {
  id: string;
  platform: string;
  chapter: string;
  publishedAt: string;
  url: string;
  status: "published" | "scheduled" | "draft";
  exportBatchId?: string | null;
  syncStatus?: "synced" | "local";
  updatedAt?: string;
};

const publishRecordsKey = (projectId: string) => `chapterflow:publish-records:${projectId}`;

export function PublishPage() {
  const { projectId = "" } = useParams();
  const client = useQueryClient();
  const overview = useProjectOverview(projectId);
  const story = useStory(projectId);
  const chapters = useMemo(
    () =>
      (story.data?.outline ?? []).filter(
        (node) => node.kind === "chapter" && node.status !== "abandoned",
      ),
    [story.data?.outline],
  );
  const backups = useQuery({ queryKey: queryKeys.projectBackups(projectId), queryFn: ({ signal }) => getProjectBackups(projectId, signal) });
  const [format, setFormat] = useState<ExportFormat>("markdown");
  const [versionMode, setVersionMode] = useState<"current" | "history">("current");
  const [fromOutlineNodeId, setFromOutlineNodeId] = useState("");
  const [toOutlineNodeId, setToOutlineNodeId] = useState("");
  const rangeInitialized = useRef(false);
  const [includeAnnotations, setIncludeAnnotations] = useState(false);
  const [label, setLabel] = useState("");
  const [restoreTarget, setRestoreTarget] = useState<ProjectBackup | null>(null);
  const restoreRequestRef = useRef<{ backupId: string; requestId: string } | null>(null);
  const backupRequestRef = useRef<{ key: string; label: string; requestId: string } | null>(null);
  const [restoredProjectId, setRestoredProjectId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState<{
    filename: string;
    sizeBytes: number;
    content: string | null;
    artifact: ExportArtifactPreview | null;
  } | null>(null);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [records, setRecords] = useState<PublishRecord[]>(() => readPublishRecords(projectId));
  const remoteRecords = useQuery({ queryKey: queryKeys.publishRecords(projectId), queryFn: ({ signal }) => getPublishRecords(projectId, signal) });
  const exportBatches = useQuery({ queryKey: queryKeys.exportBatches(projectId), queryFn: ({ signal }) => getExportBatches(projectId, signal) });
  const localPendingRecords = records.filter((item) => item.syncStatus === "local");
  const effectiveRecords = remoteRecords.isSuccess
    ? [...remoteRecords.data.map(toLocalRecord), ...localPendingRecords]
    : records;
  const migratedLocal = useRef(false);
  useEffect(() => {
    if (!remoteRecords.isSuccess || migratedLocal.current) return;
    migratedLocal.current = true;
    const local = readPublishRecords(projectId);
    const pendingLocal = local.filter((item) => item.syncStatus === "local");
    if (!remoteRecords.data.length && local.length) {
      void Promise.all(local.map((item) => createPublishRecord(projectId, toRecordInput(item))))
        .then((saved) => {
          const next = saved.map(toLocalRecord);
          setRecords(next);
          window.localStorage.setItem(publishRecordsKey(projectId), JSON.stringify(next));
        })
        .catch(() => setNotice("服务端暂时不可用，已保留本机发布记录；恢复连接后可再次保存。"));
    } else if (pendingLocal.length) {
      void Promise.all(pendingLocal.map((item) => createPublishRecord(projectId, toRecordInput(item))))
        .then((saved) => {
          const next = [...remoteRecords.data.map(toLocalRecord), ...saved.map(toLocalRecord)];
          setRecords(next);
          window.localStorage.setItem(publishRecordsKey(projectId), JSON.stringify(next));
          void client.invalidateQueries({ queryKey: queryKeys.publishRecords(projectId) });
        })
        .catch(() => setNotice("有本机发布记录尚未同步，恢复连接后请刷新重试。"));
    } else {
      window.localStorage.setItem(publishRecordsKey(projectId), JSON.stringify(remoteRecords.data.map(toLocalRecord)));
    }
  }, [client, projectId, remoteRecords.data, remoteRecords.isSuccess]);
  const [record, setRecord] = useState({ platform: "", chapter: "", publishedAt: new Date().toISOString().slice(0, 10), url: "", status: "published" as PublishRecord["status"], exportBatchId: "" });
  const startIndex = chapters.findIndex((chapter) => chapter.id === fromOutlineNodeId);
  const endIndex = chapters.findIndex((chapter) => chapter.id === toOutlineNodeId);
  useEffect(() => {
    if (rangeInitialized.current || chapters.length < 5) return;
    rangeInitialized.current = true;
    setFromOutlineNodeId(chapters[0]!.id);
    setToOutlineNodeId(chapters[4]!.id);
  }, [chapters]);
  const quality = useQuery({
    queryKey: queryKeys.quality(projectId, fromOutlineNodeId || null, toOutlineNodeId || null),
    queryFn: ({ signal }) => getProjectQuality(projectId, signal, {
      ...(fromOutlineNodeId ? { fromOutlineNodeId } : {}),
      ...(toOutlineNodeId ? { toOutlineNodeId } : {}),
    }),
  });
  const invalidRange =
    story.isSuccess &&
    ((fromOutlineNodeId && startIndex < 0) ||
      (toOutlineNodeId && endIndex < 0) ||
      (startIndex >= 0 && endIndex >= 0 && startIndex > endIndex));
  const rangeLabel = fromOutlineNodeId || toOutlineNodeId
    ? `${fromOutlineNodeId ? chapters.find((chapter) => chapter.id === fromOutlineNodeId)?.title ?? "起始章节" : "开头"} → ${toOutlineNodeId ? chapters.find((chapter) => chapter.id === toOutlineNodeId)?.title ?? "结束章节" : "结尾"}`
    : "全书";
  const exportOptions = useMemo(
    () => ({
      versionMode,
      includeAnnotations,
      includeRuns: false,
      ...(fromOutlineNodeId ? { fromOutlineNodeId } : {}),
      ...(toOutlineNodeId ? { toOutlineNodeId } : {}),
    }),
    [fromOutlineNodeId, includeAnnotations, toOutlineNodeId, versionMode],
  );
  type ExportRequest = {
    format: ExportFormat;
    options: typeof exportOptions & { retryOfBatchId?: string | null };
  };
  const exportMutation = useMutation({ mutationFn: ({ format: requestedFormat, options: requestedOptions }: ExportRequest) => getProjectExport(projectId, requestedFormat, requestedOptions), onSuccess: ({ blob, filename, exportBatchId }) => { const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 10_000); if (exportBatchId) { setRecord((current) => ({ ...current, exportBatchId })); void client.invalidateQueries({ queryKey: queryKeys.exportBatches(projectId) }); } setNotice(`已导出 ${filename}，请手动上传到你的发布平台。${exportBatchId ? " 已生成可追溯导出批次。" : ""}`); } });
  const previewMutation = useMutation({
    mutationFn: async () => {
      const { blob, filename, exportBatchId } = await getProjectExport(projectId, format, exportOptions);
      const text = format === "markdown" || format === "text" || format === "narrative-bundle"
        ? (await blob.text()).slice(0, 40_000)
        : null;
      const artifact = format === "markdown" || format === "text"
        ? null
        : await inspectExportArtifact(format, blob);
      return { filename, sizeBytes: blob.size, content: text, artifact, exportBatchId };
    },
    onSuccess: (value) => {
      setPreview(value);
      if (value.exportBatchId) setRecord((current) => ({ ...current, exportBatchId: value.exportBatchId! }));
      void client.invalidateQueries({ queryKey: queryKeys.exportBatches(projectId) });
    },
  });
  const backupMutation = useMutation({
    mutationFn: () => {
      const key = label.trim() || "<default>";
      const existing = backupRequestRef.current;
      if (existing?.key !== key) {
        backupRequestRef.current = {
          key,
          label: label.trim() || `发布前备份 ${new Date().toLocaleString("zh-CN")}`,
          requestId: crypto.randomUUID(),
        };
      }
      const request = backupRequestRef.current!;
      return createProjectBackup(projectId, request.label, request.requestId);
    },
    onSuccess: async () => {
      backupRequestRef.current = null;
      setLabel("");
      setNotice("作品备份已创建。");
      await client.invalidateQueries({ queryKey: queryKeys.projectBackups(projectId) });
    },
  });
  const restoreMutation = useMutation({
    mutationFn: (backup: ProjectBackup) => {
      const existing = restoreRequestRef.current;
      const requestId = existing?.backupId === backup.id ? existing.requestId : crypto.randomUUID();
      restoreRequestRef.current = { backupId: backup.id, requestId };
      return restoreProjectBackup(backup.id, requestId);
    },
    onSuccess: async ({ projectId: nextProjectId }) => {
      restoreRequestRef.current = null;
      setRestoreTarget(null);
      setRestoredProjectId(nextProjectId);
      setNotice(`备份已恢复为作品 ${nextProjectId}，可以继续检查。`);
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.projects }),
        client.invalidateQueries({ queryKey: queryKeys.projectBackups(projectId) }),
      ]);
    },
  });
  const addRecord = async (event: FormEvent) => {
    event.preventDefault();
    if (!record.platform.trim() || !record.chapter.trim()) return;
    const input = { platform: record.platform.trim(), chapter: record.chapter.trim(), publishedAt: record.publishedAt, url: record.url.trim() || null, status: record.status, exportBatchId: record.exportBatchId || null };
    if (editingRecordId?.startsWith("local-")) {
      const next = effectiveRecords.map((item) => item.id === editingRecordId
        ? { ...item, ...input, url: input.url ?? "", syncStatus: "local" as const }
        : item);
      setRecords(next);
      window.localStorage.setItem(publishRecordsKey(projectId), JSON.stringify(next));
      setEditingRecordId(null);
      setRecord((current) => ({ ...current, chapter: "", url: "" }));
      setNotice("本机发布记录已更新；恢复连接后会尝试同步。");
      return;
    }
    try {
      const saved = editingRecordId
        ? await updatePublishRecord(projectId, editingRecordId, {
            ...input,
            expectedUpdatedAt: effectiveRecords.find((item) => item.id === editingRecordId)?.updatedAt ?? "",
          })
        : await createPublishRecord(projectId, input);
      const next = editingRecordId
        ? effectiveRecords.map((item) => item.id === editingRecordId ? toLocalRecord(saved) : item)
        : [toLocalRecord(saved), ...effectiveRecords];
      setRecords(next);
      window.localStorage.setItem(publishRecordsKey(projectId), JSON.stringify(next));
      await client.invalidateQueries({ queryKey: queryKeys.publishRecords(projectId) });
      setEditingRecordId(null);
      setRecord((current) => ({ ...current, chapter: "", url: "" }));
      setNotice(editingRecordId ? "发布记录已更新。你仍需在对应平台完成上传。" : "手动发布记录已保存。你仍需在对应平台完成上传。");
    } catch {
      if (editingRecordId) {
        setNotice("发布记录更新失败，请刷新后重试；原记录仍保留。");
        return;
      }
      const local = { ...input, id: `local-${crypto.randomUUID()}`, url: input.url ?? "", syncStatus: "local" as const };
      const next = [local, ...effectiveRecords];
      setRecords(next);
      window.localStorage.setItem(publishRecordsKey(projectId), JSON.stringify(next));
      setNotice("服务端暂时不可用，已将发布记录保存在本机；恢复连接后会尝试同步。");
    }
  };
  const removeRecord = async (id: string) => {
    try {
      if (!id.startsWith("local-")) {
        await deletePublishRecord(projectId, id);
        await client.invalidateQueries({ queryKey: queryKeys.publishRecords(projectId) });
      }
      const next = effectiveRecords.filter((item) => item.id !== id);
      setRecords(next);
      window.localStorage.setItem(publishRecordsKey(projectId), JSON.stringify(next));
    } catch {
      setNotice("发布记录删除失败，请刷新后重试。");
    }
  };
  const project = overview.data?.project;
  if (overview.isPending) return <div className="cf-page" role="status">正在打开发布页…</div>;
  if (overview.isError) return <div className="cf-page"><ResourceErrorState error={overview.error} backHref="/books" backLabel="回到作品库" title="找不到这本作品的发布页" description="发布页所属的作品可能已经被移除，或当前链接已经过期。" /></div>;
  return <div className="cf-page cf-publish-page"><div className="cf-page-title"><div><Link className="cf-text-link" to={`/books/${projectId}/dashboard`}>← {project?.title ?? "作品"}</Link><h1>发布</h1><p>先核对当前版本的质量门，再导出并手动上传到你选择的平台。</p></div><div className="cf-actions"><Link className="cf-button" to={`/books/${projectId}/advanced?tool=assets`}>管理创作资产</Link><Link className="cf-button" to="/settings/storage#system-backups">管理系统备份</Link></div></div>{notice ? <div className="cf-notice" role="status">{notice}{restoredProjectId ? <> <Link className="cf-text-link" to={`/books/${restoredProjectId}/dashboard`}>打开恢复作品</Link></> : null}</div> : null}<div className="cf-publish-grid"><section className="cf-card"><div className="cf-section-title"><div><h2>发布前检查</h2><p>首发范围必须通过当前版本、审阅、结算和正文长度检查；作者仍可另行保存手工导出。</p></div><ShieldCheck size={24} /></div>{quality.isPending ? <p role="status">正在检查作品…</p> : quality.isError ? <ErrorNote error={quality.error} /> : quality.data ? <><div className="cf-quality-score"><strong>{quality.data.score}</strong><span>分 · {quality.data.readiness === "ready" ? "可以导出" : quality.data.readiness === "needs_attention" ? "建议先处理问题" : "存在阻塞项"}</span></div><p className="cf-export-context" role="note">检查范围：{rangeLabel}</p><div className="cf-quality-gates">{quality.data.gates.map((gate) => <div key={gate.id}><span className={gate.passed ? "is-passed" : "is-warning"}>{gate.passed ? <CheckCircle2 size={15} /> : "!"}</span><div><strong>{gate.label}</strong><p>{gate.message}</p></div></div>)}</div>{quality.data.issues.length ? <details className="cf-quality-issues"><summary>查看 {quality.data.issues.length} 项具体问题</summary><ul>{quality.data.issues.map((issue) => <li key={issue.id}><strong>{issue.severity === "error" ? "阻断" : issue.severity === "warning" ? "警告" : "提示"}：{issue.message}</strong><span>{issue.suggestion}</span></li>)}</ul></details> : null}</> : null}</section><section className="cf-card">
  <div className="cf-section-title">
    <div>
      <h2>导出作品</h2>
      <p>导出当前已保存内容，下载后手动发布。</p>
    </div>
    <Download size={24} />
  </div>
  <label className="cf-publish-field">
    文件格式
    <select
      value={format}
      onChange={(event) => {
        setFormat(event.target.value as ExportFormat);
        setPreview(null);
      }}
    >
      <option value="markdown">Markdown</option>
      <option value="text">纯文本（TXT）</option>
      <option value="docx">DOCX</option>
      <option value="epub">EPUB</option>
      <option value="narrative-bundle">文织备份包</option>
    </select>
  </label>
  <div className="cf-publish-range-grid">
    <label className="cf-publish-field">
      起始章节
      <select
        aria-label="起始章节"
        value={fromOutlineNodeId}
        disabled={story.isPending || !chapters.length}
        onChange={(event) => setFromOutlineNodeId(event.target.value)}
      >
        <option value="">从开头</option>
        {chapters.map((chapter) => (
          <option key={chapter.id} value={chapter.id}>
            第 {chapters.indexOf(chapter) + 1} 章 · {chapter.title}
          </option>
        ))}
      </select>
    </label>
    <label className="cf-publish-field">
      结束章节
      <select
        aria-label="结束章节"
        value={toOutlineNodeId}
        disabled={story.isPending || !chapters.length}
        onChange={(event) => setToOutlineNodeId(event.target.value)}
      >
        <option value="">到结尾</option>
        {chapters.map((chapter) => (
          <option key={chapter.id} value={chapter.id}>
            第 {chapters.indexOf(chapter) + 1} 章 · {chapter.title}
          </option>
        ))}
      </select>
    </label>
  </div>
  <label className="cf-publish-field">
    版本上下文
    <select
      aria-label="版本上下文"
      value={versionMode}
      onChange={(event) =>
        setVersionMode(event.target.value as "current" | "history")
      }
    >
      <option value="current">当前正文版本</option>
      <option value="history">包含每章历史版本</option>
    </select>
  </label>
  <label className="cf-publish-check">
    <input
      type="checkbox"
      checked={includeAnnotations}
      onChange={(event) => setIncludeAnnotations(event.target.checked)}
    />
    导出正文批注
  </label>
  <div className="cf-export-context" role="note">
    <strong>导出范围：{rangeLabel}</strong>
    <p>
      {versionMode === "current"
        ? "只包含各章节当前已保存版本；编辑器中的未保存草稿不会写入文件。"
        : "会把所选范围内每章的历史版本依次写入文件，文件可能明显变大。"}
    </p>
    {story.isError ? (
      <small>章节列表暂时不可用；可以继续导出全书，但章节范围需要恢复连接后再选。</small>
    ) : story.isPending ? (
      <small>正在读取大纲章节…</small>
    ) : null}
    {invalidRange ? (
      <small className="cf-error-text">起始章节必须排在结束章节之前。</small>
    ) : null}
  </div>
  <div className="cf-actions">
    <button
      className="cf-button"
      disabled={invalidRange || previewMutation.isPending}
      onClick={() => previewMutation.mutate()}
    >
      {previewMutation.isPending ? "正在生成预览…" : "预览当前导出"}
    </button>
    <button
      className="cf-primary"
      disabled={invalidRange || exportMutation.isPending}
      onClick={() => exportMutation.mutate({ format, options: exportOptions })}
    >
      <FileDown size={16} />
      {exportMutation.isPending ? "正在准备…" : "下载导出文件"}
    </button>
  </div>
  {previewMutation.isError ? <div className="cf-actions"><ErrorNote error={previewMutation.error} title="导出预览失败" /><button type="button" className="cf-button" onClick={() => previewMutation.mutate()}>重试预览</button></div> : null}
  {exportMutation.isError ? <div className="cf-actions"><ErrorNote error={exportMutation.error} title="导出未完成" /><button type="button" className="cf-button" onClick={() => exportMutation.mutate({ format, options: exportOptions })}>重试导出</button></div> : null}
  </section>
  </div>

  <section className="cf-card cf-export-batch-history">
    <div className="cf-section-title">
      <div>
        <h2>导出批次</h2>
        <p>每次预览或下载都会留下文件上下文，可绑定到手动发布记录。</p>
      </div>
      <FileDown size={22} />
    </div>
    {exportBatches.isError ? <ErrorNote error={exportBatches.error} title="导出批次读取失败" /> : exportBatches.isPending ? <p role="status">正在读取导出批次…</p> : exportBatches.data?.length ? (
      <div className="cf-publish-record-list">
        {exportBatches.data.map((batch) => (
          <div className="cf-list-row" key={batch.id}>
            <div>
              <strong>{batch.status === "failed" ? "导出失败 · " + batch.filename : batch.filename}</strong>
              <p>{new Date(batch.createdAt).toLocaleString("zh-CN")} · {batch.format} · {batch.versionMode === "history" ? "含历史版本" : "当前版本"} · {batch.fromOutlineNodeId || batch.toOutlineNodeId ? (batch.fromOutlineNodeId ? "指定起章" : "开头") + " → " + (batch.toOutlineNodeId ? "指定止章" : "结尾") : "全书"}</p>
              <small>{batch.status === "failed" ? (batch.errorCode ?? "export.failed") + " · " + (batch.errorMessage ?? "请检查导出范围后重试。") + " · " : "SHA-256 " + batch.contentHash.slice(0, 16) + " · "}{formatBytes(batch.byteSize)} · 批次 {batch.id.slice(0, 8)}{batch.retryOfBatchId ? " · 重试自 " + batch.retryOfBatchId.slice(0, 8) : ""}</small>
            </div>
            {batch.status === "failed" ? (
              <button type="button" className="cf-text-link" onClick={() => exportMutation.mutate({ format: batch.format, options: { versionMode: batch.versionMode, includeAnnotations: batch.includeAnnotations, includeRuns: batch.includeRuns, ...(batch.fromOutlineNodeId ? { fromOutlineNodeId: batch.fromOutlineNodeId } : {}), ...(batch.toOutlineNodeId ? { toOutlineNodeId: batch.toOutlineNodeId } : {}), retryOfBatchId: batch.id } })}>重试导出</button>
            ) : (
              <button type="button" className="cf-text-link" onClick={() => { setRecord((current) => ({ ...current, exportBatchId: batch.id })); setNotice("已选择导出批次 " + batch.id.slice(0, 8) + "，保存发布记录后即可追溯。"); }}>关联到记录</button>
            )}
          </div>
        ))}
      </div>
    ) : <p>还没有导出批次。先预览或下载一次导出文件。</p>}
  </section>

  <section className="cf-card cf-publish-records">
    <div className="cf-section-title">
      <div>
        <h2>手动发布记录</h2>
        <p>记录你在哪个平台发布了哪一章，不会自动上传或登录第三方平台。</p>
      </div>
      <Plus size={22} />
    </div>
    {remoteRecords.isError ? <ErrorNote error={remoteRecords.error} title="发布记录同步失败" /> : null}
    <form className="cf-form-grid" onSubmit={addRecord}>
      <label>{editingRecordId ? "编辑平台" : "平台"}<input required value={record.platform} onChange={(event) => setRecord((current) => ({ ...current, platform: event.target.value }))} placeholder="例如：起点、番茄、个人站点" /></label>
      <label>{editingRecordId ? "编辑章节或范围" : "章节或范围"}<input required value={record.chapter} onChange={(event) => setRecord((current) => ({ ...current, chapter: event.target.value }))} placeholder="例如：第 1—3 章" /></label>
      <label>发布日期<input type="date" value={record.publishedAt} onChange={(event) => setRecord((current) => ({ ...current, publishedAt: event.target.value }))} /></label>
      <label>发布链接（可选）<input type="url" value={record.url} onChange={(event) => setRecord((current) => ({ ...current, url: event.target.value }))} placeholder="https://…" /></label>
      <label>状态<select value={record.status} onChange={(event) => setRecord((current) => ({ ...current, status: event.target.value as PublishRecord["status"] }))}><option value="published">已发布</option><option value="scheduled">已排期</option><option value="draft">待发布</option></select></label>
      <label>关联导出批次<select aria-label="关联导出批次" value={record.exportBatchId} onChange={(event) => setRecord((current) => ({ ...current, exportBatchId: event.target.value }))}><option value="">不关联</option>{exportBatches.data?.map((batch) => <option key={batch.id} value={batch.id}>{new Date(batch.createdAt).toLocaleString("zh-CN")} · {batch.format} · {formatBytes(batch.byteSize)}</option>)}</select></label>
      <div className="cf-actions">
        <button className="cf-primary"><Plus size={15} />{editingRecordId ? "保存修改" : "保存记录"}</button>
        {editingRecordId ? <button type="button" className="cf-button" onClick={() => { setEditingRecordId(null); setRecord({ platform: "", chapter: "", publishedAt: new Date().toISOString().slice(0, 10), url: "", status: "published", exportBatchId: "" }); }}>取消编辑</button> : null}
      </div>
    </form>
    <div className="cf-publish-record-list">
      {effectiveRecords.length ? effectiveRecords.map((item) => (
        <div className="cf-list-row" key={item.id}>
          <div><strong>{item.platform} · {item.chapter}</strong><p>{item.publishedAt} · {item.status === "published" ? "已发布" : item.status === "scheduled" ? "已排期" : "待发布"}{item.exportBatchId ? <> · 已关联导出 {item.exportBatchId.slice(0, 8)}</> : null}{item.url ? <> · <a href={item.url} target="_blank" rel="noreferrer">打开链接</a></> : null}</p></div>
          <div className="cf-actions"><button type="button" className="cf-text-link" onClick={() => { setEditingRecordId(item.id); setRecord({ platform: item.platform, chapter: item.chapter, publishedAt: item.publishedAt, url: item.url, status: item.status, exportBatchId: item.exportBatchId ?? "" }); }}>编辑</button><button type="button" className="cf-text-danger" aria-label={`删除 ${item.platform} ${item.chapter}`} onClick={() => void removeRecord(item.id)}><Trash2 size={15} /></button></div>
        </div>
      )) : <p>还没有发布记录。</p>}
    </div>
  </section>

  <section className="cf-card cf-backup-section">
    <div className="cf-section-title">
      <div>
        <h2>作品备份</h2>
        <p>导出前创建一份可回溯的作品快照；同一备份恢复成功后不会再次创建副本。</p>
      </div>
      <Archive size={24} />
    </div>
    <div className="cf-backup-create">
      <input aria-label="备份说明" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="例如：第 20 章发布前" />
      <button type="button" className="cf-button" disabled={backupMutation.isPending} onClick={() => backupMutation.mutate()}>{backupMutation.isPending ? "正在备份…" : "创建备份"}</button>
    </div>
    {backupMutation.isError ? <ErrorNote error={backupMutation.error} /> : null}
    <div className="cf-backup-list">
      {backups.isPending ? <p role="status">正在读取备份…</p> : backups.data?.length ? backups.data.map((backup) => (
        <div className="cf-list-row" key={backup.id}>
          <div><strong>{backup.label}{backup.restoredProjectId ? " · 已恢复" : ""}</strong><p>{new Date(backup.createdAt).toLocaleString("zh-CN")} · {formatBytes(backup.sizeBytes)} · {backup.bundleHash.slice(0, 10)}</p></div>
          {backup.restoredProjectId ? <Link className="cf-text-link" to={`/books/${backup.restoredProjectId}/dashboard`}>打开恢复作品</Link> : <button type="button" className="cf-button" onClick={() => setRestoreTarget(backup)}>恢复为新作品</button>}
        </div>
      )) : <p>还没有作品备份。</p>}
    </div>
  </section>

  {restoreTarget ? <ConfirmDialog title="从备份恢复为新作品？" confirmLabel="开始恢复" pending={restoreMutation.isPending} onCancel={() => setRestoreTarget(null)} onConfirm={() => restoreMutation.mutate(restoreTarget)}><p>原作品不会被覆盖；如果该备份之前已经恢复成功，系统会打开原恢复作品，不再创建重复副本。</p></ConfirmDialog> : null}
  {preview ? <div className="cf-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setPreview(null); }}><section className="cf-modal cf-publish-preview" role="dialog" aria-modal="true" aria-labelledby="cf-publish-preview-title"><header><div><h2 id="cf-publish-preview-title">导出预览</h2><p>{preview.filename} · {formatBytes(preview.sizeBytes)}</p></div><button type="button" className="cf-modal-close" aria-label="关闭预览" onClick={() => setPreview(null)}>×</button></header>{preview.artifact ? <ExportArtifactSummary artifact={preview.artifact} /> : null}<pre>{preview.content ?? "已完成结构检查。下载文件后可在对应编辑器中进行最终版式校对。"}</pre><footer><button type="button" className="cf-primary" onClick={() => setPreview(null)}>关闭</button></footer></section></div> : null}
</div>;
}

export type ExportArtifactCheck = {
  label: string;
  status: "pass" | "warning" | "fail";
  detail: string;
};

export type ExportArtifactPreview = {
  format: ExportFormat;
  status: "valid" | "warning" | "invalid";
  summary: string;
  checks: ExportArtifactCheck[];
};

function ExportArtifactSummary({ artifact }: { artifact: ExportArtifactPreview }) {
  return <div className={`cf-export-artifact-preview is-${artifact.status}`} role="status"><div className="cf-export-artifact-heading"><strong>{artifact.summary}</strong><span>{artifact.status === "valid" ? "结构通过" : artifact.status === "warning" ? "有提示" : "结构异常"}</span></div><ul>{artifact.checks.map((check) => <li key={`${check.label}-${check.detail}`} className={`is-${check.status}`}><b>{check.status === "pass" ? "✓" : check.status === "warning" ? "!" : "×"}</b><span><strong>{check.label}</strong>{check.detail}</span></li>)}</ul></div>;
}

/**
 * Preview the actual generated artifact before the author downloads it.  The
 * server already validates and emits the file; this browser-side pass makes
 * the structural checks visible for binary formats instead of falling back to
 * a generic "binary file" placeholder.
 */
export async function inspectExportArtifact(format: ExportFormat, blob: Blob): Promise<ExportArtifactPreview> {
  if (format === "narrative-bundle") return inspectNarrativeBundle(await blob.text());
  if (format === "docx") return inspectDocx(blob);
  if (format === "epub") return inspectEpub(blob);
  return { format, status: "valid", summary: "文本导出可预览", checks: [{ label: "文件内容", status: "pass", detail: "文本内容已在预览区显示。" }] };
}

async function inspectDocx(blob: Blob): Promise<ExportArtifactPreview> {
  return inspectZipArtifact("docx", blob, async (zip) => {
    const checks: ExportArtifactCheck[] = [];
    const required = ["[Content_Types].xml", "_rels/.rels", "word/document.xml", "docProps/core.xml"];
    const missing = required.filter((path) => !zip.file(path));
    checks.push({ label: "DOCX 核心文件", status: missing.length ? "fail" : "pass", detail: missing.length ? `缺少 ${missing.join("、")}。` : `已找到 ${required.length} 个核心文件。` });
    const xml = await zip.file("word/document.xml")?.async("string");
    const paragraphs = xml ? countMatches(xml, /<w:p(?:\s|>)/giu) : 0;
    const textRuns = xml ? countMatches(xml, /<w:t(?:\s|>)/giu) : 0;
    checks.push({ label: "正文段落", status: paragraphs > 0 ? "pass" : "warning", detail: paragraphs > 0 ? `包含 ${paragraphs} 个段落、${textRuns} 个文字片段。` : "没有检测到正文段落，下载前请检查章节是否有已保存版本。" });
    const status = checks.some((check) => check.status === "fail") ? "invalid" : checks.some((check) => check.status === "warning") ? "warning" : "valid";
    return { format: "docx", status, summary: `DOCX 结构${status === "valid" ? "完整" : status === "warning" ? "可读但需要复核" : "不完整"}`, checks };
  });
}

async function inspectEpub(blob: Blob): Promise<ExportArtifactPreview> {
  return inspectZipArtifact("epub", blob, async (zip) => {
    const checks: ExportArtifactCheck[] = [];
    const mimetype = await zip.file("mimetype")?.async("string");
    checks.push({ label: "EPUB 容器", status: mimetype === "application/epub+zip" ? "pass" : "fail", detail: mimetype === "application/epub+zip" ? "mimetype 正确且位于容器根目录。" : "缺少正确的 mimetype，阅读器可能无法打开。" });
    const container = await zip.file("META-INF/container.xml")?.async("string");
    const opfPath = container?.match(/full-path=["']([^"']+)["']/iu)?.[1];
    checks.push({ label: "EPUB 包清单", status: opfPath && zip.file(opfPath) ? "pass" : "fail", detail: opfPath && zip.file(opfPath) ? `已找到 OPF：${opfPath}。` : "缺少 container.xml 或 OPF 清单。" });
    const opf = opfPath ? await zip.file(opfPath)?.async("string") : null;
    const spineCount = opf ? countMatches(opf, /<itemref(?:\s|>)/giu) : 0;
    const navItem = opf
      ? [...opf.matchAll(/<item\b([^>]+)>/giu)].find((match) => /\bproperties=["'][^"']*\bnav\b[^"']*["']/iu.test(match[1] ?? ""))
      : undefined;
    const navPath = navItem?.[1]?.match(/\bhref=["']([^"']+)["']/iu)?.[1];
    const opfBase = opfPath?.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";
    const navExists = navPath ? Boolean(zip.file(`${opfBase}${navPath}`)) : false;
    checks.push({ label: "章节顺序", status: spineCount > 0 ? "pass" : "warning", detail: spineCount > 0 ? `阅读顺序包含 ${spineCount} 个章节条目。` : "没有检测到 spine 章节条目。" });
    checks.push({ label: "导航目录", status: navPath && navExists ? "pass" : "warning", detail: navPath && navExists ? `已声明导航文件：${navPath}。` : navPath ? `已声明导航文件 ${navPath}，但容器中未找到对应文件。` : "没有声明 nav 导航文件，部分阅读器可能无法显示目录。" });
    const status = checks.some((check) => check.status === "fail") ? "invalid" : checks.some((check) => check.status === "warning") ? "warning" : "valid";
    return { format: "epub", status, summary: `EPUB 结构${status === "valid" ? "完整" : status === "warning" ? "可读但需要复核" : "不完整"}`, checks };
  });
}

async function inspectZipArtifact(
  format: "docx" | "epub",
  blob: Blob,
  inspect: (zip: JSZip) => Promise<ExportArtifactPreview>,
): Promise<ExportArtifactPreview> {
  try {
    const zip = await JSZip.loadAsync(blob);
    return await inspect(zip);
  } catch {
    return { format, status: "invalid", summary: `${format.toUpperCase()} 无法读取`, checks: [{ label: "压缩容器", status: "fail", detail: "文件不是可读取的 ZIP 容器，或内容在传输中损坏。请重新生成后再下载。" }] };
  }
}

function inspectNarrativeBundle(content: string): ExportArtifactPreview {
  const checks: ExportArtifactCheck[] = [];
  try {
    const value = JSON.parse(content) as Record<string, unknown>;
    const manifest = isRecord(value.manifest) ? value.manifest : null;
    const project = isRecord(value.project) ? value.project : null;
    checks.push({ label: "备份包清单", status: manifest?.format === "narralume" ? "pass" : "fail", detail: manifest?.format === "narralume" ? `格式版本 ${String(manifest.version ?? "未知")}。` : "缺少文织备份清单。" });
    checks.push({ label: "作品元数据", status: typeof project?.title === "string" && project.title.trim() ? "pass" : "warning", detail: typeof project?.title === "string" && project.title.trim() ? `作品：${project.title}。` : "没有作品标题，恢复前请核对包内容。" });
    const documents = Array.isArray(value.documents) ? value.documents.length : 0;
    const outline = Array.isArray(value.outline) ? value.outline.length : 0;
    checks.push({ label: "正文与大纲", status: documents > 0 || outline > 0 ? "pass" : "warning", detail: `包含 ${outline} 个大纲节点、${documents} 篇正文文档。` });
    const status = checks.some((check) => check.status === "fail") ? "invalid" : checks.some((check) => check.status === "warning") ? "warning" : "valid";
    return { format: "narrative-bundle", status, summary: `文织备份包${status === "valid" ? "结构完整" : status === "warning" ? "可读但需要复核" : "结构异常"}`, checks };
  } catch {
    return { format: "narrative-bundle", status: "invalid", summary: "文织备份包无法读取", checks: [{ label: "JSON 清单", status: "fail", detail: "文件不是有效的 JSON 备份包，请重新生成导出。" }] };
  }
}

function countMatches(value: string, pattern: RegExp): number {
  return [...value.matchAll(pattern)].length;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function formatBytes(value: number) { if (value < 1024) return `${value} B`; if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`; return `${(value / (1024 * 1024)).toFixed(1)} MB`; }

function readPublishRecords(projectId: string): PublishRecord[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(publishRecordsKey(projectId)) ?? "[]") as unknown;
    return Array.isArray(value) ? value.filter(isPublishRecord) : [];
  } catch {
    return [];
  }
}

function isPublishRecord(value: unknown): value is PublishRecord {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<PublishRecord>;
  return typeof row.id === "string" && typeof row.platform === "string" && typeof row.chapter === "string" && typeof row.publishedAt === "string" && ["published", "scheduled", "draft"].includes(row.status ?? "");
}

function toRecordInput(record: PublishRecord) {
  return {
    platform: record.platform,
    chapter: record.chapter,
    publishedAt: record.publishedAt,
    url: record.url || null,
    status: record.status,
    exportBatchId: record.exportBatchId ?? null,
  };
}

function toLocalRecord(record: PublishRecordDto): PublishRecord {
  return {
    id: record.id,
    platform: record.platform,
    chapter: record.chapter,
    publishedAt: record.publishedAt,
    url: record.url ?? "",
    status: record.status,
    exportBatchId: record.exportBatchId,
    updatedAt: record.updatedAt,
  };
}
