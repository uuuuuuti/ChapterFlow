import { requireUnchangedDraft } from "../draft-autosave/acceptance-guard";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router";
import {
  History,
  Maximize2,
  Minimize2,
  PenLine,
  Target,
  Swords,
  Star,
  Link2,
  Users,
  FileText,
  Check,
  MessageSquarePlus,
  Archive,
  ArchiveRestore,
} from "lucide-react";
import {
  useDraftAutosave,
  type FlushDraft,
} from "../../features/draft-autosave/use-draft-autosave";
import {
  chapterActions,
  selectionActions,
} from "../../features/chapter-ai/actions";
import { ReviewPanel } from "../../features/chapter-review/review-panel";
import { CanonChangesPanel } from "./canon-changes-panel";
import { TaskResult } from "../../features/task-progress/task-center";
import {
  getStudioDocument,
  appendDocumentVersion,
  restoreDocumentVersion,
  createDocumentComment,
  setDocumentCommentStatus,
  updateDocumentComment,
  renameStoryDocument,
  createSelectionEdit,
  decideEditProposal,
} from "../../shared/api/writing";
import { createChapterRun, getProjectRuns } from "../../shared/api/automation";
import { createDocumentReview } from "../../shared/api/review";
import { updateOutlineNode } from "../../shared/api/story";
import { queryKeys } from "../../shared/query/keys";
import { ConflictRecovery, ErrorNote, ConfirmDialog } from "../../shared/ui";
import { Drawer } from "../../shared/ui/drawer";
import type {
  StudioDocumentDetail,
  StoryBible,
  StoryDocument,
  OutlineNode,
  DocumentVersion,
  DocumentComment,
} from "../../shared/api/types";
import { rememberTask } from "../../lib/task-ledger";

export function ChapterEditor({
  projectId,
  detail,
  story,
  onFlushReady,
  onArchive,
}: {
  projectId: string;
  detail: StudioDocumentDetail;
  story: StoryBible;
  onFlushReady: (flush: FlushDraft | null) => void;
  onArchive: (document: StoryDocument, archived: boolean) => void | Promise<void>;
}) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState(
    params.get("tab") === "review"
      ? "review"
      : params.get("tab") === "canon"
        ? "canon"
        : params.get("tab") === "comments"
          ? "comments"
          : params.get("tab") === "ai"
            ? "ai"
          : "chapter",
  );
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [instruction, setInstruction] = useState(
    params.get("instruction") ?? "",
  );
  const selectionParam = params.get("selection");
  const versionParam = params.get("version");
  const restoredSelectionRef = useRef<string | null>(null);
  const restoredVersionRef = useRef<string | null>(null);
  const novelIssueId = params.get("novelIssue");
  const novelCheckId = params.get("novelCheckId");
  const returnTo = params.get("returnTo");
  const safeReturnTo = returnTo?.startsWith(`/books/${projectId}/advanced?`)
    ? returnTo
    : null;
  const novelCheckOrigin = {
    surface: "writing" as const,
    documentId: detail.document.id,
    selection: null,
    ...(novelIssueId
      ? {
          checkIssueId: novelIssueId,
          ...(novelCheckId ? { checkReportId: novelCheckId } : {}),
          checkDocumentVersionId:
            params.get("novelDocumentVersion") ?? detail.document.currentVersionId,
          ...(params.get("novelCheckAt")
            ? { checkReportGeneratedAt: params.get("novelCheckAt")! }
            : {}),
        }
      : {}),
  };
  const [focus, setFocus] = useState(false);
  const [history, setHistory] = useState(params.get("history") === "1");
  const [versionName, setVersionName] = useState("");
  const [restore, setRestore] = useState<DocumentVersion | null>(null);
  const [compareVersionId, setCompareVersionId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [brief, setBrief] = useState(false);
  const [commentBody, setCommentBody] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentBody, setEditingCommentBody] = useState("");
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTitle, setRenameTitle] = useState(detail.document.title);
  const [conflictDismissed, setConflictDismissed] = useState(false);
  const [conflictRefreshing, setConflictRefreshing] = useState(false);
  const textarea = useRef<HTMLTextAreaElement | null>(null);
  const actionLock = useRef(false);
  const request = useRef<{ key: string; id: string } | null>(null);
  const versionRequest = useRef<{ key: string; id: string } | null>(null);
  const autosave = useDraftAutosave(projectId, detail, onFlushReady);
  const {
    content,
    setContent,
    contentRef,
    savedContentRef,
    latestDraftRef,
    setDraftSavedContent,
    flushDraft,
    retryDraft,
    resetToServer,
    draftMutation,
  } = autosave;
  const node = story.outline.find(
    (n) => n.id === detail.document.outlineNodeId,
  );
  const count = Array.from(content.replace(/\s/g, "")).length;
  const runs = useQuery({
    queryKey: queryKeys.runs(projectId),
    queryFn: ({ signal }) => getProjectRuns(projectId, signal),
    refetchInterval: 2000,
  });
  const matching =
    runs.data?.filter(
      (r) =>
        r.targetOutlineNodeId === node?.id ||
        (r.policy.origin as { documentId?: string } | undefined)?.documentId ===
          detail.document.id,
    ) ?? [];
  const active = matching.find(
    (r) => !["completed", "cancelled", "failed"].includes(r.status),
  );
  const runId = params.get("task") ?? active?.id ?? null;

  useEffect(() => {
    if (!selectionParam) return;
    let cancelled = false;
    const key = `${detail.document.id}:${selectionParam}`;
    if (restoredSelectionRef.current === key) return;
    restoredSelectionRef.current = key;
    const parsed = parseSelectionParam(selectionParam);
    if (!parsed || parsed.start >= content.length || parsed.end > content.length) {
      queueMicrotask(() => {
        if (cancelled) return;
        setSelection({ start: 0, end: 0 });
        setNotice("链接中的选区已经超过当前正文版本，已打开正文；请重新选择需要处理的段落。");
      });
      return () => { cancelled = true; };
    }
    queueMicrotask(() => {
      if (cancelled) return;
      setSelection(parsed);
      setNotice(`已恢复正文选区（${parsed.end - parsed.start} 字）。`);
    });
    return () => { cancelled = true; };
  }, [content.length, detail.document.id, selectionParam]);

  useEffect(() => {
    if (!versionParam) return;
    let cancelled = false;
    const key = `${detail.document.id}:${versionParam}`;
    if (restoredVersionRef.current === key) return;
    restoredVersionRef.current = key;
    const requested = detail.versions.find((version) => version.id === versionParam);
    if (!requested) {
      queueMicrotask(() => {
        if (cancelled) return;
        setHistory(true);
        setNotice("链接中的正文版本已经不存在，已打开历史版本列表；请重新选择可用版本。");
      });
      return () => { cancelled = true; };
    }
    queueMicrotask(() => {
      if (cancelled) return;
      setHistory(true);
      setCompareVersionId(
        requested.id === detail.currentVersion?.id ? null : requested.id,
      );
      setNotice(
        requested.id === detail.currentVersion?.id
          ? "已打开链接指定的当前正文版本。"
          : "已打开链接指定的正文版本，并准备与当前版本对比。",
      );
    });
    return () => { cancelled = true; };
  }, [detail.currentVersion?.id, detail.document.id, detail.versions, versionParam]);
  const refresh = useCallback(async () => {
    await client.invalidateQueries({ queryKey: queryKeys.story(projectId) });
    await client.invalidateQueries({ queryKey: queryKeys.project(projectId) });
    await client.invalidateQueries({
      queryKey: queryKeys.document(projectId, detail.document.id),
    });
  }, [client, detail.document.id, projectId]);
  const mergeComment = useCallback(
    (next: DocumentComment) => {
      client.setQueryData<StudioDocumentDetail>(
        queryKeys.document(projectId, detail.document.id),
        (current) =>
          current
            ? {
                ...current,
                comments: current.comments.map((comment) =>
                  comment.id === next.id ? next : comment,
                ),
              }
            : current,
      );
    },
    [client, detail.document.id, projectId],
  );
  const refreshRemoteAfterConflict = useCallback(async () => {
    setConflictRefreshing(true);
    try {
      const latest = await client.fetchQuery({
        queryKey: queryKeys.document(projectId, detail.document.id),
        queryFn: () => getStudioDocument(projectId, detail.document.id),
      });
      client.setQueryData(queryKeys.document(projectId, detail.document.id), latest);
      resetToServer(latest);
      setConflictDismissed(true);
      setNotice("已刷新远端正文，本地未保存修改已放弃。当前版本已经重新载入。 ");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "远端正文读取失败，请稍后重试。 ");
    } finally {
      setConflictRefreshing(false);
    }
  }, [client, detail.document.id, projectId, resetToServer]);
  const openConflictDiff = useCallback(async () => {
    setHistory(true);
    setConflictDismissed(true);
    const currentVersionId = detail.currentVersion?.id;
    try {
      const latest = await client.fetchQuery({
        queryKey: queryKeys.document(projectId, detail.document.id),
        queryFn: () => getStudioDocument(projectId, detail.document.id),
      });
      client.setQueryData(queryKeys.document(projectId, detail.document.id), latest);
      const candidate =
        latest.currentVersion?.id &&
        latest.currentVersion.id !== currentVersionId
          ? latest.currentVersion.id
          : latest.versions.find(
              (version) => version.id !== currentVersionId,
            )?.id;
      if (candidate) setCompareVersionId(candidate);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "远端版本读取失败，请稍后重试。 ");
    }
  }, [client, detail.currentVersion, detail.document.id, projectId]);
  // Browser history navigation may unmount before the debounce expires. Persist the captured draft.
  const finalFlush = useRef(flushDraft);
  useEffect(() => {
    finalFlush.current = flushDraft;
  }, [flushDraft]);
  useEffect(
    () => () => {
      void finalFlush.current();
    },
    [],
  );
  const setRun = (id: string) => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set("task", id);
        return next;
      },
      { replace: true },
    );
  };
  const checkpoint = async (
    label: string,
    force = false,
    requestId?: string,
  ) => {
    if (!(await flushDraft()))
      throw new Error("保存失败，请重试保存后再操作。");
    const latest = await getStudioDocument(projectId, detail.document.id);
    if (!force && latest.currentVersion?.content === contentRef.current && !latest.draft)
      return latest.currentVersion;
    const version = await appendDocumentVersion(projectId, detail.document.id, {
      ...(requestId ? { requestId } : {}),
      content: contentRef.current,
      source: label,
      expectedCurrentVersionId: latest.document.currentVersionId,
    });
    latestDraftRef.current = null;
    savedContentRef.current = contentRef.current;
    setDraftSavedContent(contentRef.current);
    await client.fetchQuery({
      queryKey: queryKeys.document(projectId, detail.document.id),
      queryFn: () => getStudioDocument(projectId, detail.document.id),
    });
    return version;
  };
  const action = useMutation({
    mutationFn: async (input: {
      kind: "chapter" | "edit" | "review" | "version";
      instruction?: string;
      start?: number;
      end?: number;
    }) => {
      if (actionLock.current) throw new Error("请等待当前操作完成。");
      actionLock.current = true;
      try {
        const source =
          input.kind === "version"
            ? `manual:${versionName.trim() || "作者手动版本"}`
            : `manual:before-${input.kind}`;
        let checkpointRequestId: string | undefined;
        if (input.kind === "version") {
          const key = JSON.stringify([
            source,
            contentRef.current,
            detail.document.currentVersionId,
          ]);
          if (versionRequest.current?.key !== key) {
            versionRequest.current = { key, id: crypto.randomUUID() };
          }
          checkpointRequestId = versionRequest.current.id;
        }
        const version = await checkpoint(
          source,
          input.kind === "version",
          checkpointRequestId,
        );
        if (input.kind === "version") return null;
        const key = JSON.stringify([input, version.id]);
        if (request.current?.key !== key)
          request.current = { key, id: crypto.randomUUID() };
        if (input.kind === "chapter") {
          if (!node) throw new Error("请先在大纲中关联本章。");
          return (
            await createChapterRun(projectId, {
              requestId: request.current.id,
              targetOutlineNodeId: node.id,
              continuationVersionId: version.id,
              planningMode: "auto",
              maxRevisionCycles: 0,
              origin: novelCheckOrigin,
            })
          ).run.id;
        }
        if (input.kind === "review")
          return (
            await createDocumentReview(projectId, detail.document.id, {
              requestId: request.current.id,
              documentVersionId: version.id,
              origin: novelCheckOrigin,
            })
          ).run.id;
        const start = input.start ?? 0,
          end = input.end ?? contentRef.current.length;
        if (end <= start)
          throw new Error("请先写一段正文，或使用续写生成本章。");
        return (
          await createSelectionEdit(projectId, detail.document.id, {
            baseVersionId: version.id,
            draftContentHash: null,
            selectionStart: start,
            selectionEnd: end,
            instruction: input.instruction?.trim() || "保留情节，润色正文。",
            origin: novelCheckOrigin,
          })
        ).run.id;
      } finally {
        actionLock.current = false;
      }
    },
    onSuccess: async (id, input) => {
      request.current = null;
      if (input.kind === "version") versionRequest.current = null;
      if (id) {
        setRun(id);
        if (input.kind === "chapter")
          rememberTask({
            projectId,
            kind: "chapter",
            taskId: id,
            label: `${detail.document.title} · AI 创作`,
            createdAt: new Date().toISOString(),
            documentId: detail.document.id,
            origin: novelCheckOrigin,
          });
        setNotice("已开始处理，可以离开页面，稍后回来查看结果。");
      } else {
        setNotice("已创建版本。");
        setVersionName("");
      }
      await refresh();
    },
    onError: () => setConflictDismissed(false),
  });
  const accept = useMutation({
    mutationFn: async (input: { id: string; action: "accept" | "reject"; mode?: "insert_after" }) => {
      if (!(await flushDraft())) throw new Error("请先保存当前正文。");
      if (input.action === "accept")
        await requireUnchangedDraft(projectId, detail.document.id);
      return decideEditProposal(input.id, input.action, input.mode);
    },
    onSuccess: async (_result, input) => {
      const proposal = detail.proposals.find((candidate) => candidate.id === input.id);
      const proposalOrigin = proposal
        ? (runs.data?.find((run) => run.id === proposal.runId)?.policy.origin as
            { checkIssueId?: string; checkReportId?: string } | null | undefined)
        : null;
      const shouldRecheckNovelIssue = Boolean(
        input.action === "accept" &&
          novelIssueId &&
          safeReturnTo &&
          proposalOrigin?.checkIssueId === novelIssueId &&
          (!novelCheckId || proposalOrigin?.checkReportId === novelCheckId),
      );
      setSelection({ start: 0, end: 0 });
      await refresh();
      if (shouldRecheckNovelIssue && safeReturnTo) {
        const target = new URL(safeReturnTo, window.location.origin);
        target.searchParams.set("check", "1");
        if (novelIssueId) target.searchParams.set("checkIssue", novelIssueId);
        navigate(`${target.pathname}${target.search}${target.hash}`);
      }
    },
    onError: () => setConflictDismissed(false),
  });
  const restoreMutation = useMutation({
    mutationFn: async () => {
      await checkpoint("manual:before-restore");
      const latest = await getStudioDocument(projectId, detail.document.id);
      return restoreDocumentVersion(
        projectId,
        detail.document.id,
        restore!.id,
        latest.document.currentVersionId,
      );
    },
    onSuccess: async () => {
      setRestore(null);
      setNotice("已恢复所选版本，恢复前的正文仍保留在历史中。");
      await refresh();
    },
    onError: () => setConflictDismissed(false),
  });
  const commentMutation = useMutation({
    mutationFn: async (input: {
      start: number;
      end: number;
      body: string;
    }) => {
      if (input.end <= input.start) throw new Error("请先选中要批注的正文。");
      const version = await checkpoint("manual:before-comment");
      const selectedContent = contentRef.current;
      return createDocumentComment(projectId, detail.document.id, {
        versionId: version.id,
        startOffset: input.start,
        endOffset: input.end,
        quote: selectedContent.slice(input.start, input.end),
        body: input.body.trim(),
      });
    },
    onSuccess: async () => {
      setCommentBody("");
      setTab("comments");
      setNotice("批注已添加，已锚定到当前版本。");
      await refresh();
    },
  });
  const commentStatusMutation = useMutation({
    mutationFn: (input: { id: string; status: "open" | "resolved" }) =>
      setDocumentCommentStatus(input.id, input.status),
    onSuccess: async (updated) => {
      // The API response is authoritative. Apply it before invalidating so a
      // short stale read cannot make a resolved comment look open again.
      mergeComment(updated);
      await refresh();
    },
  });
  const commentEditMutation = useMutation({
    mutationFn: (input: { id: string; body: string; expectedUpdatedAt: string }) =>
      updateDocumentComment(input.id, {
        body: input.body.trim(),
        expectedUpdatedAt: input.expectedUpdatedAt,
      }),
    onSuccess: async (updated) => {
      setEditingCommentId(null);
      setEditingCommentBody("");
      setNotice("批注已更新。");
      mergeComment(updated);
      await refresh();
      mergeComment(updated);
    },
  });
  const renameMutation = useMutation({
    mutationFn: () =>
      renameStoryDocument(
        detail.document,
        renameTitle.trim(),
        node?.updatedAt ?? null,
      ),
    onSuccess: async () => {
      setRenameOpen(false);
      setNotice("章节标题已更新，大纲与写作台已同步。");
      await refresh();
    },
  });
  const edit = (text: string, useRange = false) => {
    setTab("ai");
    const range =
      selection.end > selection.start
        ? selection
        : { start: 0, end: content.length };
    action.mutate({
      kind: "edit",
      instruction: text,
      ...(useRange ? range : { start: 0, end: content.length }),
    });
  };
  const busy =
    action.isPending ||
    accept.isPending ||
    restoreMutation.isPending ||
    commentMutation.isPending ||
    commentStatusMutation.isPending ||
    commentEditMutation.isPending ||
    renameMutation.isPending;
  const conflictError =
    draftMutation.error ??
    accept.error ??
    restoreMutation.error ??
    action.error ??
    null;
  const saveState = draftMutation.isError
    ? "保存失败"
    : draftMutation.isPending || content !== autosave.draftSavedContent
      ? "正在保存…"
      : "已保存";
  const captureSelection = (target: HTMLTextAreaElement) => {
    setSelection({ start: target.selectionStart, end: target.selectionEnd });
  };
  const scheduleSelectionCapture = (target: HTMLTextAreaElement) => {
    captureSelection(target);
    window.setTimeout(() => captureSelection(target), 0);
  };
  const commentRange =
    selection.end > selection.start
      ? selection
      : { start: 0, end: content.length };
  return (
    <div className={`cf-writing-desk ${focus ? "is-focus" : ""}`}>
      <section className="cf-editor-column">
        <div className="cf-writing-breadcrumb">
          <Link to="/books">我的作品</Link>
          <span>›</span>
          <Link to={`/books/${projectId}/dashboard`}>
            {story.project.title}
          </Link>
          {safeReturnTo ? (
            <>
              <span>›</span>
              <Link to={safeReturnTo}>返回前三章体检</Link>
            </>
          ) : null}
          <span>›</span>
          <span>{detail.document.title}</span>
        </div>
        <header className="cf-editor-header">
          <div>
            <h2>{story.project.title}</h2>
            <small>
              <Check size={12} />
              草稿{saveState} · {count.toLocaleString()} 字
            </small>
          </div>
          <div className="cf-actions">
            <button
              aria-label="重命名章节"
              disabled={busy}
              onClick={() => {
                setRenameTitle(detail.document.title);
                setRenameOpen(true);
              }}
            >
              <PenLine size={15} />
              <span>重命名</span>
            </button>
            <button aria-label="历史版本" onClick={() => setHistory(true)}>
              <History size={15} />
              <span>历史版本</span>
            </button>
            <button
              aria-label={detail.document.archivedAt ? "恢复章节" : "归档章节"}
              onClick={() => setArchiveOpen(true)}
            >
              {detail.document.archivedAt ? (
                <ArchiveRestore size={15} />
              ) : (
                <Archive size={15} />
              )}
              <span>{detail.document.archivedAt ? "恢复" : "归档"}</span>
            </button>
            <button
              onClick={() => setFocus(!focus)}
              aria-label={focus ? "退出专注模式" : "专注模式"}
            >
              {focus ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
          </div>
        </header>
        {renameOpen ? (
          <form
            className="cf-editor-rename"
            onSubmit={(event) => {
              event.preventDefault();
              if (renameTitle.trim()) renameMutation.mutate();
            }}
          >
            <label>
              章节标题
              <input
                aria-label="章节标题"
                value={renameTitle}
                maxLength={300}
                autoFocus
                onChange={(event) => setRenameTitle(event.target.value)}
              />
            </label>
            <div className="cf-actions">
              <button
                type="button"
                className="cf-button"
                disabled={renameMutation.isPending}
                onClick={() => setRenameOpen(false)}
              >
                取消
              </button>
              <button
                className="cf-primary"
                disabled={renameMutation.isPending || !renameTitle.trim()}
              >
                {renameMutation.isPending ? "正在保存…" : "保存标题"}
              </button>
            </div>
            {renameMutation.isError ? <ErrorNote error={renameMutation.error} /> : null}
          </form>
        ) : null}
        {notice ? (
          <div role="status" className="cf-editor-notice">
            {notice}
            <button aria-label="关闭提示" onClick={() => setNotice("")}>
              ×
            </button>
          </div>
        ) : null}
        {conflictError && !conflictDismissed ? (
          <ConflictRecovery
            error={conflictError}
            refreshing={conflictRefreshing}
            onKeepLocal={() => {
              setConflictDismissed(true);
              setNotice("已保留本地稿。保存或重新生成前，请先确认当前正文来源。");
            }}
            onRefreshRemote={() => void refreshRemoteAfterConflict()}
            onOpenDiff={() => void openConflictDiff()}
          />
        ) : null}
        <div className="cf-paper">
          <h1>{detail.document.title}</h1>
          <div className="cf-paper-tools">
            <span>正文</span>
            <span>纯文本 · 自动保存</span>
            <span>{count.toLocaleString()} 字</span>
          </div>
          <textarea
            ref={textarea}
            aria-label="章节正文"
            className="cf-manuscript"
            placeholder="在这里，写下故事的第一行…"
            value={content}
            readOnly={busy || Boolean(detail.document.archivedAt)}
            onChange={(e) => {
              contentRef.current = e.target.value;
              setContent(e.target.value);
              captureSelection(e.target);
            }}
            onSelect={(e) => scheduleSelectionCapture(e.currentTarget)}
            onKeyDown={(e) => scheduleSelectionCapture(e.currentTarget)}
            onKeyUp={(e) => scheduleSelectionCapture(e.currentTarget)}
            onMouseUp={(e) => scheduleSelectionCapture(e.currentTarget)}
            spellCheck={false}
          />
          {selection.end > selection.start ? (
            <div
              className="cf-selection-toolbar"
              role="toolbar"
              aria-label="选区 AI 工具"
            >
              {selectionActions.map((a) => (
                <button
                  key={a.label}
                  disabled={busy}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => edit(a.instruction, true)}
                >
                  {a.label}
                </button>
              ))}
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setTab("ai");
                  setInstruction("");
                }}
              >
                自定义
              </button>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setTab("comments")}
              >
                <MessageSquarePlus size={13} />
                批注
              </button>
            </div>
          ) : null}
          <footer>
            <span role="status">{saveState}</span>
            <span>共 {count.toLocaleString()} 字</span>
          </footer>
        </div>
        {draftMutation.isError ? (
          <div className="cf-card">
            <ErrorNote error={draftMutation.error} />
            <button onClick={() => void retryDraft()}>重试保存</button>
          </div>
        ) : null}
        {action.isError ? <ErrorNote error={action.error} /> : null}
        {accept.isError ? <ErrorNote error={accept.error} /> : null}
      </section>
      <aside className="cf-writing-assistant">
        <div className="cf-assistant-tabs" role="tablist" aria-label="创作助手">
            {[
              { id: "chapter", label: "本章" },
              { id: "ai", label: "AI" },
              { id: "review", label: "检查" },
              { id: "canon", label: "设定变化" },
              { id: "comments", label: `批注${detail.comments.length ? ` (${detail.comments.length})` : ""}` },
            ].map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab === "chapter" ? (
          <div className="cf-assistant-content">
            <div className="cf-section-title">
              <h3>本章章纲</h3>
              {node ? (
                <button className="cf-text-link" onClick={() => setBrief(true)}>
                  编辑
                </button>
              ) : null}
            </div>
            <BriefItem
              icon={<Target />}
              title="本章目标"
              value={node?.goal ?? node?.summary}
            />
            <BriefItem
              icon={<Swords />}
              title="核心冲突"
              value={node?.conflict}
            />
            <BriefItem
              icon={<Star />}
              title="爽点 / 回报"
              value={node?.outcome}
            />
            <BriefItem
              icon={<Link2 />}
              title="章尾钩子"
              value={
                typeof node?.metadata.hook === "string"
                  ? node.metadata.hook
                  : null
              }
            />
            <BriefItem
              icon={<Users />}
              title="出场人物"
              value={story.entities
                .filter(
                  (e) =>
                    e.id === node?.povEntityId ||
                    (Array.isArray(node?.metadata.characterIds) &&
                      node.metadata.characterIds.includes(e.id)),
                )
                .map((e) => e.name)
                .join("、")}
            />
            <BriefItem
              icon={<FileText />}
              title="关联伏笔"
              value={story.foreshadows
                .filter(
                  (f) =>
                    Array.isArray(node?.metadata.foreshadowIds) &&
                    node.metadata.foreshadowIds.includes(f.id),
                )
                .map((f) => f.title)
                .join("、")}
            />
            <Link
              className="cf-text-link"
              to={`/books/${projectId}/outline?spread=outline`}
            >
              查看完整大纲 →
            </Link>
          </div>
        ) : null}
        {tab === "ai" ? (
          <div className="cf-assistant-content">
            <h3>把想法，变成更好的文字。</h3>
            {params.get("novelIssue") ? (
              <p className="cf-editor-notice" role="status">
                这条修改要求来自前三章体检。生成的内容仍会先作为候选，接受后才会写入正文。
              </p>
            ) : null}
            <p>
              {selection.end > selection.start
                ? `已选中 ${selection.end - selection.start} 个字符。`
                : "选择一段文字，或对整章进行调整。"}
            </p>
            <div className="cf-ai-actions">
              {chapterActions.map((a) => (
                <button
                  key={a.label}
                  disabled={busy || (a.label === "续写" && !node)}
                  onClick={() =>
                    a.label === "续写"
                      ? action.mutate({ kind: "chapter" })
                      : edit(a.instruction, true)
                  }
                >
                  <PenLine size={14} />
                  {a.label}
                </button>
              ))}
            </div>
            <label>
              自定义要求
              <textarea
                rows={3}
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="告诉助手，你希望怎样修改…"
              />
            </label>
            <button
              disabled={busy || !instruction.trim()}
              className="cf-primary"
              onClick={() => edit(instruction, true)}
            >
              生成改写建议
            </button>
            <small>AI 建议需要你接受后才会替换正文。</small>
            {detail.proposals
              .filter((p) => p.status === "proposed")
              .map((p) => (
                (() => {
                  const origin = runs.data?.find((run) => run.id === p.runId)?.policy
                    .origin as { checkIssueId?: string; checkReportId?: string } | null | undefined;
                  return (
                <article className="cf-proposal" key={p.id}>
                  <h3>改写建议</h3>
                  {origin?.checkIssueId ? (
                    <small>
                      来源：前三章体检问题（{origin.checkReportId ? `报告 ${origin.checkReportId.slice(0, 8)} · ` : ""}已绑定当前候选）
                    </small>
                  ) : null}
                  <small>原文</small>
                  <del>{p.originalText}</del>
                  <small>建议</small>
                  <ins>{p.replacementText}</ins>
                  <div className="cf-actions">
                    <button
                      className="cf-primary"
                      disabled={busy}
                      onClick={() =>
                        accept.mutate({ id: p.id, action: "accept" })
                      }
                    >
                      接受改写
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => accept.mutate({ id: p.id, action: "accept", mode: "insert_after" })}
                    >
                      插入到选区后
                    </button>
                    <button
                      disabled={busy}
                      onClick={() =>
                        accept.mutate({ id: p.id, action: "reject" })
                      }
                    >
                      放弃
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => edit(p.instruction, true)}
                    >
                      再生成
                    </button>
                    </div>
                </article>
                  );
                })()
              ))}
          </div>
        ) : null}
        {tab === "review" ? (
          <ReviewPanel
            projectId={projectId}
            documentId={detail.document.id}
            currentVersionId={detail.document.currentVersionId}
            onCheck={() => action.mutate({ kind: "review" })}
            onRevise={(instruction) => edit(instruction)}
            busy={busy}
          />
        ) : null}
        {tab === "canon" ? (
          <CanonChangesPanel projectId={projectId} document={detail.document} />
        ) : null}
        {tab === "comments" ? (
          <div className="cf-assistant-content cf-comments-panel">
            <div className="cf-section-title">
              <div>
                <h3>正文批注</h3>
                <p>批注会固定在创建时的版本和文字范围，恢复版本后仍可追溯。</p>
              </div>
              <MessageSquarePlus size={19} />
            </div>
            <div className="cf-comment-compose">
              <strong>
                {selection.end > selection.start
                  ? "已选中一段正文"
                  : "未选中文字，将批注锚定到整章正文"}
              </strong>
              <blockquote>
                {selection.end > selection.start
                  ? content.slice(selection.start, selection.end)
                  : content || "还没有正文可供批注。"}
              </blockquote>
              <label>
                批注内容
                <textarea
                  aria-label="批注内容"
                  rows={4}
                  value={commentBody}
                  onChange={(event) => setCommentBody(event.target.value)}
                  placeholder="记录需要修改的地方、核对事项或协作意见…"
                />
              </label>
              <button
                className="cf-primary"
                disabled={
                  busy ||
                  commentRange.end <= commentRange.start ||
                  !commentBody.trim()
                }
                onClick={() =>
                  commentMutation.mutate({
                    start: commentRange.start,
                    end: commentRange.end,
                    body: commentBody,
                  })
                }
              >
                {commentMutation.isPending ? "正在添加…" : "添加批注"}
              </button>
              {commentMutation.isError ? (
                <ErrorNote error={commentMutation.error} />
              ) : null}
            </div>
            <div className="cf-comment-list">
              {detail.comments.length ? (
                detail.comments.map((comment) => (
                  <article className="cf-comment" key={comment.id}>
                    <div className="cf-comment-head">
                      <span
                        className={`cf-badge ${comment.status === "resolved" ? "is-muted" : ""}`}
                      >
                        {comment.status === "open" ? "待处理" : "已解决"}
                      </span>
                      {comment.versionId !== detail.currentVersion?.id ? (
                        <small>历史版本锚点</small>
                      ) : (
                        <small>当前版本锚点</small>
                      )}
                    </div>
                    <blockquote>{comment.quote}</blockquote>
                    {editingCommentId === comment.id ? (
                      <div className="cf-comment-edit">
                        <textarea
                          aria-label={`编辑批注 ${comment.id}`}
                          rows={3}
                          value={editingCommentBody}
                          onChange={(event) => setEditingCommentBody(event.target.value)}
                        />
                        <div className="cf-actions">
                          <button
                            type="button"
                            className="cf-button"
                            onClick={() => {
                              setEditingCommentId(null);
                              setEditingCommentBody("");
                            }}
                          >
                            取消
                          </button>
                          <button
                            type="button"
                            className="cf-primary"
                            disabled={busy || !editingCommentBody.trim()}
                            onClick={() =>
                              commentEditMutation.mutate({
                                id: comment.id,
                                body: editingCommentBody,
                                expectedUpdatedAt: comment.updatedAt,
                              })
                            }
                          >
                            {commentEditMutation.isPending ? "正在保存…" : "保存批注"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p>{comment.body}</p>
                    )}
                    <small>
                      第 {comment.startOffset}—{comment.endOffset} 个字符 · {new Date(comment.createdAt).toLocaleString("zh-CN")}
                    </small>
                    <div className="cf-actions">
                      <button
                        type="button"
                        className="cf-text-link"
                        disabled={busy}
                        onClick={() => {
                          setEditingCommentId(comment.id);
                          setEditingCommentBody(comment.body);
                        }}
                      >
                        编辑批注
                      </button>
                      <button
                        type="button"
                        className="cf-button"
                        disabled={busy}
                        onClick={() =>
                          commentStatusMutation.mutate({
                            id: comment.id,
                            status:
                              comment.status === "open" ? "resolved" : "open",
                          })
                        }
                      >
                        {comment.status === "open" ? "标记已解决" : "重新打开"}
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <p className="cf-empty">还没有批注。选中文字后，可以把修改想法留在这里。</p>
              )}
            </div>
            {commentStatusMutation.isError ? (
              <ErrorNote error={commentStatusMutation.error} />
            ) : null}
            {commentEditMutation.isError ? (
              <ErrorNote error={commentEditMutation.error} />
            ) : null}
          </div>
        ) : null}
        {runId ? (
          <div className="cf-assistant-content">
            <TaskResult
              projectId={projectId}
              runId={runId}
              onAccepted={() => void refresh()}
            />
          </div>
        ) : null}
      </aside>
      {history ? (
        <Drawer title="历史版本" onClose={() => setHistory(false)}>
          <form
            className="cf-form"
            onSubmit={(e) => {
              e.preventDefault();
              action.mutate({ kind: "version" });
            }}
          >
            <label>
              版本说明
              <input
                value={versionName}
                onChange={(e) => setVersionName(e.target.value)}
                placeholder="例如：调整了本章高潮"
                maxLength={100}
              />
            </label>
            <button type="submit" className="cf-primary" disabled={busy}>
              创建版本
            </button>
          </form>
          {detail.versions.map((v, i) => (
            <article className="cf-version" key={v.id}>
              <div>
                <strong>版本 {detail.versions.length - i}</strong>
                <small>
                  {new Date(v.createdAt).toLocaleString("zh-CN")} ·{" "}
                  {effectiveCharacterCount(v.content)} 字
                </small>
                <p>
                  {v.source.startsWith("manual:") &&
                  !v.source.startsWith("manual:before-")
                    ? v.source.slice(7)
                    : v.source.startsWith("manual")
                      ? "自动保护版本"
                      : "创作版本"}
                </p>
              </div>
              {v.id === detail.document.currentVersionId ? (
                <span className="cf-badge">当前版本</span>
              ) : (
                <div className="cf-actions">
                  <button
                    onClick={() => setCompareVersionId((current) => (current === v.id ? null : v.id))}
                    disabled={busy || !detail.currentVersion}
                  >
                    {compareVersionId === v.id ? "关闭对比" : "比较当前"}
                  </button>
                  <button onClick={() => setRestore(v)} disabled={busy}>
                    恢复
                  </button>
                </div>
              )}
              <details>
                <summary>预览正文</summary>
                <pre>{v.content}</pre>
              </details>
            </article>
          ))}
          {compareVersionId ? (
            <VersionDiff
              base={detail.versions.find((version) => version.id === compareVersionId) ?? null}
              current={detail.currentVersion}
            />
          ) : null}
          {action.isError ? <ErrorNote error={action.error} /> : null}
          {restoreMutation.isError ? (
            <ErrorNote error={restoreMutation.error} />
          ) : null}
        </Drawer>
      ) : null}
      {restore ? (
        <ConfirmDialog
          title="恢复这个版本？"
          confirmLabel="恢复版本"
          pending={restoreMutation.isPending}
          onCancel={() => setRestore(null)}
          onConfirm={() => restoreMutation.mutate()}
        >
          <p>
            当前正文会先保存为保护版本，再恢复所选内容。你可以随时从历史中找回。
          </p>
        </ConfirmDialog>
      ) : null}
      {brief && node ? (
        <Drawer title="编辑本章章纲" onClose={() => setBrief(false)}>
          <BriefForm
            projectId={projectId}
            node={node}
            onSaved={() => {
              setBrief(false);
              void refresh();
            }}
          />
        </Drawer>
      ) : null}
      {archiveOpen ? (
        <ConfirmDialog
          title={detail.document.archivedAt ? "恢复这章？" : "归档这章？"}
          confirmLabel={detail.document.archivedAt ? "恢复章节" : "归档章节"}
          danger={!detail.document.archivedAt}
          onCancel={() => setArchiveOpen(false)}
          onConfirm={() => {
            setArchiveOpen(false);
            void onArchive(detail.document, !detail.document.archivedAt);
          }}
        >
          <p>
            {detail.document.archivedAt
              ? "恢复后，这章会重新出现在写作目录中。"
              : "归档后，正文和版本不会删除，可以从写作目录底部恢复。"}
          </p>
        </ConfirmDialog>
      ) : null}
    </div>
  );
}

function VersionDiff({
  base,
  current,
}: {
  base: DocumentVersion | null;
  current: DocumentVersion | null;
}) {
  if (!base || !current) return null;
  const result = createVersionDiff(base.content, current.content);
  return (
    <section className="cf-version-diff" aria-label="版本对比">
      <div className="cf-section-title">
        <div>
          <h3>版本对比</h3>
          <p>
            {new Date(base.createdAt).toLocaleString("zh-CN")} → 当前版本 · 删除 {result.removed} 行 · 新增 {result.added} 行
          </p>
        </div>
      </div>
      {result.truncated ? (
        <p className="cf-version-diff-notice">
          正文较长，已切换为摘要显示。打开两个版本的正文预览可逐段核对。
        </p>
      ) : (
        <pre>
          {result.lines.map((line, index) => (
            <span className={`cf-diff-line is-${line.kind}`} key={`${index}-${line.kind}`}>
              {line.kind === "added" ? "+ " : line.kind === "removed" ? "− " : "  "}
              {line.text}
              {index < result.lines.length - 1 ? "\n" : ""}
            </span>
          ))}
        </pre>
      )}
    </section>
  );
}

type VersionDiffLine = { kind: "same" | "added" | "removed"; text: string };

export function parseSelectionParam(value: string): { start: number; end: number } | null {
  const match = /^(\d+):(\d+)$/u.exec(value.trim());
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start)
    return null;
  return { start, end };
}

function createVersionDiff(before: string, after: string): {
  lines: VersionDiffLine[];
  added: number;
  removed: number;
  truncated: boolean;
} {
  const oldLines = before.split(/\r?\n/u);
  const newLines = after.split(/\r?\n/u);
  const maxCells = 250_000;
  if (oldLines.length * newLines.length > maxCells) {
    return {
      lines: [],
      added: newLines.length,
      removed: oldLines.length,
      truncated: true,
    };
  }
  const table = Array.from({ length: oldLines.length + 1 }, () =>
    new Uint32Array(newLines.length + 1),
  );
  for (let oldIndex = oldLines.length - 1; oldIndex >= 0; oldIndex -= 1) {
    for (let newIndex = newLines.length - 1; newIndex >= 0; newIndex -= 1) {
      table[oldIndex]![newIndex] =
        oldLines[oldIndex] === newLines[newIndex]
          ? table[oldIndex + 1]![newIndex + 1]! + 1
          : Math.max(table[oldIndex + 1]![newIndex]!, table[oldIndex]![newIndex + 1]!);
    }
  }
  const lines: VersionDiffLine[] = [];
  let oldIndex = 0;
  let newIndex = 0;
  let added = 0;
  let removed = 0;
  while (oldIndex < oldLines.length || newIndex < newLines.length) {
    if (oldIndex < oldLines.length && newIndex < newLines.length && oldLines[oldIndex] === newLines[newIndex]) {
      lines.push({ kind: "same", text: oldLines[oldIndex]! });
      oldIndex += 1;
      newIndex += 1;
    } else if (
      newIndex < newLines.length &&
      (oldIndex >= oldLines.length || table[oldIndex]![newIndex + 1]! >= table[oldIndex + 1]![newIndex]!)
    ) {
      lines.push({ kind: "added", text: newLines[newIndex]! });
      added += 1;
      newIndex += 1;
    } else {
      lines.push({ kind: "removed", text: oldLines[oldIndex]! });
      removed += 1;
      oldIndex += 1;
    }
  }
  return { lines, added, removed, truncated: false };
}

function effectiveCharacterCount(value: string): number {
  return Array.from(value.replace(/\s/gu, "")).length;
}

function BriefItem({
  icon,
  title,
  value,
}: {
  icon: React.ReactNode;
  title: string;
  value: string | null | undefined;
}) {
  return (
    <section className="cf-brief-item">
      <span>{icon}</span>
      <div>
        <h3>{title}</h3>
        <p>{value || "尚未填写"}</p>
      </div>
    </section>
  );
}

function BriefForm({
  projectId,
  node,
  onSaved,
}: {
  projectId: string;
  node: OutlineNode;
  onSaved: () => void;
}) {
  const [goal, setGoal] = useState(node.goal ?? node.summary ?? "");
  const [conflict, setConflict] = useState(node.conflict ?? "");
  const [outcome, setOutcome] = useState(node.outcome ?? "");
  const [hook, setHook] = useState(
    typeof node.metadata.hook === "string" ? node.metadata.hook : "",
  );
  const save = useMutation({
    mutationFn: () =>
      updateOutlineNode(projectId, node.id, {
        goal,
        conflict,
        outcome,
        metadata: { ...node.metadata, hook },
        expectedUpdatedAt: node.updatedAt,
      }),
    onSuccess: onSaved,
  });
  return (
    <form
      className="cf-form"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      {[
        { label: "本章目标", value: goal, set: setGoal },
        { label: "核心冲突", value: conflict, set: setConflict },
        { label: "爽点 / 回报", value: outcome, set: setOutcome },
        { label: "章尾钩子", value: hook, set: setHook },
      ].map((f) => (
        <label key={f.label}>
          {f.label}
          <textarea
            rows={3}
            value={f.value}
            onChange={(e) => f.set(e.target.value)}
          />
        </label>
      ))}
      <button className="cf-primary" disabled={save.isPending}>
        保存章纲
      </button>
      {save.isError ? <ErrorNote error={save.error} /> : null}
    </form>
  );
}
