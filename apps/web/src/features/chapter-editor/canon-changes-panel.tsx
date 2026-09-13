import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { Check, X } from "lucide-react";

import { getProjectRuns } from "../../shared/api/automation";
import {
  decideCanonChangeSet,
  getCanonChangeSets,
} from "../../shared/api/review";
import { retryDocumentSettlement } from "../../shared/api/writing";
import type { CanonChangeSetView, StoryDocument } from "../../shared/api/types";
import { queryKeys } from "../../shared/query/keys";
import { ConflictRecovery, ErrorNote } from "../../shared/ui";
import { isAuthoringConflict } from "../../shared/api/client";
import { useState } from "react";

/**
 * Native writing-desk surface for the old Studio "canon" focus. The API keeps
 * its historical project/run contract, while the author sees a ChapterFlow
 * decision panel beside the chapter instead of being sent back to Studio.
 */
export function CanonChangesPanel({
  projectId,
  document,
}: {
  projectId: string;
  document: StoryDocument;
}) {
  const client = useQueryClient();
  const [decisionConflict, setDecisionConflict] = useState<unknown>(null);
  const [conflictNotice, setConflictNotice] = useState("");
  const [refreshingConflict, setRefreshingConflict] = useState(false);
  const changes = useQuery({
    queryKey: queryKeys.canonChangeSets(projectId),
    queryFn: ({ signal }) => getCanonChangeSets(projectId, signal),
  });
  const runs = useQuery({
    queryKey: queryKeys.runs(projectId),
    queryFn: ({ signal }) => getProjectRuns(projectId, signal),
  });
  const settlementRuns = (runs.data ?? []).filter(
    (run) =>
      run.recipe === "manual-settlement" &&
      runOriginDocumentId(run.policy) === document.id,
  );
  const currentVersionId = document.currentVersionId;
  const failedCurrentSettlement = [...settlementRuns]
    .reverse()
    .find(
      (run) =>
        run.status === "failed" &&
        run.policy.documentVersionId === currentVersionId,
    );
  const retrySettlement = useMutation({
    mutationFn: () => {
      if (!currentVersionId) throw new Error("当前正文还没有正式版本");
      return retryDocumentSettlement(
        projectId,
        document.id,
        currentVersionId,
        `${document.id}:${currentVersionId}:settlement-retry:${failedCurrentSettlement?.id ?? "missing"}`,
      );
    },
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.canonChangeSets(projectId) }),
        client.invalidateQueries({ queryKey: queryKeys.runs(projectId) }),
        client.invalidateQueries({ queryKey: queryKeys.project(projectId) }),
      ]);
    },
  });
  const decision = useMutation({
    mutationFn: (input: { changeSet: CanonChangeSetView; action: "apply" | "reject" }) =>
      decideCanonChangeSet(projectId, input.changeSet.id, {
        action: input.action,
        expectedStatus: "candidate",
        conflictPolicy: "reject",
      }),
    onSuccess: async () => {
      setDecisionConflict(null);
      setConflictNotice("");
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.canonChangeSets(projectId) }),
        client.invalidateQueries({ queryKey: queryKeys.runs(projectId) }),
        client.invalidateQueries({ queryKey: queryKeys.project(projectId) }),
      ]);
    },
    onError: (error) => {
      if (isAuthoringConflict(error)) setDecisionConflict(error);
    },
  });
  const refreshDecisionRemote = async () => {
    setRefreshingConflict(true);
    try {
      await Promise.all([changes.refetch(), runs.refetch()]);
      setDecisionConflict(null);
      setConflictNotice("已重新读取最新设定变化，请确认候选状态后再操作。");
    } finally {
      setRefreshingConflict(false);
    }
  };

  if (changes.isPending || runs.isPending) {
    return <div className="cf-assistant-content"><p role="status">正在读取设定变化…</p></div>;
  }
  if (changes.isError || runs.isError) {
    return <div className="cf-assistant-content"><ErrorNote error={changes.error ?? runs.error} /></div>;
  }

  const relatedRunIds = new Set(
    (runs.data ?? [])
      .filter((run) =>
        run.targetOutlineNodeId === document.outlineNodeId ||
        runOriginDocumentId(run.policy) === document.id,
      )
      .map((run) => run.id),
  );
  const candidates = (changes.data ?? []).filter(
    (changeSet) =>
      changeSet.status === "candidate" &&
      relatedRunIds.has(changeSet.runId) &&
      changeSet.sourceDocumentVersionId === currentVersionId,
  );
  const activeSettlement = settlementRuns.find((run) =>
    ["pending", "running", "paused", "awaiting_user", "failed_recoverable"].includes(run.status),
  );

  return (
    <div className="cf-assistant-content cf-canon-panel">
      <div className="cf-section-title">
        <div>
          <h3>设定变化</h3>
          <p>正文生成可能带来人物、事实或世界观变化。先确认，再写入作品设定。</p>
        </div>
        <span className="cf-badge">{candidates.length} 条待确认</span>
      </div>
      {decisionConflict ? (
        <ConflictRecovery
          error={decisionConflict}
          refreshing={refreshingConflict}
          onKeepLocal={() => {
            setDecisionConflict(null);
            setConflictNotice("已保留当前设定，候选变化尚未写入。");
          }}
          onRefreshRemote={() => void refreshDecisionRemote()}
        />
      ) : null}
      {conflictNotice ? <p className="cf-editor-notice" role="status">{conflictNotice}</p> : null}
      {decision.isError && !decisionConflict ? <ErrorNote error={decision.error} /> : null}
      {activeSettlement ? <p className="cf-editor-notice" role="status">正在从当前版本提取设定变化，完成后会回到这里。</p> : null}
      {failedCurrentSettlement ? <div className="cf-editor-notice" data-tone="failed"><p>当前版本的设定变化提取失败，正文和版本仍然保留。</p><div className="cf-actions"><Link to={`/books/${projectId}/tasks/${failedCurrentSettlement.id}`}>查看失败任务</Link><button disabled={retrySettlement.isPending} onClick={() => retrySettlement.mutate()}>{retrySettlement.isPending ? "正在重试…" : "重试当前版本结算"}</button></div></div> : null}
      {retrySettlement.isError ? <ErrorNote error={retrySettlement.error} /> : null}
      {candidates.length === 0 ? (
        <div className="cf-empty cf-canon-empty">
          <Check size={28} />
          <p>当前章节没有待确认的设定变化。</p>
          <small>完成 AI 创作或保存版本后，新的候选会出现在这里。</small>
        </div>
      ) : (
        candidates.map((changeSet) => (
          <CanonChangeCard
            key={changeSet.id}
            changeSet={changeSet}
            busy={decision.isPending}
            onDecide={(action) => decision.mutate({ changeSet, action })}
          />
        ))
      )}
    </div>
  );
}

function CanonChangeCard({
  changeSet,
  busy,
  onDecide,
}: {
  changeSet: CanonChangeSetView;
  busy: boolean;
  onDecide: (action: "apply" | "reject") => void;
}) {
  const items = flattenChanges(changeSet.changes);
  return (
    <article className="cf-proposal cf-canon-change-card">
      <div className="cf-canon-change-meta">
        <strong>候选设定变化</strong>
        <small>{new Date(changeSet.createdAt).toLocaleString("zh-CN")}</small>
      </div>
      {items.length ? (
        <ul>
          {items.map((item) => <li key={item.path}><b>{item.path}</b><span>{item.value}</span></li>)}
        </ul>
      ) : <p>这条候选没有可展示的字段。</p>}
      <p className="cf-canon-change-source">
        来源任务：<Link to={`/books/${changeSet.projectId}/tasks/${changeSet.runId}?returnTo=${encodeURIComponent(`/books/${changeSet.projectId}/write`)}`}>{changeSet.runId}</Link>
      </p>
      {changeSet.sourceDocumentVersionId ? (
        <p className="cf-canon-change-source">
          证据正文版本：{shortId(changeSet.sourceDocumentVersionId)}；正文更新后需重新生成
          {changeSet.sourceDocumentId ? (
            <> · <Link to={`/books/${changeSet.projectId}/write/${changeSet.sourceDocumentId}`}>打开正文</Link></>
          ) : null}
        </p>
      ) : null}
      <div className="cf-actions">
        <button className="cf-primary" disabled={busy} onClick={() => onDecide("apply")}><Check size={14} />采纳并写入设定</button>
        <button disabled={busy} onClick={() => onDecide("reject")}><X size={14} />暂不采纳</button>
      </div>
    </article>
  );
}

function shortId(value: string): string {
  return value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
}

function runOriginDocumentId(policy: unknown): string | null {
  if (!policy || typeof policy !== "object") return null;
  const origin = (policy as { origin?: unknown }).origin;
  if (!origin || typeof origin !== "object") return null;
  const documentId = (origin as { documentId?: unknown }).documentId;
  return typeof documentId === "string" ? documentId : null;
}

function flattenChanges(changes: Record<string, unknown>): Array<{ path: string; value: string }> {
  const result: Array<{ path: string; value: string }> = [];
  const visit = (value: unknown, path: string) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const [key, nested] of Object.entries(value)) visit(nested, path ? `${path}.${key}` : key);
      return;
    }
    if (value === undefined) return;
    result.push({ path, value: formatChangeValue(value) });
  };
  visit(changes, "");
  return result.filter((item) => item.path).slice(0, 12);
}

function formatChangeValue(value: unknown): string {
  if (value === null) return "空值";
  if (Array.isArray(value)) {
    return value.map((item) => formatChangeValue(item)).join("、");
  }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, nested]) => `${key}：${formatChangeValue(nested)}`)
      .join("；");
  }
  return String(value);
}
