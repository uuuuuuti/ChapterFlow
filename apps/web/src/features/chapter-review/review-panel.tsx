import { useFlushWriting } from "../../app/layouts/chapterflow-shell";
import { requireUnchangedDraft } from "../draft-autosave/acceptance-guard";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getReviewWorkspace,
  decideReviewIssue,
  decideRevisionProposal,
} from "../../shared/api/review";
import { queryKeys } from "../../shared/query/keys";
import { ConflictRecovery, ErrorNote } from "../../shared/ui";
import type { ReviewWorkspaceIssue } from "../../shared/api/types";
import { isAuthoringConflict } from "../../shared/api/client";
import { useState } from "react";
export function ReviewPanel({
  projectId,
  documentId,
  currentVersionId,
  onCheck,
  onRevise,
  busy,
}: {
  projectId: string;
  documentId: string;
  currentVersionId: string | null;
  onCheck: () => void;
  onRevise: (instruction: string) => void;
  busy: boolean;
}) {
  const client = useQueryClient();
  const flushWriting = useFlushWriting();
  const [revisionConflict, setRevisionConflict] = useState<unknown>(null);
  const [conflictNotice, setConflictNotice] = useState("");
  const [refreshingConflict, setRefreshingConflict] = useState(false);
  const query = useQuery({
    queryKey: queryKeys.review(projectId),
    queryFn: ({ signal }) => getReviewWorkspace(projectId, signal),
    refetchInterval: 2500,
  });
  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: queryKeys.review(projectId) }),
      client.invalidateQueries({ queryKey: queryKeys.project(projectId) }),
    ]);
  };
  const decision = useMutation({
    mutationFn: ({
      issue,
      action,
    }: {
      issue: ReviewWorkspaceIssue;
      action: "accept" | "false_positive" | "intentional_keep";
    }) =>
      decideReviewIssue(projectId, issue.id, {
        action,
        note: null,
        expectedStatus: issue.status,
      }),
    onSuccess: refresh,
  });
  const revise = useMutation({
    mutationFn: async ({
      id,
      action,
    }: {
      id: string;
      action: "apply" | "reject";
    }) => {
      if (action === "apply") {
        if (!(await flushWriting())) throw new Error("请先保存当前正文。");
        await requireUnchangedDraft(projectId, documentId);
      }
      return decideRevisionProposal(projectId, id, action);
    },
    onSuccess: () => {
      setRevisionConflict(null);
      setConflictNotice("");
      refresh();
    },
    onError: (error) => {
      if (isAuthoringConflict(error)) setRevisionConflict(error);
    },
  });
  const refreshRevisionRemote = async () => {
    setRefreshingConflict(true);
    try {
      await query.refetch();
      setRevisionConflict(null);
      setConflictNotice("已重新读取检查报告和正文版本，请确认最新建议后再操作。");
    } finally {
      setRefreshingConflict(false);
    }
  };
  const reports =
    query.data?.reports
      .filter((r) => r.documentId === documentId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)) ?? [];
  const currentReports = currentVersionId
    ? reports.filter((r) => r.documentVersionId === currentVersionId)
    : [];
  const staleReports = reports.filter(
    (r) => r.documentVersionId !== currentVersionId,
  );
  const report = currentReports[0];
  const proposals =
    query.data?.proposals.filter((p) => p.documentId === documentId) ?? [];
  const currentProposals = currentVersionId
    ? proposals.filter((p) => p.baseDocumentVersionId === currentVersionId)
    : [];
  const staleProposals = proposals.filter(
    (p) => p.baseDocumentVersionId !== currentVersionId,
  );
  return (
    <div className="cf-assistant-content">
      <h3>给这一章做一次检查</h3>
      <p>人物一致性、设定、剧情逻辑、节奏与阅读动力。</p>
      <button className="cf-primary" onClick={onCheck} disabled={busy}>
        {busy ? "正在提交…" : "检查本章"}
      </button>
      {query.isError ? <ErrorNote error={query.error} /> : null}
      {!report ? (
        <>
          <p>
            {staleReports.length > 0
              ? `已有 ${staleReports.length} 份旧版本检查报告；当前正文版本尚未检查。请重新检查，旧报告不能用于当前正文。`
              : "还没有检查结果。检查会先保存当前正文。"}
          </p>
        </>
      ) : (
        <>
          <h3>
            {report.verdict === "pass" ? "本章检查通过" : "有些地方值得再打磨"}
          </h3>
          <p>{report.summary}</p>
          {report.issues.map((issue) => (
            <article className="cf-review-issue" key={issue.id}>
              <span className="cf-badge">
                {issue.status === "open"
                  ? "待处理"
                  : issue.status === "accepted"
                    ? "已确认"
                    : issue.status === "resolved"
                      ? "已解决"
                      : "已排除"}
              </span>
              <h4>{issue.message}</h4>
              {issue.evidence.map((e, i) => (
                <blockquote key={i}>{e.quote}</blockquote>
              ))}
              <p>{issue.suggestedDirection}</p>
              {issue.status === "open" || issue.status === "accepted" ? (
                <button
                  disabled={busy}
                  onClick={() =>
                    onRevise(
                      `请针对以下检查问题修改本章，保留无关情节和已确认设定。\n问题：${issue.message}\n原文证据：${issue.evidence.map((e) => e.quote).join("；")}\n修改方向：${issue.suggestedDirection ?? "以最小必要修改解决问题"}`,
                    )
                  }
                >
                  生成修改建议
                </button>
              ) : null}
              {issue.status === "open" ? (
                <div className="cf-actions">
                  <button
                    disabled={decision.isPending}
                    onClick={() => decision.mutate({ issue, action: "accept" })}
                  >
                    确认问题
                  </button>
                  <button
                    disabled={decision.isPending}
                    onClick={() =>
                      decision.mutate({ issue, action: "intentional_keep" })
                    }
                  >
                    有意保留
                  </button>
                  <button
                    disabled={decision.isPending}
                    onClick={() =>
                      decision.mutate({ issue, action: "false_positive" })
                    }
                  >
                    标记误报
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </>
      )}
      {staleReports.length > 0 ? (
        <details className="cf-review-stale">
          <summary>
            {report
              ? `已隐藏 ${staleReports.length} 份旧版本检查报告`
              : `查看 ${staleReports.length} 份旧版本检查报告`}
          </summary>
          {staleReports.map((stale) => (
            <article key={stale.id}>
              <strong>
                旧版本 · {stale.documentVersionId ?? "未绑定版本"} · {stale.createdAt.slice(0, 16)}
              </strong>
              <p>{stale.summary}</p>
              <small>此报告仅供追溯，问题裁定和修改建议已停用。</small>
            </article>
          ))}
        </details>
      ) : null}
      {currentProposals.map((p) => (
          <article className="cf-proposal" key={p.id}>
            <h4>建议修订</h4>
            <del>{p.baseContent}</del>
            <ins>{p.revisedContent}</ins>
            {p.acceptedDocumentVersionId ? (
              <small>已绑定正式版本：{p.acceptedDocumentVersionId}</small>
            ) : null}
            {p.status === "proposed" ? (
              <div className="cf-actions">
                <button
                  disabled={revise.isPending}
                  onClick={() => revise.mutate({ id: p.id, action: "apply" })}
                >
                  接受修订
                </button>
                <button
                  disabled={revise.isPending}
                  onClick={() => revise.mutate({ id: p.id, action: "reject" })}
                >
                  放弃
                </button>
              </div>
            ) : <small>状态：{p.status === "accepted" ? "已采纳" : p.status === "rejected" ? "已放弃" : "已被替代"}</small>}
          </article>
        ))}
      {staleProposals.length > 0 ? (
        <details className="cf-review-stale">
          <summary>已隐藏 {staleProposals.length} 条旧版本修订建议</summary>
          <p>这些建议基于其他正文版本，不能直接覆盖当前正文。请重新检查后生成新的建议。</p>
        </details>
      ) : null}
      {decision.isError ? <ErrorNote error={decision.error} /> : null}
      {revisionConflict ? (
        <ConflictRecovery
          error={revisionConflict}
          refreshing={refreshingConflict}
          onKeepLocal={() => {
            setRevisionConflict(null);
            setConflictNotice("已保留当前正文，建议修订尚未采纳。");
          }}
          onRefreshRemote={() => void refreshRevisionRemote()}
        />
      ) : null}
      {conflictNotice ? <p className="cf-editor-notice" role="status">{conflictNotice}</p> : null}
      {revise.isError && !revisionConflict ? <ErrorNote error={revise.error} /> : null}
    </div>
  );
}
