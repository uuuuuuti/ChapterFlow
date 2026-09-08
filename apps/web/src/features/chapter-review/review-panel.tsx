import { useFlushWriting } from "../../app/layouts/chapterflow-shell";
import { requireUnchangedDraft } from "../draft-autosave/acceptance-guard";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getReviewWorkspace,
  decideReviewIssue,
  decideRevisionProposal,
} from "../../shared/api/review";
import { queryKeys } from "../../shared/query/keys";
import { ErrorNote } from "../../shared/ui";
import type { ReviewWorkspaceIssue } from "../../shared/api/types";
export function ReviewPanel({
  projectId,
  documentId,
  onCheck,
  onRevise,
  busy,
}: {
  projectId: string;
  documentId: string;
  onCheck: () => void;
  onRevise: (instruction: string) => void;
  busy: boolean;
}) {
  const client = useQueryClient();
  const flushWriting = useFlushWriting();
  const query = useQuery({
    queryKey: queryKeys.review(projectId),
    queryFn: ({ signal }) => getReviewWorkspace(projectId, signal),
    refetchInterval: 2500,
  });
  const refresh = () =>
    client.invalidateQueries({ queryKey: queryKeys.project(projectId) });
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
    onSuccess: refresh,
  });
  const reports =
    query.data?.reports.filter((r) => r.documentId === documentId) ?? [];
  const report = reports[0];
  return (
    <div className="cf-assistant-content">
      <h3>给这一章做一次检查</h3>
      <p>人物一致性、设定、剧情逻辑、节奏与阅读动力。</p>
      <button className="cf-primary" onClick={onCheck} disabled={busy}>
        {busy ? "正在提交…" : "检查本章"}
      </button>
      {query.isError ? <ErrorNote error={query.error} /> : null}
      {!report ? (
        <p>还没有检查结果。检查会先保存当前正文。</p>
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
      {query.data?.proposals
        .filter((p) => p.documentId === documentId && p.status === "proposed")
        .map((p) => (
          <article className="cf-proposal" key={p.id}>
            <h4>建议修订</h4>
            <del>{p.baseContent}</del>
            <ins>{p.revisedContent}</ins>
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
          </article>
        ))}
      {decision.isError ? <ErrorNote error={decision.error} /> : null}
      {revise.isError ? <ErrorNote error={revise.error} /> : null}
    </div>
  );
}
