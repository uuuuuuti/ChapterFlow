import { useFlushWriting } from "../../app/layouts/chapterflow-shell";
import { requireUnchangedDraft } from "../draft-autosave/acceptance-guard";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  getProjectRunsPage,
  getRunDetail,
  controlRun,
  adoptRunStream,
  regenerateRunStream,
  getAutopilotSessions,
} from "../../shared/api/automation";
import { queryKeys } from "../../shared/query/keys";
import { ConflictRecovery, ErrorNote, ResourceErrorState } from "../../shared/ui";
import type {
  AutopilotSession,
  NarrativeRun,
  RunActionRequest,
} from "../../shared/api/types";
const states: Record<string, string> = {
  queued: "排队中",
  pending: "准备中",
  running: "正在创作",
  awaiting_user: "等待你确认",
  awaiting_confirmation: "等待你确认",
  paused: "已暂停",
  failed_recoverable: "等待重试",
  failed: "处理失败",
  cancelled: "已取消",
  completed: "已完成",
};
const terminalStatuses = new Set(["completed", "cancelled", "failed"]);
const liveStatuses = new Set([
  "queued",
  "pending",
  "running",
  "paused",
  "awaiting_user",
  "awaiting_confirmation",
  "failed_recoverable",
]);

type TaskGroupKey = "attention" | "active" | "recover" | "completed" | "unknown";

function groupForStatus(status: string): TaskGroupKey {
  if (status === "awaiting_user" || status === "awaiting_confirmation") return "attention";
  if (status === "failed_recoverable") return "recover";
  if (liveStatuses.has(status)) return "active";
  if (terminalStatuses.has(status)) return "completed";
  return "unknown";
}

const groupTitles: Record<TaskGroupKey, string> = {
  attention: "等待你的决定",
  active: "正在进行",
  recover: "失败待恢复",
  completed: "最近完成",
  unknown: "状态异常",
};

const batchStatuses: Record<AutopilotSession["status"], string> = {
  pending: "准备中",
  planning: "规划中",
  running: "进行中",
  paused: "已暂停",
  awaiting_user: "等待确认",
  failed: "需要处理",
  cancelled: "已取消",
  completed: "已完成",
};

const batchLiveStatuses = new Set<AutopilotSession["status"]>([
  "pending",
  "planning",
  "running",
  "awaiting_user",
]);

const actionLabels: Record<string, string> = {
  confirm: "确认结果",
  reject: "拒绝结果",
  accept_plan: "采用章纲",
  accept_manuscript: "接受正文",
  discard_manuscript: "放弃正文",
  pause: "暂停",
  resume: "继续",
  cancel: "取消任务",
  switch_to_manual: "改为手工写作",
  retry_chapter: "重试创作",
  request_revision: "请求重新修改",
  use_partial: "采用已有片段",
  regenerate: "重新生成",
};

const statusGuidance: Record<string, { next: string; safety: string }> = {
  queued: { next: "任务已排队，可以先离开页面。", safety: "尚未写入正文。" },
  pending: { next: "任务即将开始，可以先离开页面。", safety: "尚未写入正文。" },
  running: { next: "任务正在推进，完成后会停在需要你决定的节点。", safety: "生成结果仍是候选。" },
  awaiting_user: { next: "请查看候选结果，再选择采用、修改或放弃。", safety: "未确认前不会写入正式正文。" },
  awaiting_confirmation: { next: "请查看候选结果，再确认或拒绝。", safety: "未确认前不会写入正式正文。" },
  paused: { next: "任务已暂停，可以继续或取消。", safety: "当前正文和候选保持不变。" },
  failed_recoverable: { next: "任务中断，可以恢复片段、重新生成或结束任务。", safety: "失败结果不会覆盖正文。" },
  failed: { next: "任务已失败；章节任务可以重新创建，其他任务请回到来源重试。", safety: "失败结果不会覆盖正文。" },
  cancelled: { next: "任务已取消，可以回到来源继续手工创作。", safety: "已取消的结果不会自动写入。" },
  completed: { next: "任务已完成，可以查看结果并回到对应章节。", safety: "只有明确接受才会写入正文。" },
};

const awaitReasonLabels: Record<string, string> = {
  scene_plan_approval_required: "章纲等待确认",
  chapter_commit_approval_required: "正文候选等待确认",
  settlement_conflict_requires_resolution: "设定变化存在冲突，需要先处理",
  critical_review_unresolved: "检查仍有关键问题",
  quality_gate_blocked: "质量门槛未通过",
  semantic_review_blocked: "语义检查未通过",
  revision_limit_reached: "已达到修订轮次上限",
};

const actionGuidance: Record<string, string> = {
  accept_plan: "确认章纲后，任务才会进入正文创作。",
  accept_manuscript: "先确认本地正文没有未保存修改，再写入候选版本。",
  request_revision: "保留当前正文，按你的修改方向生成新的候选。",
  discard_manuscript: "放弃这版候选，正式正文不会改变。",
  switch_to_manual: "停止自动推进，回到手工写作。",
  use_partial: "将达到最低长度的中断片段作为候选恢复。",
  regenerate: "丢弃中断片段并重新生成。",
  retry_chapter: "重新创建本章任务，保留当前正文。",
  pause: "暂停后可以稍后从任务中心继续。",
  resume: "解除暂停并继续执行未完成步骤。",
  cancel: "结束任务，不会自动写入未确认结果。",
};

const actionReasonLabels: Record<string, string> = {
  "run.status.terminal": "任务已经结束，不能再改变执行状态。",
  "run.status.not_running": "任务尚未进入可暂停的执行状态。",
  "run.status.not_paused": "任务当前没有处于暂停状态。",
  "run.await_reason.mismatch": "当前停靠原因不需要这项操作。",
  "run.partial.unavailable": "没有可恢复的生成片段。",
  "run.partial.not_viable": "片段太短，不能直接采用，只能重新生成。",
  "run.retry.parent_task": "该任务属于连续创作批次，请从批次页面处理。",
  "run.retry.status": "只有已失败的章节任务可以重试。",
  "run.retry.recipe": "该任务类型没有单独重试入口。",
  "run.action.status": "当前任务状态不允许这项操作。",
};
export function TaskCenter({
  projectId,
  onNavigate,
}: {
  projectId: string;
  onNavigate?: () => void;
}) {
  const query = useInfiniteQuery({
    queryKey: [...queryKeys.runs(projectId), "page"],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => getProjectRunsPage(projectId, pageParam, signal),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    // 历史任务不需要高频轮询；只有仍可能推进的任务才保持实时状态。
    refetchInterval: (current) =>
      current.state.data?.pages.some((page) => page.items.some((run) => liveStatuses.has(run.status)))
        ? 2000
        : false,
  });
  const batches = useQuery({
    queryKey: queryKeys.autopilotSessions(projectId),
    queryFn: ({ signal }) => getAutopilotSessions(projectId, signal),
    refetchInterval: (current) =>
      current.state.data?.some((session) => batchLiveStatuses.has(session.status))
        ? 2000
        : false,
  });
  const runs = query.data?.pages.flatMap((page) => page.items) ?? null;
  const groups = runs
    ? (Object.keys(groupTitles) as TaskGroupKey[]).map((key) => ({
        key,
        runs: runs.filter((run) => groupForStatus(run.status) === key),
      }))
    : [];
  const visibleRuns = groups.flatMap((group) =>
    group.runs.slice(0, group.key === "completed" ? 12 : undefined),
  );
  const defaultRunId =
    visibleRuns.find((run) => groupForStatus(run.status) === "unknown")?.id ??
    visibleRuns.find((run) =>
      ["awaiting_user", "awaiting_confirmation", "failed_recoverable"].includes(
        run.status,
      ),
    )?.id ??
    visibleRuns[0]?.id ??
    null;
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const selectedRunIdInView = visibleRuns.some((run) => run.id === selectedRunId)
    ? selectedRunId
    : defaultRunId;
  const selectedRun = visibleRuns.find(
    (run) => run.id === selectedRunIdInView,
  );
  return (
    <>
      {batches.isError ? (
        <ErrorNote error={batches.error} title="连续创作批次读取失败" />
      ) : null}
      {batches.data?.length ? (
        <BatchOverview projectId={projectId} sessions={batches.data} />
      ) : null}
      {query.isError ? <ErrorNote error={query.error} /> : null}
      {query.isPending ? <p>正在读取任务…</p> : null}
      {runs?.length === 0 ? (
        <p>还没有创作任务。你可以随时开始手工写作。</p>
      ) : null}
      {runs?.length ? (
        <>
          <p className="cf-task-center-hint">
            先从列表选择一项查看详情；历史任务不会同时加载全部结果。
          </p>
          {groups.map((group) => (
            <TaskGroup
              key={group.key}
              projectId={projectId}
              title={groupTitles[group.key]}
              runs={group.runs.slice(
                0,
                group.key === "completed" ? 12 : undefined,
              )}
              selectedRunId={selectedRunIdInView}
              onSelect={setSelectedRunId}
              onNavigate={onNavigate}
            />
          ))}
          {selectedRun ? (
            <section className="cf-task-detail-panel" aria-label="任务详情">
              <div className="cf-task-detail-heading">
                <div>
                  <small>当前查看</small>
                  <strong>{taskRecipeLabel(selectedRun)}</strong>
                </div>
                <span className="cf-badge">
                  {states[selectedRun.status] ?? "未知状态"}
                </span>
              </div>
              <TaskResult
                projectId={projectId}
                runId={selectedRun.id}
              />
            </section>
          ) : null}
        </>
      ) : null}
      {query.hasNextPage ? (
        <button className="cf-button" type="button" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
          {query.isFetchingNextPage ? "正在读取更早任务…" : `加载更早任务（已载入 ${runs?.length ?? 0} 项）`}
        </button>
      ) : null}
    </>
  );
}

function BatchOverview({
  projectId,
  sessions,
}: {
  projectId: string;
  sessions: AutopilotSession[];
}) {
  const recent = sessions
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 6);
  return (
    <section className="cf-card cf-task-batches" aria-label="连续创作批次">
      <header className="cf-section-title">
        <div>
          <h3>连续创作批次</h3>
          <p>按批次查看章节进度；每章仍需按当前授权策略单独确认。</p>
        </div>
        <small>{sessions.length} 个批次</small>
      </header>
      <div className="cf-task-batch-list">
        {recent.map((session) => {
          const finished = session.completedChapters + session.skippedChapters;
          const progress = Math.min(
            100,
            Math.round((finished / Math.max(1, session.targetChapters)) * 100),
          );
          const errorMessage =
            session.lastError && typeof session.lastError.message === "string"
              ? session.lastError.message
              : null;
          return (
            <article className="cf-task-batch-row" key={session.id}>
              <div className="cf-task-batch-main">
                <div className="cf-task-batch-heading">
                  <strong>批次 {session.id.slice(0, 8)}</strong>
                  <span className="cf-badge">{batchStatuses[session.status]}</span>
                </div>
                <p>
                  {finished} / {session.targetChapters} 章 · {session.approvalMode === "per_chapter" ? "逐章确认" : "连续推进"}
                </p>
                {errorMessage ? (
                  <small className="cf-task-batch-error">上次停靠：{errorMessage}</small>
                ) : null}
                <div className="cf-task-batch-progress" aria-label={`批次进度 ${progress}%`}>
                  <span style={{ width: `${progress}%` }} />
                </div>
              </div>
              <Link
                className="cf-text-link"
                to={`/books/${projectId}/quick-create?session=${encodeURIComponent(session.id)}`}
              >
                打开批次 →
              </Link>
            </article>
          );
        })}
      </div>
    </section>
  );
}
function TaskGroup({
  projectId,
  title,
  runs,
  selectedRunId,
  onSelect,
  onNavigate,
}: {
  projectId: string;
  title: string;
  runs: NarrativeRun[];
  selectedRunId: string | null;
  onSelect: (runId: string) => void;
  onNavigate: (() => void) | undefined;
}) {
  if (!runs.length) return null;
  return (
    <section className="cf-task-group">
      <h3>
        {title} <small>{runs.length}</small>
      </h3>
      <div className="cf-task-list">
        {runs.map((run) => (
          <div
            className="cf-task-row"
            data-selected={run.id === selectedRunId}
            key={run.id}
          >
            <button
              type="button"
              className="cf-task-row-main"
              onClick={() => onSelect(run.id)}
            >
              <span className="cf-task-row-heading">
                <strong>{taskRecipeLabel(run)}</strong>
                <span className="cf-badge">
                  {states[run.status] ?? "未知状态"}
                </span>
              </span>
              <span className="cf-task-row-meta">
                {run.targetOutlineNodeId ? "已关联章节" : "项目级任务"} ·{" "}
                {formatTaskTime(run.updatedAt)}
              </span>
            </button>
            <Link
              className="cf-task-row-action"
              to={`/books/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(run.id)}`}
              onClick={onNavigate}
            >
              查看详情 →
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}

function taskRecipeLabel(run: Pick<NarrativeRun, "recipe">): string {
  if (run.recipe === "chapter-production") return "章节创作";
  if (run.recipe.includes("review")) return "章节检查";
  if (run.recipe.includes("selection")) return "选区改写";
  if (run.recipe.includes("assistant")) return "协作助手";
  return "创作任务";
}

function formatTaskTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";
  return date.toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
export function TaskResult({
  projectId,
  runId,
  onAccepted,
  recoveryHref = `/books/${projectId}/dashboard`,
}: {
  projectId: string;
  runId: string;
  onAccepted?: () => void;
  recoveryHref?: string;
}) {
  const client = useQueryClient();
  const flushWriting = useFlushWriting();
  const navigate = useNavigate();
  const [revisionInstruction, setRevisionInstruction] = useState("");
  const [conflictDismissed, setConflictDismissed] = useState(false);
  const [conflictRefreshing, setConflictRefreshing] = useState(false);
  const [recoveryNotice, setRecoveryNotice] = useState("");
  const query = useQuery({
    queryKey: queryKeys.run(runId),
    queryFn: ({ signal }) => getRunDetail(projectId, runId, signal),
    refetchInterval: (q) =>
      q.state.data &&
      ["completed", "cancelled", "failed"].includes(q.state.data.run.status)
        ? false
        : 1500,
  });
  const origin = query.data?.run.policy.origin as
    | { documentId?: string; surface?: string }
    | undefined;
  const sourceDocumentId = query.data?.result.documentId ?? origin?.documentId ?? null;
  const mutation = useMutation({
    mutationFn: async (input: RunActionRequest) => {
      if (input.action === "accept_manuscript") {
        if (!(await flushWriting())) throw new Error("请先保存当前正文。");
        const origin = query.data?.run.policy.origin as
          { documentId?: string } | undefined;
        const documentId = query.data?.result.documentId ?? origin?.documentId;
        if (documentId) await requireUnchangedDraft(projectId, documentId);
      }
      return controlRun(projectId, runId, input);
    },
    onSuccess: async () => {
      setConflictDismissed(true);
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.run(runId) }),
        client.invalidateQueries({ queryKey: queryKeys.project(projectId) }),
        client.invalidateQueries({ queryKey: queryKeys.autopilotSessions(projectId) }),
      ]);
      onAccepted?.();
    },
    onError: () => {
      setConflictDismissed(false);
      setRecoveryNotice("");
    },
  });
  const streamMutation = useMutation({
    mutationFn: async (action: "use_partial" | "regenerate") => {
      const partial = query.data?.streams
        .slice()
        .reverse()
        .find((stream) => stream.status === "interrupted");
      if (!partial) throw new Error("没有可恢复的部分结果。");
      const input = { stepId: partial.stepId, attempt: partial.attempt };
      return action === "use_partial"
        ? adoptRunStream(projectId, runId, input)
        : regenerateRunStream(projectId, runId, input);
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: queryKeys.run(runId) });
      await client.invalidateQueries({ queryKey: queryKeys.runs(projectId) });
      await client.invalidateQueries({ queryKey: queryKeys.autopilotSessions(projectId) });
    },
  });
  const refreshRemoteAfterConflict = async () => {
    setConflictRefreshing(true);
    try {
      const refreshed = await query.refetch();
      if (refreshed.error) throw refreshed.error;
      if (sourceDocumentId) {
        await client.invalidateQueries({
          queryKey: queryKeys.document(projectId, sourceDocumentId),
        });
      }
      setConflictDismissed(true);
      setRecoveryNotice("已重新读取任务和远端正文，本地未保存修改已放弃。请确认候选后再继续。");
    } catch (error) {
      setRecoveryNotice(error instanceof Error ? error.message : "远端状态读取失败，请稍后重试。 ");
    } finally {
      setConflictRefreshing(false);
    }
  };
  const conflictError = mutation.error;
  if (query.isError)
    return (
      <ResourceErrorState
        error={query.error}
        backHref={recoveryHref}
        backLabel="回到创作首页"
        title="找不到这项任务"
        description="任务可能已经被清理，或者当前链接来自另一部作品。"
      />
    );
  if (!query.data) return <p role="status">正在读取创作进度…</p>;
  const { run, result, availableActions } = query.data;
  const content = result.manuscriptCandidate?.content;
  const plan = result.planCandidate?.chapterGoal;
  const unknownStatus = states[run.status] === undefined;
  const taskSourceDocumentId = result.documentId ?? origin?.documentId ?? null;
  const guidance = statusGuidance[run.status];
  const visibleActions = availableActions.filter((action) => actionLabels[action]);
  const unavailableActions = (query.data.actionAvailability ?? []).filter(
    (item) => !item.available && actionLabels[item.action],
  );
  const awaitReason = query.data.events
    .slice()
    .reverse()
    .find((event) => event.type === "run.awaiting_user")?.payload.reason;
  const partial = result
    ? query.data.streams.slice().reverse().find((stream) => stream.status === "interrupted")
    : null;
  const diagnosticText = JSON.stringify(
    {
      run,
      steps: query.data.steps,
      events: query.data.events.slice(-30),
      latestCheckpoint: query.data.latestCheckpoint,
    },
    null,
    2,
  );
  const copyDiagnostics = async () => {
    try {
      if (!navigator.clipboard) throw new Error("clipboard-unavailable");
      await navigator.clipboard.writeText(diagnosticText);
      setRecoveryNotice("任务诊断已复制，可以贴到本地问题记录中。");
    } catch {
      setRecoveryNotice("当前浏览器不允许自动复制，请使用下载日志。");
    }
  };
  const downloadDiagnostics = () => {
    const blob = new Blob([diagnosticText], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `chapterflow-task-${run.id}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setRecoveryNotice("任务诊断已下载。");
  };
  return (
    <article className="cf-card cf-task">
      <h3>
        {run.recipe === "chapter-production"
          ? "章节创作"
          : run.recipe.includes("review")
            ? "章节检查"
            : run.recipe.includes("selection")
              ? "选区改写"
              : "创作任务"}
      </h3>
      <span className="cf-badge">{states[run.status] ?? "状态异常"}</span>
      <div className="cf-task-status-summary" aria-label="任务状态说明">
        <strong>{guidance?.next ?? "系统无法判断下一步，请先重新读取状态。"}</strong>
        <p>{guidance?.safety ?? "自动推进已停止，未识别的结果不会写入正文。"}</p>
        {typeof awaitReason === "string" ? (
          <small>
            停靠原因：{awaitReasonLabels[awaitReason] ?? awaitReason}
          </small>
        ) : null}
        {visibleActions.length ? <small>当前可用：{visibleActions.map((action) => actionLabels[action]).join("、")}</small> : null}
      </div>
      {unknownStatus ? (
        <div className="cf-task-unknown" role="alert">
          <strong>任务状态无法识别</strong>
          <p>系统已停止自动推进，当前状态为「{run.status}」。请重新读取后再决定下一步。</p>
          <button type="button" onClick={() => void query.refetch()}>重新读取状态</button>
        </div>
      ) : null}
      {typeof plan === "string" ? <p>{plan}</p> : null}
      {typeof content === "string" ? (
        <>
          <h4>AI 建议正文</h4>
          {run.status === "completed" ? (
            <details>
              <summary>查看创作结果</summary>
              <pre>{content}</pre>
            </details>
          ) : (
            <>
              <pre>{content}</pre>
              <small>接受后才会写入正式正文。</small>
            </>
          )}
        </>
      ) : null}
      {taskSourceDocumentId ? (
        <p>
          <Link
            className="cf-text-link"
            to={`/books/${projectId}/write/${taskSourceDocumentId}`}
          >
            打开章节 →
          </Link>
        </p>
      ) : null}
      {query.data.parentTask ? (
        <p>
          <Link className="cf-text-link" to={`/books/${projectId}/quick-create?session=${encodeURIComponent(query.data.parentTask.id)}`}>
            返回连续创作任务 →
          </Link>
        </p>
      ) : null}
      {run.targetOutlineNodeId ? (
        <p>
          <Link className="cf-text-link" to={`/books/${projectId}/outline?node=${encodeURIComponent(run.targetOutlineNodeId)}`}>
            查看对应章节大纲 →
          </Link>
        </p>
      ) : null}
      {availableActions.includes("request_revision") ? (
        <div className="cf-task-revision">
          <label>
            修改方向
            <textarea
              rows={2}
              value={revisionInstruction}
              onChange={(event) => setRevisionInstruction(event.target.value)}
              placeholder="例如：保留冲突升级，收紧这一段的节奏。"
            />
          </label>
        </div>
      ) : null}
      {conflictError && !conflictDismissed ? (
        <ConflictRecovery
          error={conflictError}
          refreshing={conflictRefreshing}
          onKeepLocal={() => {
            setConflictDismissed(true);
            setRecoveryNotice("已保留当前本地稿。任务候选尚未采纳，确认正文来源后可重新执行动作。");
          }}
          onRefreshRemote={() => void refreshRemoteAfterConflict()}
          onOpenDiff={
            taskSourceDocumentId
              ? () => {
                  setConflictDismissed(true);
                  navigate(`/books/${projectId}/write/${taskSourceDocumentId}?history=1`);
                }
              : undefined
          }
        />
      ) : null}
      {recoveryNotice ? <p className="cf-editor-notice" role="status">{recoveryNotice}</p> : null}
      <div className="cf-actions">
        {visibleActions
          .map((action) => (
            <button
              key={action}
              className={action === "accept_manuscript" ? "cf-primary" : ""}
              title={actionGuidance[action]}
              disabled={mutation.isPending}
              onClick={() => {
                if (action === "use_partial" || action === "regenerate") {
                  streamMutation.mutate(action);
                  return;
                }
                mutation.mutate(
                  action === "retry_chapter"
                      ? { action, requestId: crypto.randomUUID() }
                      : action === "request_revision"
                        ? { action, requestId: crypto.randomUUID(), ...(revisionInstruction.trim() ? { instruction: revisionInstruction.trim() } : {}) }
                      : ({ action } as RunActionRequest),
                );
              }}
            >
              {actionLabels[action]}
            </button>
          ))}
      </div>
      {unavailableActions.length ? (
        <details className="cf-task-availability">
          <summary>其他操作为何不可用</summary>
          <ul>
            {unavailableActions.map((item) => (
              <li key={item.action}>
                <strong>{actionLabels[item.action]}</strong>
                <span>
                  {actionReasonLabels[item.reasonCode ?? ""] ??
                    "当前任务状态不允许这项操作。"}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {mutation.isError ? <ErrorNote error={mutation.error} /> : null}
      {streamMutation.isError ? <ErrorNote error={streamMutation.error} /> : null}
      {partial ? <small className="cf-task-partial-note">检测到一段可恢复的生成结果。</small> : null}
      {unknownStatus ? (
        <details className="cf-task-diagnostics">
          <summary>查看任务诊断</summary>
          <p>任务编号：{run.id}</p>
          <p>最近更新时间：{run.updatedAt}</p>
          <div className="cf-actions">
            <button type="button" onClick={() => void copyDiagnostics()}>复制诊断</button>
            <button type="button" onClick={downloadDiagnostics}>下载日志</button>
          </div>
          {query.data.events.slice(-8).map((event) => <pre key={event.id}>{JSON.stringify(event.payload)}</pre>)}
        </details>
      ) : null}
    </article>
  );
}
