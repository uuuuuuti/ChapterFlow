import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AUTOMATION_DEFAULTS, AUTOMATION_LIMITS } from "@narralume/contracts";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CirclePause,
  CirclePlay,
  RotateCcw,
  Send,
  Square,
  WandSparkles,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import {
  controlAutopilotSession,
  createAutopilotSession,
  decideStorySteer,
  getAutopilotSession,
  getAutopilotSessions,
  getStoryCompass,
  resolveAutopilotFailure,
  sendStorySteer,
  updateStoryCompass,
} from "../../shared/api/automation";
import { ApiError } from "../../shared/api/client";
import { useStory } from "../../entities/project/queries";
import type {
  AutopilotSession,
  AutopilotSessionDetail,
  OutlineNode,
  SessionActionRequest,
} from "../../shared/api/types";
import { queryKeys } from "../../shared/query/keys";
import { ErrorNote, ResourceErrorState } from "../../shared/ui";

const ACTIVE_SESSION_STATUSES = new Set<AutopilotSession["status"]>([
  "pending",
  "planning",
  "running",
]);
const CHAPTER_RESULT_PAGE_SIZE = 12;

const statusLabels: Record<AutopilotSession["status"], string> = {
  pending: "准备中",
  planning: "规划中",
  running: "创作中",
  paused: "已暂停",
  awaiting_user: "等待确认",
  failed: "需要处理",
  cancelled: "已取消",
  completed: "已完成",
};

export function QuickCreatePage() {
  const { projectId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const story = useStory(projectId);
  const requestedStartOutlineNodeId = searchParams.get("fromOutline");
  const chapters = useMemo(
    () =>
      (story.data?.outline ?? []).filter(
        (node) => node.kind === "chapter" && node.status !== "abandoned",
      ),
    [story.data?.outline],
  );
  const selectedId = searchParams.get("session");
  const sessions = useQuery({
    queryKey: queryKeys.autopilotSessions(projectId),
    queryFn: ({ signal }) => getAutopilotSessions(projectId, signal),
    enabled: Boolean(projectId),
    refetchInterval: (query) =>
      query.state.data?.some((session) => ACTIVE_SESSION_STATUSES.has(session.status))
        ? 2_000
        : false,
  });
  const compass = useQuery({
    queryKey: queryKeys.compass(projectId),
    queryFn: ({ signal }) => getStoryCompass(projectId, signal),
    enabled: Boolean(projectId),
    retry: false,
  });
  const orderedSessions = useMemo(
    () =>
      (sessions.data ?? []).slice().sort((left, right) =>
        right.updatedAt.localeCompare(left.updatedAt),
      ),
    [sessions.data],
  );
  const activeSession = orderedSessions.find((session) =>
    ACTIVE_SESSION_STATUSES.has(session.status),
  );
  const effectiveSelectedId =
    (selectedId && orderedSessions.some((session) => session.id === selectedId)
      ? selectedId
      : null) ?? activeSession?.id ?? orderedSessions[0]?.id ?? null;
  const requestedSessionMissing = Boolean(
    selectedId &&
      sessions.isSuccess &&
      !orderedSessions.some((session) => session.id === selectedId),
  );
  const detail = useQuery({
    queryKey: queryKeys.autopilotSession(effectiveSelectedId),
    queryFn: ({ signal }) => getAutopilotSession(effectiveSelectedId!, signal),
    enabled: Boolean(effectiveSelectedId),
    refetchInterval: (query) =>
      query.state.data && ACTIVE_SESSION_STATUSES.has(query.state.data.session.status)
        ? 1_500
        : false,
  });

  useEffect(() => {
    if (effectiveSelectedId && selectedId !== effectiveSelectedId) {
      const next = new URLSearchParams(searchParams);
      next.set("session", effectiveSelectedId);
      setSearchParams(next, { replace: true });
    }
  }, [effectiveSelectedId, searchParams, selectedId, setSearchParams]);

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryKeys.autopilotSessions(projectId),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.autopilotSession(effectiveSelectedId),
      }),
      queryClient.invalidateQueries({ queryKey: queryKeys.runs(projectId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.overview(projectId) }),
    ]);
  };
  const create = useMutation({
    mutationFn: (input: Parameters<typeof createAutopilotSession>[1]) =>
      createAutopilotSession(projectId, input),
    onSuccess: async (session) => {
      await invalidate();
      const next = new URLSearchParams(searchParams);
      next.set("session", session.id);
      setSearchParams(next, { replace: true });
    },
  });
  const action = useMutation({
    mutationFn: (input: SessionActionRequest) =>
      controlAutopilotSession(effectiveSelectedId!, input),
    onSuccess: invalidate,
  });
  const resolution = useMutation({
    mutationFn: (input: "retry-current" | "skip-chapter" | "replan" | "stop") =>
      resolveAutopilotFailure(effectiveSelectedId!, input),
    onSuccess: invalidate,
  });
  const steer = useMutation({
    mutationFn: (content: string) =>
      sendStorySteer(effectiveSelectedId!, {
        requestId: crypto.randomUUID(),
        content,
      }),
    onSuccess: invalidate,
  });
  const steerDecision = useMutation({
    mutationFn: (input: { id: string; action: "apply" | "reject" }) =>
      decideStorySteer(effectiveSelectedId!, input.id, input.action),
    onSuccess: invalidate,
  });
  const error =
    sessions.error ??
    compass.error ??
    story.error ??
    detail.error ??
    create.error ??
    action.error ??
    resolution.error ??
    steer.error ??
    steerDecision.error;

  if (!projectId) return null;
  return (
    <div className="cf-page cf-quick-create-page">
      <div className="cf-page-title">
        <div>
          <Link className="cf-text-link" to={`/books/${projectId}/dashboard`}>
            <ArrowLeft size={15} /> 返回创作首页
          </Link>
          <p className="cf-eyebrow">QUICK CREATE</p>
          <h1>连续创作</h1>
          <p>让 AI 按你的规则推进多章内容，每一步都可暂停、检查和收回。</p>
        </div>
        <span className="cf-badge">正文只在你确认后写入</span>
      </div>
      {error ? <ErrorNote error={error} /> : null}
      {requestedSessionMissing ? (
        <ResourceErrorState
          error={new ApiError(
            "autopilot.session.not_found",
            "找不到这次连续创作",
            404,
          )}
          backHref={`/books/${projectId}/quick-create`}
          backLabel="回到连续创作"
          title="找不到这次连续创作"
          description="这次创作航次可能已被删除，或当前书签已经过期。"
        />
      ) : null}
      <div className="cf-quick-create-grid">
        <QuickCreateSetup
          key={`${compass.data?.updatedAt ?? "pending"}:${requestedStartOutlineNodeId ?? ""}`}
          projectId={projectId}
          compass={compass.data}
          pending={create.isPending}
          chapters={chapters}
          initialStartOutlineNodeId={
            requestedStartOutlineNodeId &&
            chapters.some((chapter) => chapter.id === requestedStartOutlineNodeId)
              ? requestedStartOutlineNodeId
              : ""
          }
          onSubmit={(input) => create.mutate(input)}
        />
        <SessionList
          sessions={orderedSessions}
          selectedId={effectiveSelectedId}
          onSelect={(id) => {
            const next = new URLSearchParams(searchParams);
            next.set("session", id);
            setSearchParams(next);
          }}
          pending={sessions.isPending}
        />
      </div>
      {detail.data ? (
        <SessionDetailPanel
          detail={detail.data}
          chapters={chapters}
          actionPending={action.isPending || resolution.isPending}
          steerPending={steer.isPending || steerDecision.isPending}
          onAction={(input) => action.mutate(input)}
          onResolution={(input) => resolution.mutate(input)}
          onSteer={(content) => steer.mutate(content)}
          onSteerDecision={(id, decision) => steerDecision.mutate({ id, action: decision })}
        />
      ) : effectiveSelectedId && detail.isPending ? (
        <section className="cf-card" role="status">正在读取连续创作进度…</section>
      ) : null}
    </div>
  );
}

function QuickCreateSetup({
  projectId,
  compass,
  pending,
  chapters,
  initialStartOutlineNodeId,
  onSubmit,
}: {
  projectId: string;
  compass: Awaited<ReturnType<typeof getStoryCompass>> | undefined;
  pending: boolean;
  chapters: OutlineNode[];
  initialStartOutlineNodeId: string;
  onSubmit: (input: Parameters<typeof createAutopilotSession>[1]) => void;
}) {
  const [approvalMode, setApprovalMode] = useState<"continuous" | "per_chapter">("per_chapter");
  const [planningMode, setPlanningMode] = useState<"auto" | "confirm">("confirm");
  const [targetChapters, setTargetChapters] = useState(compass?.target.chapters ?? AUTOMATION_DEFAULTS.targetChapters);
  const [windowSize, setWindowSize] = useState(3);
  const [maxRevisionCycles, setMaxRevisionCycles] = useState(2);
  const [qualityPreset, setQualityPreset] = useState<"fast" | "standard" | "deep">("standard");
  const [planningOnly, setPlanningOnly] = useState(false);
  const [startOutlineNodeId, setStartOutlineNodeId] = useState(
    initialStartOutlineNodeId,
  );
  const [endOutlineNodeId, setEndOutlineNodeId] = useState("");
  const requestKey = useRef("");
  const requestId = useRef("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const input = {
      approvalMode,
      planningMode,
      origin: {
        surface: "quick-create",
        selection: null,
        returnTo: `/books/${encodeURIComponent(projectId)}/quick-create`,
        ...(startOutlineNodeId
          ? { outlineNodeId: startOutlineNodeId }
          : {}),
      },
      scope: {
        startOutlineNodeId: startOutlineNodeId || null,
        endOutlineNodeId: endOutlineNodeId || null,
      },
      targetChapters: Math.max(1, Math.min(targetChapters, AUTOMATION_LIMITS.targetChapters)),
      windowSize: Math.max(1, Math.min(windowSize, AUTOMATION_LIMITS.planningWindow)),
      maxRevisionCycles: Math.max(0, Math.min(maxRevisionCycles, AUTOMATION_LIMITS.revisionCycles)),
      chapterPolicy: {
        qualityPreset,
        maxRetries: 2,
        minChapterCharacters: 2_000,
        maxChapterCharacters: 3_500,
        ...(planningOnly ? { planningOnly: true } : {}),
      },
    } as const;
    const key = JSON.stringify(input);
    if (requestKey.current !== key) {
      requestKey.current = key;
      requestId.current = crypto.randomUUID();
    }
    onSubmit({ ...input, requestId: requestId.current });
  };
  return (
    <section className="cf-card cf-quick-create-setup">
      <div className="cf-section-title">
        <div><h2>创建一次创作航次</h2><p>先配置推进范围，生成结果会进入任务中心并等待你的判断。</p></div>
        <WandSparkles size={23} />
      </div>
      <CompassEditor projectId={projectId} compass={compass} />
      <form onSubmit={submit}>
      <label>确认方式<select value={approvalMode} onChange={(event) => setApprovalMode(event.target.value as typeof approvalMode)}><option value="per_chapter">逐章确认</option><option value="continuous">连续推进（按设定自动运行）</option></select></label>
      <label>目标章节<input type="number" min={1} max={AUTOMATION_LIMITS.targetChapters} value={targetChapters} onChange={(event) => setTargetChapters(Number(event.target.value))} /></label>
      <div className="cf-form-grid"><label>起始章节<select aria-label="起始章节" value={startOutlineNodeId} onChange={(event) => setStartOutlineNodeId(event.target.value)}><option value="">从下一未完成章节开始</option>{chapters.map((chapter, index) => <option key={chapter.id} value={chapter.id}>第 {index + 1} 章 · {chapter.title}</option>)}</select>{initialStartOutlineNodeId ? <small>已从当前写作章节带入起点，可随时调整。</small> : null}</label><label>结束章节<select aria-label="结束章节" value={endOutlineNodeId} onChange={(event) => setEndOutlineNodeId(event.target.value)}><option value="">不设结束章节</option>{chapters.map((chapter, index) => <option key={chapter.id} value={chapter.id}>第 {index + 1} 章 · {chapter.title}</option>)}</select></label></div>
      <details className="cf-quick-create-advanced"><summary>高级选项</summary>
        <label>章纲规划<select value={planningMode} onChange={(event) => setPlanningMode(event.target.value as typeof planningMode)}><option value="confirm">先确认章纲</option><option value="auto">自动规划</option></select></label>
        <div className="cf-form-grid"><label>规划窗口<input type="number" min={1} max={AUTOMATION_LIMITS.planningWindow} value={windowSize} onChange={(event) => setWindowSize(Number(event.target.value))} /></label><label>最多修订轮次<input type="number" min={0} max={AUTOMATION_LIMITS.revisionCycles} value={maxRevisionCycles} onChange={(event) => setMaxRevisionCycles(Number(event.target.value))} /></label></div>
        <label>质量档位<select value={qualityPreset} onChange={(event) => setQualityPreset(event.target.value as typeof qualityPreset)}><option value="fast">快速</option><option value="standard">标准</option><option value="deep">深入</option></select></label>
        <label><input type="checkbox" checked={planningOnly} onChange={(event) => setPlanningOnly(event.target.checked)} /> 仅生成章纲（完成后不进入正文生产）</label>
      </details>
      <button className="cf-primary" disabled={pending || !projectId || !compass}>
        <CirclePlay size={16} /> {pending ? "正在启动…" : "开始连续创作"}
      </button>
      {!compass ? <small className="cf-quick-create-hint">先保存故事航标，系统才会允许启动航次。</small> : null}
      </form>
    </section>
  );
}

function CompassEditor({
  projectId,
  compass,
}: {
  projectId: string;
  compass: Awaited<ReturnType<typeof getStoryCompass>> | undefined;
}) {
  const client = useQueryClient();
  const [corePromise, setCorePromise] = useState(compass?.corePromise ?? "");
  const [endingDirection, setEndingDirection] = useState(compass?.endingDirection ?? "");
  const [themeQuestions, setThemeQuestions] = useState(compass?.themeQuestions.join("\n") ?? "");
  const [constraints, setConstraints] = useState(compass?.constraints.join("\n") ?? "");
  const [chapters, setChapters] = useState(compass?.target.chapters ?? AUTOMATION_DEFAULTS.targetChapters);
  const [wordsPerChapter, setWordsPerChapter] = useState(compass?.target.wordsPerChapter ?? AUTOMATION_DEFAULTS.wordsPerChapter);
  const [volumes, setVolumes] = useState(compass?.target.volumes ?? AUTOMATION_DEFAULTS.volumes);
  const [open, setOpen] = useState(!compass);
  const save = useMutation({
    mutationFn: () => updateStoryCompass(projectId, {
      expectedVersion: compass?.version ?? null,
      corePromise: corePromise.trim(),
      endingDirection: endingDirection.trim() || null,
      longLines: compass?.longLines ?? [],
      themeQuestions: themeQuestions.split("\n").map((line) => line.trim()).filter(Boolean),
      target: { chapters: Math.max(1, chapters), wordsPerChapter: Math.max(1, wordsPerChapter), volumes: Math.max(1, volumes) },
      constraints: constraints.split("\n").map((line) => line.trim()).filter(Boolean),
    }),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.compass(projectId) }),
  });
  return <section className="cf-quick-create-compass"><div className="cf-section-title"><div><h3>故事航标</h3><p>{compass ? "连续创作会以这里的主线和边界为依据。" : "先写下故事方向，之后仍可回到作品设定继续细化。"}</p></div><button type="button" className="cf-button" onClick={() => setOpen((value) => !value)}>{open ? "收起" : "编辑航标"}</button></div>{open ? <form onSubmit={(event) => { event.preventDefault(); if (corePromise.trim()) save.mutate(); }}><label>核心承诺<input required value={corePromise} onChange={(event) => setCorePromise(event.target.value)} placeholder="读者读完这部作品，最想获得什么体验？" /></label><label>结局方向<textarea rows={2} value={endingDirection} onChange={(event) => setEndingDirection(event.target.value)} placeholder="可以留空，后续再决定。" /></label><div className="cf-form-grid"><label>目标章数<input type="number" min={1} value={chapters} onChange={(event) => setChapters(Number(event.target.value))} /></label><label>每章目标字数<input type="number" min={1} value={wordsPerChapter} onChange={(event) => setWordsPerChapter(Number(event.target.value))} /></label><label>卷数<input type="number" min={1} max={AUTOMATION_LIMITS.volumes} value={volumes} onChange={(event) => setVolumes(Number(event.target.value))} /></label></div><label>主题问题（每行一项）<textarea rows={3} value={themeQuestions} onChange={(event) => setThemeQuestions(event.target.value)} placeholder="主角愿意为目标付出什么？" /></label><label>创作边界（每行一项）<textarea rows={3} value={constraints} onChange={(event) => setConstraints(event.target.value)} placeholder="不使用的套路、题材或内容边界" /></label><div className="cf-actions"><button className="cf-primary" disabled={save.isPending || !corePromise.trim()}>{save.isPending ? "正在保存…" : "保存故事航标"}</button>{save.isError ? <ErrorNote error={save.error} /> : null}</div></form> : null}</section>;
}

function SessionList({
  sessions,
  selectedId,
  onSelect,
  pending,
}: {
  sessions: AutopilotSession[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  pending: boolean;
}) {
  return (
    <section className="cf-card cf-quick-create-sessions">
      <div className="cf-section-title"><div><h2>创作航次</h2><p>离开页面后任务仍会继续记录，回来可从这里恢复。</p></div><span className="cf-badge">{sessions.length} 次</span></div>
      {pending ? <p role="status">正在读取航次…</p> : null}
      {!pending && !sessions.length ? <div className="cf-empty"><WandSparkles size={32} /><p>还没有连续创作任务。</p></div> : null}
      <div className="cf-quick-create-session-list">{sessions.map((session) => <button key={session.id} className={`cf-quick-create-session ${selectedId === session.id ? "is-selected" : ""}`} onClick={() => onSelect(session.id)}><span><strong>{statusLabels[session.status]}</strong><small>{session.completedChapters} / {session.targetChapters} 章 · {session.approvalMode === "continuous" ? "连续确认" : "逐章确认"}</small></span><time>{new Date(session.updatedAt).toLocaleString("zh-CN")}</time></button>)}</div>
    </section>
  );
}

function SessionDetailPanel({
  detail,
  chapters,
  actionPending,
  steerPending,
  onAction,
  onResolution,
  onSteer,
  onSteerDecision,
}: {
  detail: AutopilotSessionDetail;
  chapters: OutlineNode[];
  actionPending: boolean;
  steerPending: boolean;
  onAction: (input: SessionActionRequest) => void;
  onResolution: (input: "retry-current" | "skip-chapter" | "replan" | "stop") => void;
  onSteer: (content: string) => void;
  onSteerDecision: (id: string, action: "apply" | "reject") => void;
}) {
  const { session } = detail;
  const scope = session.scope ?? {
    startOutlineNodeId: null,
    endOutlineNodeId: null,
  };
  const [steerText, setSteerText] = useState("");
  const [revisionText, setRevisionText] = useState("");
  const revisionRequestRef = useRef<{ runId: string; requestId: string } | null>(null);
  const [resultPage, setResultPage] = useState(0);
  const submitSteer = (event: FormEvent) => {
    event.preventDefault();
    if (!steerText.trim()) return;
    onSteer(steerText.trim());
    setSteerText("");
  };
  const currentRunId = session.currentRunId;
  const batchReview = detail.batchReview;
  const batchReviewStale = batchReview?.stale === true;
  const batchReviewVerdict =
    typeof batchReview?.verdict === "string" ? batchReview.verdict : null;
  const batchReviewSummary =
    typeof batchReview?.summary === "string" ? batchReview.summary : null;
  const batchReviewChapters = Array.isArray(batchReview?.chapters)
    ? batchReview.chapters.length
    : 0;
  const batchReviewIssues = Array.isArray(batchReview?.issues)
    ? batchReview.issues.filter(
        (issue): issue is Record<string, unknown> =>
          Boolean(issue && typeof issue === "object" && !Array.isArray(issue)),
      )
    : [];
  const batchReviewDroppedIssueCount = (() => {
    const diagnostics = batchReview?.groundingDiagnostics;
    if (!diagnostics || typeof diagnostics !== "object" || Array.isArray(diagnostics))
      return 0;
    const count = (diagnostics as Record<string, unknown>).droppedIssueCount;
    return typeof count === "number" ? count : 0;
  })();
  const visibleBatchReviewIssues = batchReviewStale ? [] : batchReviewIssues;
  const has = (name: string) => detail.availableActions.includes(name as never);
  const chapterById = new Map(chapters.map((chapter) => [chapter.id, chapter]));
  const scopedStart = scope.startOutlineNodeId
    ? chapterById.get(scope.startOutlineNodeId)?.title
    : null;
  const scopedEnd = scope.endOutlineNodeId
    ? chapterById.get(scope.endOutlineNodeId)?.title
    : null;
  const chapterResults = (
    detail.chapterResults ??
    detail.links
      .filter((link) => link.role === "chapter")
      .map((link) => ({
        runId: link.runId,
        outlineNodeId: link.outlineNodeId,
        sequence: link.sequence,
        status:
          link.outcome ??
          detail.runs.find((run) => run.id === link.runId)?.status ??
          "pending",
        targetWords: null,
        actualWords: null,
        checkScore: null,
        qualityVerdict: null,
        retryCount: 0,
        error: null,
        actionAvailability: [],
      }))
  ).map((summary) => {
    const link = detail.links.find((candidate) => candidate.runId === summary.runId);
    const run = detail.runs.find((candidate) => candidate.id === summary.runId) ?? null;
    return {
      ...summary,
      link: link ?? {
        sessionId: session.id,
        runId: summary.runId,
        role: "chapter" as const,
        outlineNodeId: summary.outlineNodeId,
        sequence: summary.sequence,
        createdAt: session.createdAt,
        processedAt: null,
        outcome: null,
      },
      run,
      title: summary.outlineNodeId
        ? (chapterById.get(summary.outlineNodeId)?.title ?? "已移除章节")
        : "未绑定章节",
    };
  });
  const resultCounts = {
    completed: chapterResults.filter((item) => item.status === "completed").length,
    skipped: chapterResults.filter((item) => item.status === "skipped").length,
    needsAction: chapterResults.filter((item) =>
      ["failed", "failed_recoverable", "awaiting_user"].includes(item.status),
    ).length,
    cancelled: chapterResults.filter((item) => item.status === "cancelled").length,
    active: chapterResults.filter((item) =>
      !["completed", "skipped", "failed", "failed_recoverable", "awaiting_user", "cancelled"].includes(item.status),
    ).length,
  };
  const resultPageCount = Math.max(
    1,
    Math.ceil(chapterResults.length / CHAPTER_RESULT_PAGE_SIZE),
  );
  const currentResultPage = Math.min(resultPage, resultPageCount - 1);
  const visibleChapterResults = chapterResults.slice(
    currentResultPage * CHAPTER_RESULT_PAGE_SIZE,
    (currentResultPage + 1) * CHAPTER_RESULT_PAGE_SIZE,
  ).map((item, index) => ({
    ...item,
    chapterNumber: currentResultPage * CHAPTER_RESULT_PAGE_SIZE + index + 1,
  }));
  const resultLabel = (status: string) =>
    status === "completed"
      ? "已完成"
      : status === "skipped"
        ? "已跳过"
        : status === "failed" || status === "failed_recoverable"
          ? "需要处理"
          : status === "awaiting_user"
            ? "等待确认"
            : status === "cancelled"
              ? "已取消"
              : "进行中";
  const totalTargetWords = chapterResults.reduce(
    (sum, item) => sum + (item.targetWords ?? 0),
    0,
  );
  const totalActualWords = chapterResults.reduce(
    (sum, item) => sum + (item.actualWords ?? 0),
    0,
  );
  const scoredResults = chapterResults.filter(
    (item): item is typeof item & { checkScore: number } =>
      typeof item.checkScore === "number",
  );
  const averageCheckScore = scoredResults.length
    ? Math.round(
        (scoredResults.reduce((sum, item) => sum + item.checkScore, 0) /
          scoredResults.length) *
          10,
      ) / 10
    : null;
  const exportBatchReport = () => {
    const escape = (value: string | number | null) =>
      `"${String(value ?? "").replaceAll('"', '""')}"`;
    const rows = [
      ["章节", "状态", "目标字数", "实际字数", "检查分数", "重试次数", "质量结论"],
      ...chapterResults.map((item) => [
        item.title,
        resultLabel(item.status),
        item.targetWords,
        item.actualWords,
        item.checkScore,
        item.retryCount,
        item.qualityVerdict,
      ]),
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(escape).join(",")).join("\n")}`;
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `chapterflow-batch-${session.id}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  return (
    <section className="cf-card cf-quick-create-detail">
      <div className="cf-section-title"><div><p className="cf-eyebrow">CURRENT VOYAGE</p><h2>{statusLabels[session.status]} · {session.completedChapters} / {session.targetChapters} 章</h2><p>{detail.currentChapter ? `当前章节：${detail.currentChapter.title}` : "等待任务推进到下一章"}</p></div><span className="cf-badge">{session.approvalMode === "continuous" ? "连续确认" : "逐章确认"}</span></div>
      <div className="cf-quick-create-progress"><progress max={session.targetChapters} value={session.completedChapters} /><strong>{Math.round((session.completedChapters / Math.max(1, session.targetChapters)) * 100)}%</strong></div>
      <section className="cf-quick-create-batch" aria-label="连续创作范围和批次统计">
        <div><span>创作范围</span><strong>{scopedStart || "下一未完成章节"} → {scopedEnd || "不设结束章节"}</strong></div>
        <div><span>批次进度</span><strong>{session.completedChapters} / {session.targetChapters} 章</strong></div>
        <div><span>已跳过</span><strong>{session.skippedChapters} 章</strong></div>
        <div><span>已生成结果</span><strong>{chapterResults.length} 章</strong></div>
      </section>
      {detail.blockingReview ? (
        <section className="cf-inline-warning cf-quick-create-conflict" aria-label="等待处理的质量冲突">
          <AlertTriangle size={16} />
          <div>
            <strong>这一章需要你的裁决</strong>
            <p>{detail.blockingReview.summary}</p>
            <ul>
              {detail.blockingReview.issues.slice(0, 3).map((issue) => (
                <li key={issue.id}>{issue.message}{issue.evidence[0]?.quote ? ` · “${issue.evidence[0].quote}”` : ""}</li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
      {batchReview ? (
        <section className="cf-inline-warning cf-quick-create-batch-review" aria-label="前五章联合审阅">
          {batchReviewStale ? <AlertTriangle size={16} /> : <Check size={16} />}
          <div>
            <strong>前五章联合审阅：{batchReviewStale ? "待重新审阅" : batchReviewVerdict === "block" ? "阻断" : batchReviewVerdict === "warning" ? "有警告" : "通过"}</strong>
            <p>{batchReviewStale ? "章节正式版本已变化，上一份联合审阅不再代表当前正文；继续航次后会按当前版本重新检查。" : `${batchReviewSummary ?? "已完成五个当前版本的联合审阅。"} · 已绑定 ${batchReviewChapters} 个当前版本${batchReviewDroppedIssueCount > 0 ? ` · ${batchReviewDroppedIssueCount} 条无法逐字定位的模型问题未计入` : ""}`}</p>
            {visibleBatchReviewIssues.length ? (
              <ul>
                {visibleBatchReviewIssues.slice(0, 5).map((issue, index) => (
                  <li key={typeof issue.id === "string" ? issue.id : index}>
                    {typeof issue.message === "string" ? issue.message : "联合审阅发现待处理问题"}
                    {typeof issue.documentVersionId === "string" ? ` · 版本 ${issue.documentVersionId.slice(0, 8)}` : ""}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </section>
      ) : null}
      <div className="cf-actions cf-quick-create-actions">
        {has("pause") ? <button className="cf-button" disabled={actionPending} onClick={() => onAction({ action: "pause" })}><CirclePause size={15} />暂停</button> : null}
        {has("resume") ? <button className="cf-primary" disabled={actionPending} onClick={() => onAction({ action: "resume" })}><CirclePlay size={15} />继续</button> : null}
        {has("accept_plan") && currentRunId ? <button className="cf-primary" disabled={actionPending} onClick={() => onAction({ action: "accept_plan", requestId: `${currentRunId}:accept_plan` })}><Check size={15} />采用章纲</button> : null}
        {has("accept_manuscript") && currentRunId ? <button className="cf-primary" disabled={actionPending} onClick={() => onAction({ action: "accept_manuscript", requestId: `${currentRunId}:accept_manuscript` })}><Check size={15} />接受正文</button> : null}
        {has("keep_manuscript") && currentRunId ? <button className="cf-button" disabled={actionPending} onClick={() => onAction({ action: "keep_manuscript", requestId: `${currentRunId}:keep_manuscript` })}>保留并继续</button> : null}
        {has("cancel") ? <button className="cf-text-danger" disabled={actionPending} onClick={() => onAction({ action: "cancel" })}><Square size={14} />结束航次</button> : null}
      </div>
      {has("request_revision") && currentRunId ? <form className="cf-quick-create-revision" onSubmit={(event) => { event.preventDefault(); const instruction = revisionText.trim(); const revisionRequest = revisionRequestRef.current?.runId === currentRunId ? revisionRequestRef.current : { runId: currentRunId, requestId: crypto.randomUUID() }; revisionRequestRef.current = revisionRequest; onAction({ action: "request_revision", requestId: revisionRequest.requestId, ...(instruction ? { instruction } : {}) }); setRevisionText(""); }}><label>修改方向<textarea rows={2} value={revisionText} onChange={(event) => setRevisionText(event.target.value)} placeholder="例如：保留冲突升级，收紧这一段的节奏。" /></label><button className="cf-button" disabled={actionPending}><RotateCcw size={15} />请求重新修改</button></form> : null}
      {detail.availableActions.some((name) => ["retry-current", "skip-chapter", "replan", "stop"].includes(name)) ? <div className="cf-inline-warning"><AlertTriangle size={16} /><div><strong>任务需要恢复操作</strong><p>先处理当前失败步骤，才会继续推进后续章节。</p><div className="cf-actions">{(["retry-current", "skip-chapter", "replan", "stop"] as const).filter((name) => detail.availableActions.includes(name)).map((name) => <button className="cf-button" key={name} disabled={actionPending} onClick={() => onResolution(name)}>{name === "retry-current" ? "重试当前" : name === "skip-chapter" ? "跳过本章" : name === "replan" ? "重新规划" : "停止任务"}</button>)}</div></div></div> : null}
      {detail.steers.some((steer) => steer.status === "awaiting_confirmation") ? <section className="cf-quick-create-steers"><h3>等待确认的舵令</h3>{detail.steers.filter((steer) => steer.status === "awaiting_confirmation").map((steer) => <article key={steer.id}><strong>{steer.content}</strong>{steer.rationale ? <p>{steer.rationale}</p> : null}<div className="cf-actions"><button className="cf-primary" disabled={steerPending} onClick={() => onSteerDecision(steer.id, "apply")}>采用调整</button><button className="cf-button" disabled={steerPending} onClick={() => onSteerDecision(steer.id, "reject")}>继续原计划</button></div></article>)}</section> : null}
      {!['completed', 'cancelled'].includes(session.status) ? <form className="cf-quick-create-steer-form" onSubmit={submitSteer}><label>给当前航次下达舵令<textarea rows={3} value={steerText} onChange={(event) => setSteerText(event.target.value)} placeholder="例如：下一章先保留父亲身份的悬念，不要提前揭示。" /></label><button className="cf-button" disabled={steerPending || !steerText.trim()}><Send size={15} />提交舵令</button></form> : null}
      {chapterResults.length ? (
        <section className="cf-quick-create-results" aria-label="逐章结果">
          <div className="cf-section-title"><div><h3>逐章结果</h3><p>每章的任务状态都会保留，离开页面后回来仍能继续处理。</p></div></div>
          <div className="cf-quick-create-result-summary" aria-label="批次结果汇总">
            <div><span>已完成</span><strong>{resultCounts.completed}</strong></div>
            <div><span>已跳过</span><strong>{resultCounts.skipped}</strong></div>
            <div><span>需处理</span><strong>{resultCounts.needsAction}</strong></div>
            <div><span>已取消</span><strong>{resultCounts.cancelled}</strong></div>
            <div><span>进行中</span><strong>{resultCounts.active}</strong></div>
            <div><span>目标字数</span><strong>{totalTargetWords ? formatCount(totalTargetWords) : "—"}</strong></div>
            <div><span>实际字数</span><strong>{totalActualWords ? formatCount(totalActualWords) : "—"}</strong></div>
            <div><span>平均检查分</span><strong>{averageCheckScore ?? "—"}</strong></div>
          </div>
          <div className="cf-actions cf-quick-create-result-tools">
            <button type="button" className="cf-button" onClick={exportBatchReport}>导出批次报告 CSV</button>
          </div>
          <div className="cf-quick-create-result-list">
            {visibleChapterResults.map(({ link, run, title, status, targetWords, actualWords, checkScore, retryCount, qualityVerdict, actionAvailability, chapterNumber }) => (
              <div className="cf-list-row" key={link.runId}>
                <div><strong>{title}</strong><p>{resultLabel(status)} · 第 {chapterNumber} 章{link.processedAt ? ` · ${formatSessionTime(link.processedAt)}` : ""}</p><small>{targetWords !== null ? `目标 ${formatCount(targetWords)} 字 · ` : ""}{actualWords !== null ? `实际 ${formatCount(actualWords)} 字 · ` : ""}{checkScore !== null ? `检查 ${checkScore} 分 · ` : ""}重试 {retryCount} 次{qualityVerdict ? ` · ${qualityVerdict === "pass" ? "检查通过" : qualityVerdict === "revise" ? "需要修改" : "检查阻塞"}` : ""}</small>{link.outcome && link.outcome !== status ? <small>批次结果：{link.outcome}</small> : null}{run?.status === "failed_recoverable" ? <small className="cf-error-text-inline">任务可恢复，先打开任务查看失败步骤。</small> : null}</div>
                <div className="cf-actions"><Link className="cf-text-link" to={`/books/${session.projectId}/tasks/${link.runId}?returnTo=${encodeURIComponent(`/books/${session.projectId}/quick-create?session=${session.id}`)}`}>打开任务</Link>{link.outlineNodeId ? <Link className="cf-text-link" to={`/books/${session.projectId}/write?outline=${encodeURIComponent(link.outlineNodeId)}`}>打开写作台</Link> : null}</div>
                {actionAvailability?.some((item) => item.available) ? <small className="cf-quick-create-result-actions">本章可处理：{actionAvailability.filter((item) => item.available).map((item) => chapterActionLabel(item.action)).join("、")}</small> : actionAvailability?.length ? <small className="cf-quick-create-result-actions">本章暂无单独动作，先查看任务详情。</small> : null}
              </div>
            ))}
          </div>
          {resultPageCount > 1 ? (
            <nav className="cf-actions cf-quick-create-pagination" aria-label="批次结果分页">
              <button
                type="button"
                className="cf-button"
                disabled={currentResultPage === 0}
                onClick={() => setResultPage((page) => Math.max(0, page - 1))}
              >
                上一页
              </button>
              <span aria-live="polite">
                第 {currentResultPage + 1} / {resultPageCount} 页 · 共 {chapterResults.length} 章
              </span>
              <button
                type="button"
                className="cf-button"
                disabled={currentResultPage >= resultPageCount - 1}
                onClick={() =>
                  setResultPage((page) => Math.min(resultPageCount - 1, page + 1))
                }
              >
                下一页
              </button>
            </nav>
          ) : null}
        </section>
      ) : null}
      <details className="cf-quick-create-history"><summary>查看任务记录（{detail.runs.length}）</summary><div>{detail.runs.map((run) => <div className="cf-list-row" key={run.id}><div><strong>{run.recipe}</strong><p>{run.status} · {new Date(run.updatedAt).toLocaleString("zh-CN")}</p></div><Link className="cf-text-link" to={`/books/${session.projectId}/tasks/${run.id}`}>打开任务</Link></div>)}</div></details>
      {session.lastError ? <p className="cf-error-text">{humanizeError(session.lastError)}</p> : null}
    </section>
  );
}

function humanizeError(error: Record<string, unknown>): string {
  const message = typeof error.message === "string" ? error.message : null;
  const code = typeof error.code === "string" ? error.code : null;
  return message ?? code ?? "任务遇到需要处理的问题。";
}

function chapterActionLabel(action: string): string {
  const labels: Record<string, string> = {
    pause: "暂停",
    resume: "继续",
    cancel: "取消",
    accept_plan: "采用章纲",
    switch_to_manual: "切换手工",
    accept_manuscript: "接受正文",
    request_revision: "请求修改",
    discard_manuscript: "放弃正文",
    use_partial: "采用已生成片段",
    regenerate: "重新生成",
    retry_chapter: "重试本章",
  };
  return labels[action] ?? action;
}

function formatSessionTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("zh-CN", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("zh-CN").format(value);
}
