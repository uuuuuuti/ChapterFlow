import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, RefreshCw, Shield, ToggleLeft, ToggleRight } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

import {
  listOfficialKnowledgeCards,
  listOfficialSources,
  requestOfficialSourceRefresh,
  updateOfficialKnowledgeCardStatus,
  updateOfficialSourceStatus,
} from "../../shared/api/signing-sprint";
import { apiErrorMessage } from "../../shared/api/client";
import { queryKeys } from "../../shared/query/keys";

export function OfficialKnowledgePage() {
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState("all");
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
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.officialKnowledge("sources") });
      void client.invalidateQueries({ queryKey: queryKeys.officialKnowledge("cards") });
    },
  });
  const cardStatus = useMutation({
    mutationFn: (input: { id: string; action: "activate" | "disable" }) =>
      updateOfficialKnowledgeCardStatus(input.id, input.action),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.officialKnowledge("cards") });
    },
  });
  if (sources.isPending || cards.isPending) {
    return <div className="cf-page">正在读取官方知识…</div>;
  }
  if (sources.isError || cards.isError) {
    return <div className="cf-page"><p className="cf-error-text">{apiErrorMessage(sources.error ?? cards.error)}</p></div>;
  }
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visibleSources = sources.data.filter((source) => {
    const matchesStage =
      stage === "all" || source.applicableStages.includes(stage);
    const matchesSearch =
      !normalizedSearch ||
      [source.title, source.summary, source.sourceType, source.sourceVersion]
        .join(" ")
        .toLocaleLowerCase()
        .includes(normalizedSearch);
    return matchesStage && matchesSearch;
  });
  const visibleCards = cards.data.filter((card) => {
    const matchesStage = stage === "all" || card.applicableStage === stage;
    const matchesSearch =
      !normalizedSearch ||
      [card.title, card.principle, card.why, card.applicableStage]
        .join(" ")
        .toLocaleLowerCase()
        .includes(normalizedSearch);
    return matchesStage && matchesSearch;
  });
  const stages = Array.from(
    new Set([
      ...sources.data.flatMap((source) => source.applicableStages),
      ...cards.data.map((card) => card.applicableStage),
    ]),
  ).sort();
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
      {status.isError || refresh.isError || cardStatus.isError ? <p className="cf-error-text">{apiErrorMessage(status.error ?? refresh.error ?? cardStatus.error)}</p> : null}
      {refresh.data ? <p className="cf-notice" role="status">{refresh.data.message}</p> : null}
      <section className="cf-card cf-official-knowledge-filters">
        <label>搜索来源或知识卡<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="例如：开篇、简介、更新" /></label>
        <label>适用阶段<select value={stage} onChange={(event) => setStage(event.target.value)}><option value="all">全部阶段</option>{stages.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <span className="cf-inline-hint">当前显示 {visibleSources.length} 个来源、{visibleCards.length} 张知识卡。</span>
      </section>
      <section className="cf-card cf-official-knowledge-section">
        <div className="cf-section-title"><div><h2>来源状态</h2><p>{sources.data.length} 个官方来源；激活来源才会进入作者和 AI 上下文。</p></div></div>
        <div className="cf-official-source-list">
          {visibleSources.map((source) => (
            <article className="cf-official-source" key={source.id}>
              <div><div className="cf-official-source-heading"><strong>{source.title}</strong><span data-status={source.status}>{source.status}</span></div><p>{source.summary}</p><small>版本 {source.sourceVersion} · 发布 {source.publishedAt ? new Date(source.publishedAt).toLocaleDateString("zh-CN") : "未标注"} · 最近读取 {new Date(source.retrievedAt).toLocaleString("zh-CN")} · {source.authorityType}</small></div>
              <div className="cf-actions"><a className="cf-button" href={source.url} target="_blank" rel="noreferrer">查看原文 <ExternalLink size={13} /></a>{source.status === "ACTIVE" ? <button className="cf-button" onClick={() => status.mutate({ id: source.id, action: "disable" })} disabled={status.isPending}><ToggleLeft size={15} />停用</button> : <button className="cf-primary" onClick={() => status.mutate({ id: source.id, action: "activate" })} disabled={status.isPending}><ToggleRight size={15} />启用</button>}<button className="cf-button" onClick={() => refresh.mutate(source.id)} disabled={refresh.isPending}><RefreshCw size={13} />刷新待核对</button></div>
            </article>
          ))}
        </div>
      </section>
      <section className="cf-card cf-official-knowledge-section">
        <div className="cf-section-title"><div><h2>知识卡</h2><p>{cards.data.length} 张结构化卡片；每张卡片都可以回溯到来源。</p></div></div>
        <div className="cf-official-card-grid">{visibleCards.map((card) => <article className="cf-official-card" key={card.id}><div className="cf-official-source-heading"><strong>{card.title}</strong><span data-status={card.status}>{card.status} · {card.severity}</span></div><p>{card.principle}</p><small>适用阶段：{card.applicableStage} · 来源：{card.sourceRefs.map((source) => <a key={source.sourceId} href={source.url} target="_blank" rel="noreferrer">{source.title}</a>)}</small><div className="cf-official-card-suggestions">{card.suggestions.slice(0, 3).map((suggestion) => <span key={suggestion}>{suggestion}</span>)}</div><div className="cf-actions">{card.status === "ACTIVE" ? <button className="cf-button" onClick={() => cardStatus.mutate({ id: card.id, action: "disable" })} disabled={cardStatus.isPending}>停用卡片</button> : <button className="cf-primary" onClick={() => cardStatus.mutate({ id: card.id, action: "activate" })} disabled={cardStatus.isPending}>启用卡片</button>}</div></article>)}</div>
      </section>
      <p className="cf-inline-hint">知识卡只提供创作建议和规则提醒，不生成官方评分、签约概率，也不会代替作者向平台提交作品。</p>
    </div>
  );
}
