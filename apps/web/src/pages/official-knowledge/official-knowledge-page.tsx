import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, RefreshCw, Shield, ToggleLeft, ToggleRight } from "lucide-react";
import { Link } from "react-router";

import {
  listOfficialKnowledgeCards,
  listOfficialSources,
  requestOfficialSourceRefresh,
  updateOfficialSourceStatus,
} from "../../shared/api/signing-sprint";
import { apiErrorMessage } from "../../shared/api/client";
import { queryKeys } from "../../shared/query/keys";

export function OfficialKnowledgePage() {
  const client = useQueryClient();
  const sources = useQuery({
    queryKey: queryKeys.officialKnowledge("sources"),
    queryFn: ({ signal }) => listOfficialSources(signal),
  });
  const cards = useQuery({
    queryKey: queryKeys.officialKnowledge("cards"),
    queryFn: ({ signal }) => listOfficialKnowledgeCards(signal),
  });
  const status = useMutation({
    mutationFn: (input: { id: string; action: "activate" | "disable" }) =>
      updateOfficialSourceStatus(input.id, input.action),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.officialKnowledge("sources") });
      void client.invalidateQueries({ queryKey: queryKeys.officialKnowledge("cards") });
    },
  });
  const refresh = useMutation({
    mutationFn: (sourceId: string) => requestOfficialSourceRefresh(sourceId),
  });
  if (sources.isPending || cards.isPending) {
    return <div className="cf-page">正在读取官方知识…</div>;
  }
  if (sources.isError || cards.isError) {
    return <div className="cf-page"><p className="cf-error-text">{apiErrorMessage(sources.error ?? cards.error)}</p></div>;
  }
  return (
    <div className="cf-page cf-official-knowledge-page">
      <div className="cf-page-title">
        <div>
          <Link className="cf-text-link" to="/books">← 我的作品</Link>
          <h1>官方知识</h1>
          <p>只展示番茄小说官方来源。来源状态、版本和抓取时间都保留，刷新后需要人工核对再启用。</p>
        </div>
        <span className="cf-signing-sprint-badge"><Shield size={14} /> V0.1 来源库</span>
      </div>
      {status.isError || refresh.isError ? <p className="cf-error-text">{apiErrorMessage(status.error ?? refresh.error)}</p> : null}
      {refresh.data ? <p className="cf-notice" role="status">{refresh.data.message}</p> : null}
      <section className="cf-card cf-official-knowledge-section">
        <div className="cf-section-title"><div><h2>来源状态</h2><p>{sources.data.length} 个官方来源；激活来源才会进入作者和 AI 上下文。</p></div></div>
        <div className="cf-official-source-list">
          {sources.data.map((source) => (
            <article className="cf-official-source" key={source.id}>
              <div><div className="cf-official-source-heading"><strong>{source.title}</strong><span data-status={source.status}>{source.status}</span></div><p>{source.summary}</p><small>版本 {source.sourceVersion} · 最近读取 {new Date(source.retrievedAt).toLocaleString("zh-CN")} · {source.authorityType}</small></div>
              <div className="cf-actions"><a className="cf-button" href={source.url} target="_blank" rel="noreferrer">查看原文 <ExternalLink size={13} /></a>{source.status === "ACTIVE" ? <button className="cf-button" onClick={() => status.mutate({ id: source.id, action: "disable" })} disabled={status.isPending}><ToggleLeft size={15} />停用</button> : <button className="cf-primary" onClick={() => status.mutate({ id: source.id, action: "activate" })} disabled={status.isPending}><ToggleRight size={15} />启用</button>}<button className="cf-button" onClick={() => refresh.mutate(source.id)} disabled={refresh.isPending}><RefreshCw size={13} />刷新待核对</button></div>
            </article>
          ))}
        </div>
      </section>
      <section className="cf-card cf-official-knowledge-section">
        <div className="cf-section-title"><div><h2>知识卡</h2><p>{cards.data.length} 张结构化卡片；每张卡片都可以回溯到来源。</p></div></div>
        <div className="cf-official-card-grid">{cards.data.map((card) => <article className="cf-official-card" key={card.id}><div className="cf-official-source-heading"><strong>{card.title}</strong><span data-status={card.status}>{card.severity}</span></div><p>{card.principle}</p><small>适用阶段：{card.applicableStage} · 来源：{card.sourceRefs.map((source) => source.title).join("、")}</small><div className="cf-official-card-suggestions">{card.suggestions.slice(0, 3).map((suggestion) => <span key={suggestion}>{suggestion}</span>)}</div></article>)}</div>
      </section>
      <p className="cf-inline-hint">知识卡只提供创作建议和规则提醒，不生成官方评分、签约概率，也不会代替作者向平台提交作品。</p>
    </div>
  );
}
