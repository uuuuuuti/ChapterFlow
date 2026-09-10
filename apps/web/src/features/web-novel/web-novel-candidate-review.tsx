import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, RefreshCw, Sparkles, X } from "lucide-react";
import {
  createWebNovelCandidate,
  decideWebNovelCandidateItem,
  getWebNovelCandidates,
} from "../../shared/api/web-novel";
import type { WebNovelCandidateKind, WebNovelCandidateSetDto } from "../../shared/api/types";
import { ApiError } from "../../shared/api/client";
import { ErrorNote } from "../../shared/ui";
import { queryKeys } from "../../shared/query/keys";

export function WebNovelCandidateReview({
  projectId,
  kind,
  outlineNodeId = null,
  title,
  description,
  defaultInstruction,
}: {
  projectId: string;
  kind: WebNovelCandidateKind;
  outlineNodeId?: string | null;
  title: string;
  description: string;
  defaultInstruction: string;
}) {
  const client = useQueryClient();
  const [instruction, setInstruction] = useState(defaultInstruction);
  const key = queryKeys.webNovelCandidates(projectId, kind, outlineNodeId);
  const candidates = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      getWebNovelCandidates(projectId, { kind, outlineNodeId, signal }),
    refetchInterval: 2_000,
  });
  const generate = useMutation({
    mutationFn: () =>
      createWebNovelCandidate(projectId, {
        requestId: crypto.randomUUID(),
        kind,
        ...(outlineNodeId ? { outlineNodeId } : {}),
        instruction: instruction.trim() || defaultInstruction,
      }),
    onSuccess: () => void client.invalidateQueries({ queryKey: key }),
  });
  const decide = useMutation({
    mutationFn: (input: { setId: string; itemId: string; action: "apply" | "reject"; confirmLocked?: boolean }) =>
      decideWebNovelCandidateItem(projectId, input.setId, input.itemId, {
        action: input.action,
        confirmLocked: input.confirmLocked ?? false,
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: key });
      if (kind === "profile") {
        void client.invalidateQueries({ queryKey: queryKeys.bookProfile(projectId) });
        void client.invalidateQueries({ queryKey: queryKeys.bookProfileHistory(projectId) });
      } else if (outlineNodeId) {
        void client.invalidateQueries({ queryKey: queryKeys.chapterBrief(projectId, outlineNodeId) });
        void client.invalidateQueries({ queryKey: queryKeys.chapterBriefHistory(projectId, outlineNodeId) });
      }
    },
    onError: (error) => {
      if (isWebNovelCandidateConflict(error)) {
        void client.invalidateQueries({ queryKey: key });
      }
    },
  });
  const refresh = () => void client.refetchQueries({ queryKey: key });
  const visible = candidates.data ?? [];
  return (
    <section className="cf-card cf-web-novel-candidate" aria-label={title}>
      <div className="cf-section-title">
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <Sparkles size={19} />
      </div>
      <div className="cf-web-novel-candidate__composer">
        <label>
          本次希望 AI 重点考虑
          <textarea
            rows={2}
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            placeholder={defaultInstruction}
          />
        </label>
        <button className="cf-button" type="button" disabled={generate.isPending} onClick={() => generate.mutate()}>
          <Sparkles size={15} />
          {generate.isPending ? "正在生成候选…" : "生成候选"}
        </button>
      </div>
      {generate.isError ? <ErrorNote error={generate.error} title="候选任务启动失败" /> : null}
      {candidates.isError ? <ErrorNote error={candidates.error} title="候选读取失败" /> : null}
      {candidates.isPending ? <p role="status">正在读取候选…</p> : null}
      {visible.length ? (
        <div className="cf-web-novel-candidate__list">
          {visible.slice(0, 5).map((set) => (
            <CandidateSetCard key={set.id} set={set} decide={decide} onRefresh={refresh} />
          ))}
        </div>
      ) : !candidates.isPending ? (
        <p className="cf-muted">还没有候选。生成结果会先停在这里，确认后才会写入档案或简报。</p>
      ) : null}
    </section>
  );
}

function CandidateSetCard({
  set,
  decide,
  onRefresh,
}: {
  set: WebNovelCandidateSetDto;
  decide: {
    isPending: boolean;
    isError: boolean;
    error: unknown;
    mutate: (input: { setId: string; itemId: string; action: "apply" | "reject"; confirmLocked?: boolean }) => void;
  };
  onRefresh: () => void;
}) {
  const conflict = isWebNovelCandidateConflict(decide.error);
  return (
    <article className={`cf-web-novel-candidate__set is-${set.status}`}>
      <div className="cf-web-novel-candidate__heading">
        <div>
          <strong>{set.summary}</strong>
          <small>
            {set.kind === "profile" ? "作品档案" : "章节简报"} · 来源版本 {set.kind === "profile" ? `档案 v${set.sourceProfileVersion ?? 0}` : `简报 v${set.sourceBriefVersion ?? 0}`} · {new Date(set.createdAt).toLocaleString("zh-CN")}
          </small>
        </div>
        <span className="cf-badge">{set.stale ? "来源已变化" : set.status === "candidate" ? "待裁决" : set.status === "applied" ? "已采纳" : set.status === "rejected" ? "已拒绝" : "部分采纳"}</span>
      </div>
      {set.stale ? <div className="cf-editor-notice" role="status"><p><RefreshCw size={14} />来源版本已变化，候选只能拒绝；请刷新并重新生成。</p><button type="button" className="cf-button" onClick={onRefresh}>重新读取候选</button></div> : null}
      {set.items.map((item) => (
        <div className="cf-web-novel-candidate__item" key={item.id}>
          <div className="cf-web-novel-candidate__item-title"><strong>{item.title}</strong>{item.decision ? <span className="cf-badge">{item.decision.action === "apply" ? "已采纳" : "已拒绝"}</span> : null}</div>
          <p>{item.rationale}</p>
          <div className="cf-web-novel-candidate__diff">
            <div><small>建议修改</small><pre>{JSON.stringify(item.after, null, 2)}</pre></div>
            {item.before ? <div><small>生成时基线</small><pre>{JSON.stringify(item.before, null, 2)}</pre></div> : null}
          </div>
          {item.evidence.length ? <div className="cf-web-novel-candidate__evidence"><small>依据</small>{item.evidence.map((evidence) => <div key={`${evidence.sourceType}:${evidence.sourceId}:${evidence.quote}`}><strong>{evidence.label}</strong><span>{evidence.quote}</span></div>)}</div> : null}
          {!item.decision ? <div className="cf-actions"><button className="cf-primary" type="button" disabled={decide.isPending || set.stale} onClick={() => decide.mutate({ setId: set.id, itemId: item.id, action: "apply", confirmLocked: item.requiresLockedConfirmation })}><Check size={15} />采纳</button><button className="cf-button" type="button" disabled={decide.isPending} onClick={() => decide.mutate({ setId: set.id, itemId: item.id, action: "reject" })}><X size={15} />拒绝</button></div> : null}
        </div>
      ))}
      {decide.isError ? <ErrorNote error={decide.error} title="候选裁决失败" /> : null}
      {conflict ? <div className="cf-candidate-conflict" role="alert"><strong>候选基线已变化，未写入当前档案或简报。</strong><p>另一个页面或最近一次保存更新了来源。先重新读取候选，再根据最新版本重新生成；本次采纳不会覆盖远端内容。</p><button type="button" className="cf-button" onClick={onRefresh}>重新读取并检查</button></div> : null}
    </article>
  );
}

export function isWebNovelCandidateConflict(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.code === "web_novel_candidate.source.stale" ||
      error.code === "web_novel_candidate.item.already_decided" ||
      error.status === 409)
  );
}
