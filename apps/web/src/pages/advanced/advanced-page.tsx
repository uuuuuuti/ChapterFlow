import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router";
import { Brain, Check, Database, Search, WandSparkles } from "lucide-react";
import { ErrorNote } from "../../shared/ui";
import { consolidateNarrativeMemory, getNarrativeMemories, generatePlotPredictions, previewDryRun, rebuildNarrativeMemories, searchProjectMemory, decidePlotPrediction } from "../../shared/api/context";
import { ProductionTools } from "../../features/production-tools/production-tools";
import { WebNovelPage } from "../web-novel/web-novel-page";
import { queryKeys } from "../../shared/query/keys";

type Tool = "search" | "predict" | "dry-run" | "memory" | "assets" | "web-novel";

export function AdvancedPage() {
  const { projectId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const raw = params.get("tool") as Tool | null;
  const tool: Tool = raw && ["search", "predict", "dry-run", "memory", "assets", "web-novel"].includes(raw) ? raw : "search";
  const tabs: { id: Tool; label: string }[] = [
    { id: "search", label: "检索故事记忆" },
    { id: "predict", label: "剧情推演" },
    { id: "dry-run", label: "变更预览" },
    { id: "memory", label: "记忆维护" },
    { id: "assets", label: "创作资产" },
    { id: "web-novel", label: "网文规划" },
  ];
  return <div className="cf-page cf-advanced-page"><div className="cf-page-title"><div><Link className="cf-text-link" to={`/books/${projectId}/dashboard`}>← 创作首页</Link><p className="cf-eyebrow">AUTHOR TOOLS</p><h1>高级工具</h1><p>查看检索、推演和变更预览的依据；预览不会直接修改正文或设定。</p></div></div><div className="cf-settings-tabs" role="tablist" aria-label="高级工具分区">{tabs.map((tab) => <button key={tab.id} role="tab" aria-selected={tool === tab.id} onClick={() => setParams({ tool: tab.id })}>{tab.label}</button>)}</div>{tool === "search" ? <SearchTool projectId={projectId} /> : null}{tool === "predict" ? <PredictionTool projectId={projectId} /> : null}{tool === "dry-run" ? <DryRunTool projectId={projectId} /> : null}{tool === "memory" ? <MemoryTool projectId={projectId} /> : null}{tool === "assets" ? <ProductionTools projectId={projectId} native /> : null}{tool === "web-novel" ? <WebNovelPage projectId={projectId} /> : null}</div>;
}

function SearchTool({ projectId }: { projectId: string }) {
  const [query, setQuery] = useState("");
  const search = useMutation({ mutationFn: () => searchProjectMemory(projectId, { query: query.trim(), limit: 20, rerank: true }) });
  return <section className="cf-card cf-advanced-card"><div className="cf-section-title"><div><h2>检索故事记忆</h2><p>搜索结果标出来源和权威级别，方便回到人物、事实或正文。</p></div><Search size={22} /></div><form className="cf-advanced-form" onSubmit={(event) => { event.preventDefault(); if (query.trim()) search.mutate(); }}><input aria-label="检索内容" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="例如：灯塔熄灭时，谁在场？" /><button className="cf-primary" disabled={search.isPending || !query.trim()}>开始检索</button></form>{search.isError ? <ErrorNote error={search.error} /> : null}{search.data ? <div className="cf-search-results">{search.data.length ? search.data.map((hit) => <article key={hit.id}><header><strong>{hit.title}</strong><span>{hit.authority}</span></header><p>{hit.content}</p><small>{hit.sourceType} · {hit.sourceId} · 相关度 {hit.score.toFixed(2)}</small></article>) : <p>没有找到匹配的故事记忆。</p>}</div> : <div className="cf-empty"><Search size={38} /><p>输入一个问题，查看上下文依据。</p></div>}</section>;
}

function PredictionTool({ projectId }: { projectId: string }) {
  const [direction, setDirection] = useState("");
  const [horizon, setHorizon] = useState(3);
  const queryClient = useQueryClient();
  const predictions = useQuery({ queryKey: queryKeys.predictions(projectId), queryFn: ({ signal }) => import("../../shared/api/context").then(({ getPlotPredictions }) => getPlotPredictions(projectId, signal)) });
  const generate = useMutation({ mutationFn: () => generatePlotPredictions(projectId, { direction: direction.trim(), horizon, count: 3 }), onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.predictions(projectId) }) });
  const decide = useMutation({ mutationFn: (input: { id: string; status: "adopted" | "dismissed" }) => decidePlotPrediction(projectId, input.id, input.status), onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.predictions(projectId) }) });
  return <section className="cf-card cf-advanced-card"><div className="cf-section-title"><div><h2>剧情推演</h2><p>推演只是候选方向；采用前请确认它与作品定位一致。</p></div><WandSparkles size={22} /></div><form className="cf-advanced-form" onSubmit={(event) => { event.preventDefault(); if (direction.trim()) generate.mutate(); }}><input aria-label="推演方向" value={direction} onChange={(event) => setDirection(event.target.value)} placeholder="例如：主角下一章必须付出什么代价？" /><label>预测跨度<input type="number" min={1} max={12} value={horizon} onChange={(event) => setHorizon(Number(event.target.value))} /></label><button className="cf-primary" disabled={generate.isPending || !direction.trim()}>生成候选</button></form>{generate.isError ? <ErrorNote error={generate.error} /> : null}{predictions.isError ? <ErrorNote error={predictions.error} /> : null}<div className="cf-prediction-grid">{predictions.data?.map((prediction) => <article className="cf-prediction-card" key={prediction.id} data-status={prediction.status}><header><strong>{prediction.title}</strong><span>不确定度 {Math.round(prediction.uncertainty * 100)}%</span></header><p>{prediction.summary}</p><small>影响：{prediction.impact.join("、") || "未填写"}</small>{prediction.status === "candidate" ? <footer><button className="cf-button" disabled={decide.isPending} onClick={() => decide.mutate({ id: prediction.id, status: "dismissed" })}>搁置</button><button className="cf-primary" disabled={decide.isPending} onClick={() => decide.mutate({ id: prediction.id, status: "adopted" })}><Check size={15} />采用</button></footer> : <em>{prediction.status === "adopted" ? "已采用" : "已搁置"}</em>}</article>)}</div></section>;
}

function DryRunTool({ projectId }: { projectId: string }) {
  const [change, setChange] = useState("");
  const preview = useMutation({ mutationFn: () => previewDryRun(projectId, change.trim()) });
  return <section className="cf-card cf-advanced-card"><div className="cf-section-title"><div><h2>变更预览</h2><p>先检查会影响哪些人物、事实、时间线和伏笔，再决定是否执行。</p></div><Database size={22} /></div><form className="cf-advanced-form" onSubmit={(event) => { event.preventDefault(); if (change.trim()) preview.mutate(); }}><textarea aria-label="变更描述" rows={4} value={change} onChange={(event) => setChange(event.target.value)} placeholder="例如：把主角的职业从守塔人改成巡海员" /><button className="cf-primary" disabled={preview.isPending || !change.trim()}>预览影响</button></form>{preview.isError ? <ErrorNote error={preview.error} /> : null}{preview.data ? <div className="cf-dry-run-result"><strong>{preview.data.safeToProceed ? "没有发现阻塞" : "发现需要确认的影响"}</strong><span>指纹：{preview.data.fingerprint}</span>{preview.data.findings.map((finding) => <div key={`${finding.kind}:${finding.sourceId}`}><b>{finding.severity === "warning" ? "!" : "·"}</b><span>{finding.label}</span><small>{finding.impact}</small></div>)}</div> : null}</section>;
}

function MemoryTool({ projectId }: { projectId: string }) {
  const client = useQueryClient();
  const memories = useQuery({ queryKey: queryKeys.memories(projectId), queryFn: ({ signal }) => getNarrativeMemories(projectId, true, signal) });
  const rebuild = useMutation({
    mutationFn: () => rebuildNarrativeMemories(projectId),
    onSuccess: (next) => client.setQueryData(queryKeys.memories(projectId), next),
  });
  const sleep = useMutation({
    mutationFn: () => consolidateNarrativeMemory(projectId),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.memories(projectId) }),
  });
  const pending = rebuild.isPending || sleep.isPending;
  return <section className="cf-card cf-advanced-card"><div className="cf-section-title"><div><h2>记忆维护</h2><p>查看故事记忆的层级和新鲜度；重建会重新读取已保存事实，整理会生成可追溯的长期摘要。</p></div><Brain size={22} /></div><div className="cf-actions"><button className="cf-primary" disabled={pending} onClick={() => rebuild.mutate()}>{rebuild.isPending ? "正在重建…" : "重建记忆"}</button><button className="cf-button" disabled={pending} onClick={() => sleep.mutate()}>{sleep.isPending ? "正在整理…" : "整理旧记忆"}</button></div>{rebuild.isError ? <ErrorNote error={rebuild.error} /> : null}{sleep.isError ? <ErrorNote error={sleep.error} /> : null}{rebuild.isSuccess ? <p className="cf-editor-notice" role="status">记忆已重建，当前列表已刷新。</p> : null}{sleep.isSuccess ? <p className="cf-editor-notice" role="status">已请求整理长期记忆，列表会在服务端完成后更新。</p> : null}{memories.isError ? <ErrorNote error={memories.error} /> : null}{memories.isPending ? <p role="status">正在读取记忆…</p> : <div className="cf-memory-list">{memories.data?.length ? memories.data.map((memory) => <article key={memory.id}><header><strong>{memory.title}</strong><span>{memory.layer} · {memory.status}</span></header><p>{memory.content}</p><small>{memory.scopeType}:{memory.scopeId} · 更新于 {new Date(memory.updatedAt).toLocaleString("zh-CN")}</small><MemorySourceLink projectId={projectId} scopeType={memory.scopeType} scopeId={memory.scopeId} /></article>) : <p className="cf-empty">还没有可维护的故事记忆。完成一章保存后再重建。</p>}</div>}</section>;
}

function MemorySourceLink({ projectId, scopeType, scopeId }: { projectId: string; scopeType: string; scopeId: string }) {
  if (["chapter", "scene"].includes(scopeType)) {
    return <Link className="cf-text-link" to={`/books/${projectId}/write?outline=${encodeURIComponent(scopeId)}`}>打开来源章节 →</Link>;
  }
  if (scopeType === "book" || scopeType === "project") {
    return <Link className="cf-text-link" to={`/books/${projectId}/dashboard`}>回到作品首页 →</Link>;
  }
  return <Link className="cf-text-link" to={`/books/${projectId}/knowledge`}>打开作品设定 →</Link>;
}
