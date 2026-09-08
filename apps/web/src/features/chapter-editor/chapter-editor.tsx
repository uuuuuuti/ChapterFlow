import { requireUnchangedDraft } from "../draft-autosave/acceptance-guard";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router";
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
import { TaskResult } from "../../features/task-progress/task-center";
import {
  getStudioDocument,
  appendDocumentVersion,
  restoreDocumentVersion,
  createSelectionEdit,
  decideEditProposal,
} from "../../shared/api/writing";
import { createChapterRun, getProjectRuns } from "../../shared/api/automation";
import { createDocumentReview } from "../../shared/api/review";
import { updateOutlineNode } from "../../shared/api/story";
import { queryKeys } from "../../shared/query/keys";
import { ErrorNote, ConfirmDialog } from "../../shared/ui";
import { Drawer } from "../../shared/ui/drawer";
import type {
  StudioDocumentDetail,
  StoryBible,
  OutlineNode,
  DocumentVersion,
} from "../../shared/api/types";
import { rememberTask } from "../../lib/task-ledger";

export function ChapterEditor({
  projectId,
  detail,
  story,
  onFlushReady,
}: {
  projectId: string;
  detail: StudioDocumentDetail;
  story: StoryBible;
  onFlushReady: (flush: FlushDraft | null) => void;
}) {
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState(
    params.get("tab") === "review" ? "review" : "chapter",
  );
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [instruction, setInstruction] = useState("");
  const [focus, setFocus] = useState(false);
  const [history, setHistory] = useState(false);
  const [versionName, setVersionName] = useState("");
  const [restore, setRestore] = useState<DocumentVersion | null>(null);
  const [notice, setNotice] = useState("");
  const [brief, setBrief] = useState(false);
  const textarea = useRef<HTMLTextAreaElement | null>(null);
  const actionLock = useRef(false);
  const request = useRef<{ key: string; id: string } | null>(null);
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
  const refresh = useCallback(async () => {
    await client.invalidateQueries({ queryKey: queryKeys.project(projectId) });
  }, [client, projectId]);
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
  const checkpoint = async (label: string) => {
    if (!(await flushDraft()))
      throw new Error("保存失败，请重试保存后再操作。");
    const latest = await getStudioDocument(projectId, detail.document.id);
    if (latest.currentVersion?.content === contentRef.current && !latest.draft)
      return latest.currentVersion;
    const version = await appendDocumentVersion(projectId, detail.document.id, {
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
        const version = await checkpoint(
          input.kind === "version"
            ? `manual:${versionName.trim() || "作者手动版本"}`
            : `manual:before-${input.kind}`,
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
              planningMode: "auto",
              maxRevisionCycles: 2,
              origin: { surface: "writing", documentId: detail.document.id },
            })
          ).run.id;
        }
        if (input.kind === "review")
          return (
            await createDocumentReview(projectId, detail.document.id, {
              requestId: request.current.id,
              documentVersionId: version.id,
              origin: { surface: "writing", documentId: detail.document.id },
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
          })
        ).run.id;
      } finally {
        actionLock.current = false;
      }
    },
    onSuccess: async (id, input) => {
      request.current = null;
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
            origin: { surface: "writing", documentId: detail.document.id },
          });
        setNotice("已开始处理，可以离开页面，稍后回来查看结果。");
      } else {
        setNotice("已创建版本。");
        setVersionName("");
      }
      await refresh();
    },
  });
  const accept = useMutation({
    mutationFn: async (input: { id: string; action: "accept" | "reject"; mode?: "insert_after" }) => {
      if (!(await flushDraft())) throw new Error("请先保存当前正文。");
      if (input.action === "accept")
        await requireUnchangedDraft(projectId, detail.document.id);
      return decideEditProposal(input.id, input.action, input.mode);
    },
    onSuccess: async () => {
      setSelection({ start: 0, end: 0 });
      await refresh();
    },
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
    action.isPending || accept.isPending || restoreMutation.isPending;
  const saveState = draftMutation.isError
    ? "保存失败"
    : draftMutation.isPending || content !== autosave.draftSavedContent
      ? "正在保存…"
      : "已保存";
  return (
    <div className={`cf-writing-desk ${focus ? "is-focus" : ""}`}>
      <section className="cf-editor-column">
        <div className="cf-writing-breadcrumb">
          <Link to="/books">我的作品</Link>
          <span>›</span>
          <Link to={`/books/${projectId}/dashboard`}>
            {story.project.title}
          </Link>
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
            <button aria-label="历史版本" onClick={() => setHistory(true)}>
              <History size={15} />
              <span>历史版本</span>
            </button>
            <button
              onClick={() => setFocus(!focus)}
              aria-label={focus ? "退出专注模式" : "专注模式"}
            >
              {focus ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
          </div>
        </header>
        {notice ? (
          <div role="status" className="cf-editor-notice">
            {notice}
            <button aria-label="关闭提示" onClick={() => setNotice("")}>
              ×
            </button>
          </div>
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
            readOnly={busy}
            onChange={(e) => {
              contentRef.current = e.target.value;
              setContent(e.target.value);
              setSelection({
                start: e.target.selectionStart,
                end: e.target.selectionEnd,
              });
            }}
            onSelect={(e) => {
              setSelection({
                start: e.currentTarget.selectionStart,
                end: e.currentTarget.selectionEnd,
              });
            }}
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
                <article className="cf-proposal" key={p.id}>
                  <h3>改写建议</h3>
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
              ))}
          </div>
        ) : null}
        {tab === "review" ? (
          <ReviewPanel
            projectId={projectId}
            documentId={detail.document.id}
            onCheck={() => action.mutate({ kind: "review" })}
            onRevise={(instruction) => edit(instruction)}
            busy={busy}
          />
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
            <button className="cf-primary" disabled={busy}>
              创建版本
            </button>
          </form>
          {detail.versions.map((v, i) => (
            <article className="cf-version" key={v.id}>
              <div>
                <strong>版本 {detail.versions.length - i}</strong>
                <small>
                  {new Date(v.createdAt).toLocaleString("zh-CN")} ·{" "}
                  {Array.from(v.content).length} 字
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
                <button onClick={() => setRestore(v)} disabled={busy}>
                  恢复
                </button>
              )}
              <details>
                <summary>预览正文</summary>
                <pre>{v.content}</pre>
              </details>
            </article>
          ))}
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
    </div>
  );
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
