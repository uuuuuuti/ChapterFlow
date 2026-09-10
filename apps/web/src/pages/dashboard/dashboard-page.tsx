import { Link, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  PenLine,
  AlertCircle,
} from "lucide-react";
import {
  useProjectOverview,
  useChapters,
  useStory,
} from "../../entities/project/queries";
import { BookCover, bookStatus } from "../../shared/ui/book-cover";
import { ErrorNote, ResourceErrorState } from "../../shared/ui";
import { QuoteCard } from "../library/library-page";
import {
  getFoundationCandidates,
  resolveFoundationCandidate,
  resolveFoundationCandidateSet,
} from "../../shared/api/automation";
import type {
  FoundationCandidate,
  FoundationCandidateSet,
  ProjectOverview,
} from "../../shared/api/types";
import { queryKeys } from "../../shared/query/keys";
export function DashboardPage() {
  const { projectId = "" } = useParams();
  const client = useQueryClient();
  const query = useProjectOverview(projectId);
  const chapters = useChapters(projectId);
  const story = useStory(projectId);
  const foundation = useQuery({
    queryKey: queryKeys.foundation(projectId),
    queryFn: ({ signal }) => getFoundationCandidates(projectId, signal),
    refetchInterval: (current) => current.state.data?.some((set) => set.set.status === "open" || set.set.status === "partially_adopted") ? 2_000 : false,
  });
  const candidateMutation = useMutation({
    mutationFn: (input: { candidate: FoundationCandidate; action: "adopt" | "discard"; payload?: Record<string, unknown> }) => resolveFoundationCandidate(input.candidate.id, input.action, input.payload, input.candidate.updatedAt),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.foundation(projectId) }),
        client.invalidateQueries({ queryKey: queryKeys.overview(projectId) }),
        client.invalidateQueries({ queryKey: queryKeys.story(projectId) }),
      ]);
    },
  });
  const setMutation = useMutation({
    mutationFn: (input: { set: FoundationCandidateSet; action: "adopt-all" | "discard-all" }) => resolveFoundationCandidateSet(input.set.set.id, input.action, Object.fromEntries(input.set.candidates.filter((candidate) => candidate.status === "pending").map((candidate) => [candidate.id, candidate.updatedAt]))),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: queryKeys.foundation(projectId) });
      await client.invalidateQueries({ queryKey: queryKeys.overview(projectId) });
    },
  });
  if (query.isPending)
    return (
      <div className="cf-page" role="status">
        正在打开作品…
      </div>
    );
  if (query.isError)
    return (
      <div className="cf-page">
        <ResourceErrorState
          error={query.error}
          backHref="/books"
          backLabel="回到作品库"
          title="找不到这本作品"
          description="这本作品可能已被删除、移入回收站，或当前链接已经过期。"
        />
      </div>
    );
  const data = query.data;
  const p = data.project;
  const current = data.currentChapter;
  const link = `/books/${projectId}/write${current?.documentId ? `/${current.documentId}` : ""}`;
  const hasChapters = Boolean(chapters.data?.length);
  const continueHref = current?.documentId
    ? link
    : hasChapters
      ? `/books/${projectId}/write`
      : `/books/${projectId}/outline`;
  const nextAction = nextActionPresentation(data, projectId);
  const progress = data.progress;
  const ratio = progress.totalChapters
    ? Math.round((progress.committedChapters / progress.totalChapters) * 100)
    : 0;
  return (
    <div className="cf-page">
      <div className="cf-page-title">
        <div>
          <h1>创作首页</h1>
          <p>回到你的故事，继续推进今天的创作。</p>
        </div>
      </div>
      <div className="cf-content-aside">
        <div>
          <section className="cf-card cf-dashboard-hero">
            <BookCover project={p} />
            <div>
              <h2>{p.title}</h2>
              <span className="cf-badge">{bookStatus(p.phase)}</span>
              <p>
                {progress.wordCount.toLocaleString()} 字 ·{" "}
                {progress.totalChapters} 章节
              </p>
              <p>{p.premise || "让每一个故事，都被认真对待。"}</p>
            </div>
            <div className="cf-continue">
              <small>接着上次，继续写</small>
              <h3>{current?.title ?? (hasChapters ? "开始第一章" : "先创建第一章")}</h3>
              <p>
                {data.activeTask
                  ? "有创作任务正在处理，可在任务中心查看。"
                  : "一章一章，让想象成为文字。"}
              </p>
              <Link className="cf-primary" to={continueHref}>
                <PenLine size={18} />
                {current ? "继续写作" : hasChapters ? "开始第一章" : "先建章纲"}
              </Link>
              <Link className="cf-text-link" to={`/books/${projectId}/outline`}>
                查看大纲 <ArrowRight size={14} />
              </Link>
              {!current && !hasChapters ? (
                <Link className="cf-text-link" to={`/books/${projectId}/write`}>
                  继续写作 <ArrowRight size={14} />
                </Link>
              ) : null}
            </div>
          </section>
          <section className="cf-card cf-dashboard-next-action">
            <div>
              <p className="cf-eyebrow">NEXT STEP</p>
              <h2>{nextAction.title}</h2>
              <p>{nextAction.description}</p>
            </div>
            <Link className="cf-primary" to={nextAction.href}>
              {nextAction.cta} <ArrowRight size={15} />
            </Link>
          </section>
          <h2>下一步建议</h2>
          <div className="cf-suggestion-grid">
            <Link className="cf-card" to={continueHref}>
              <CheckCircle2 />
              <strong>{current ? "本章已准备好" : hasChapters ? "开启第一章" : "先创建第一章"}</strong>
              <p>{current?.title ?? (hasChapters ? "从已有章纲开始写正文。" : "先建立一个章节节点，写作台会保留你的作品上下文。")}</p>
            </Link>
            <Link className="cf-card" to={link + "?tab=review"}>
              <AlertCircle />
              <strong>
                {data.pending.reviewIssues
                  ? `${data.pending.reviewIssues} 个问题待检查`
                  : "让故事前后一致"}
              </strong>
              <p>
                {data.pending.reviewIssues
                  ? "查看本章检查与修改建议"
                  : "写完一章后，检查人物与剧情。"}
              </p>
            </Link>
            <Link className="cf-card" to={`/books/${projectId}/outline`}>
              <BookOpen />
              <strong>梳理接下来的故事</strong>
              <p>提前准备章纲，让创作更从容。</p>
            </Link>
          </div>
          <div className="cf-section-title">
            <h2>最近章节</h2>
            <Link className="cf-text-link" to={`/books/${projectId}/write`}>
              查看全部 →
            </Link>
          </div>
          <section className="cf-card">
            {(chapters.data ?? [])
              .slice()
              .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
              .slice(0, 5)
              .map((ch) => (
                <div className="cf-chapter-row" key={ch.id}>
                  <BookOpen size={18} />
                  <div>
                    <strong>{ch.title}</strong>
                    <small>
                      {ch.currentVersionId ? "已有保存版本" : "草稿"} ·{" "}
                      {new Date(ch.updatedAt).toLocaleDateString("zh-CN")}
                    </small>
                  </div>
                  <Link
                    className="cf-button"
                    to={`/books/${projectId}/write/${ch.id}`}
                  >
                    继续
                  </Link>
                </div>
              ))}
            {!chapters.data?.length ? (
              <div className="cf-empty-note">
                <p>还没有章节。先建立第一章的章纲，再开始写正文。</p>
                <Link className="cf-text-link" to={`/books/${projectId}/outline`}>
                  创建第一章章纲 →
                </Link>
              </div>
            ) : null}
          </section>
          <section className="cf-card cf-progress-card">
            <h2>作品进度</h2>
            <strong>
              {progress.committedChapters} / {progress.totalChapters} 章已定稿
            </strong>
            <progress max={100} value={ratio} />
            <small>{ratio}%</small>
          </section>
          <FoundationReview
            id="foundation-candidates"
            sets={foundation.data ?? []}
            active={data.activeTask?.kind === "foundation"}
            pending={candidateMutation.isPending || setMutation.isPending}
            error={foundation.error ?? candidateMutation.error ?? setMutation.error}
            onCandidate={(candidate, action, payload) => candidateMutation.mutate({ candidate, action, ...(payload ? { payload } : {}) })}
            onSet={(set, action) => setMutation.mutate({ set, action })}
          />
        </div>
        <aside className="cf-side-stack">
          <section className="cf-card">
            <h2>待处理</h2>
            <PendingLink
              label="章节检查"
              value={data.pending.reviewIssues}
              href={`/books/${projectId}/write${data.pending.reviewDocumentId ? `/${data.pending.reviewDocumentId}` : ""}?tab=review`}
            />
            <PendingLink
              label="AI 改写建议"
              value={data.pending.revisionProposals}
              href={`/books/${projectId}/write${data.pending.reviewDocumentId ? `/${data.pending.reviewDocumentId}` : ""}?tab=review`}
            />
            <PendingLink
              label="设定变化"
              value={data.pending.canonChangeSets}
              href={`/books/${projectId}/write?tab=canon`}
            />
          </section>
          <section className="cf-card">
            <h2>伏笔提醒</h2>
            {story.data?.foreshadows.slice(0, 4).map((f) => (
              <div className="cf-chapter-row" key={f.id}>
                <span className="cf-dot" />
                <strong>{f.title}</strong>
              </div>
            ))}
            {!story.data?.foreshadows.length ? (
              <p>埋下的伏笔，会在这里等待回响。</p>
            ) : null}
            <Link
              className="cf-text-link"
              to={`/books/${projectId}/knowledge/foreshadow`}
            >
              查看作品设定 →
            </Link>
          </section>
          <QuoteCard />
        </aside>
      </div>
    </div>
  );
}

function FoundationReview({
  id,
  sets,
  active,
  pending,
  error,
  onCandidate,
  onSet,
}: {
  id?: string;
  sets: FoundationCandidateSet[];
  active: boolean;
  pending: boolean;
  error: unknown;
  onCandidate: (candidate: FoundationCandidate, action: "adopt" | "discard", payload?: Record<string, unknown>) => void;
  onSet: (set: FoundationCandidateSet, action: "adopt-all" | "discard-all") => void;
}) {
  const openSets = sets.filter((set) => set.set.status === "open" || set.set.status === "partially_adopted");
  if (!active && !openSets.length) return null;
  return <section id={id} className="cf-card cf-foundation-review"><div className="cf-section-title"><div><h2>AI 策划草案</h2><p>{openSets.length ? "逐项采用你认可的作品定位、主线和人物，不会自动覆盖正文。" : "策划任务正在运行，候选结果会在这里出现。"}</p></div><span className="cf-badge">{openSets.length ? `${openSets.length} 组待确认` : "生成中"}</span></div>{error ? <ErrorNote error={error} /> : null}{openSets.map((set) => { const isPlanSet = set.candidates.some((candidate) => candidate.kind === "plan"); return <div className="cf-foundation-set" key={set.set.id}><header><div><strong>{set.set.title}</strong><small>{set.candidates.length} 个候选</small></div><div className="cf-actions"><button className="cf-button" disabled={pending} onClick={() => onSet(set, "discard-all")}>暂不采用</button>{isPlanSet ? <span className="cf-inline-hint">请选择一份方案</span> : <button className="cf-primary" disabled={pending} onClick={() => onSet(set, "adopt-all")}>全部采用</button>}</div></header><div className="cf-foundation-candidates">{set.candidates.map((candidate) => <FoundationCandidateCard key={candidate.id} candidate={candidate} pending={pending} onAction={onCandidate} />)}</div></div>; })}</section>;
}

function PendingLink({ label, value, href }: { label: string; value: number; href: string }) {
  const content = <><strong>{label}</strong><b>{value}</b></>;
  return value > 0 ? <Link className="cf-stat cf-stat-link" to={href}>{content}</Link> : <div className="cf-stat">{content}</div>;
}

function nextActionPresentation(
  data: Pick<ProjectOverview, "activeTask" | "currentChapter" | "nextAction" | "pending">,
  projectId: string,
): { title: string; description: string; href: string; cta: string } {
  const id = encodeURIComponent(projectId);
  switch (data.nextAction.kind) {
    case "continue_task": {
      const task = data.activeTask;
      if (task?.kind === "chapter" && task.targetChapter?.documentId) {
        return {
          title: "继续处理当前任务",
          description: task.targetChapter.title,
          href: `/books/${id}/write/${encodeURIComponent(task.targetChapter.documentId)}?run=${encodeURIComponent(task.id)}&document=${encodeURIComponent(task.targetChapter.documentId)}`,
          cta: "回到任务现场",
        };
      }
      if (task?.kind === "quick_creation") {
        return {
          title: "继续快速创作",
          description: "任务会在原生页面中恢复。",
          href: `/books/${id}/quick-create?session=${encodeURIComponent(task.id)}`,
          cta: "继续任务",
        };
      }
      return {
        title: "继续处理开书任务",
        description: "候选结果和任务状态会在作品首页恢复。",
        href: `/books/${id}/dashboard?task=${encodeURIComponent(task?.id ?? data.nextAction.targetId ?? "")}`,
        cta: "查看任务",
      };
    }
    case "review_foundation":
      return {
        title: "确认 AI 开书方案",
        description: `${data.pending.foundationCandidates} 项策划候选等待你的选择。`,
        href: `/books/${id}/dashboard#foundation-candidates`,
        cta: "查看候选",
      };
    case "resolve_story_changes":
      return {
        title: "处理设定变化",
        description: "先查看差异和影响，再决定是否写入作品设定。",
        href: `/books/${id}/write?tab=canon&changeSet=${encodeURIComponent(data.nextAction.targetId ?? "")}`,
        cta: "查看设定变化",
      };
    case "review_writing":
      return {
        title: "处理章节检查",
        description: "检查报告和改写建议会绑定当前正文版本。",
        href: `/books/${id}/write${data.pending.reviewDocumentId ? `/${encodeURIComponent(data.pending.reviewDocumentId)}` : ""}?tab=review`,
        cta: "打开检查",
      };
    case "write_chapter":
      return {
        title: data.currentChapter ? "开始写下一章" : "准备第一章",
        description: data.currentChapter?.title ?? "先在大纲中建立章节，再回到写作台。",
        href: data.currentChapter?.documentId
          ? `/books/${id}/write/${encodeURIComponent(data.currentChapter.documentId)}`
          : `/books/${id}/write?outline=${encodeURIComponent(data.nextAction.targetId ?? "")}`,
        cta: "进入写作台",
      };
    case "build_outline":
      return {
        title: "先搭出故事骨架",
        description: "建立卷、章节和场景后，写作会有清晰的落点。",
        href: `/books/${id}/outline`,
        cta: "打开大纲",
      };
    case "complete":
      return {
        title: "检查并准备导出",
        description: "章节已经定稿，可以检查质量并生成手工发布文件。",
        href: `/books/${id}/publish`,
        cta: "进入发布",
      };
  }
}

function FoundationCandidateCard({ candidate, pending, onAction }: { candidate: FoundationCandidate; pending: boolean; onAction: (candidate: FoundationCandidate, action: "adopt" | "discard", payload?: Record<string, unknown>) => void }) {
  const payload = candidate.editedPayload ?? candidate.payload;
  const entries = Object.entries(payload).filter(([, value]) => typeof value === "string" || typeof value === "number").slice(0, 4);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string | number>>({});
  const startEditing = () => {
    setDraft(Object.fromEntries(entries) as Record<string, string | number>);
    setEditing(true);
  };
  const editedPayload = { ...payload, ...draft };
  const finishEditing = () => {
    setEditing(false);
    setDraft({});
  };
  return <article className="cf-foundation-candidate" data-kind={candidate.kind} data-status={candidate.status}><header><strong>{candidate.label}</strong><span>{candidate.kind === "plan" ? "完整方案" : candidate.kind} · {candidate.status === "pending" ? "待确认" : candidate.status === "adopted" ? "已采用" : "已搁置"}</span></header>{editing ? <dl className="cf-foundation-candidate-edit">{entries.map(([key, value]) => <label key={key}><dt>{key}</dt><dd><input aria-label={`${candidate.label} ${key}`} value={String(draft[key] ?? value)} onChange={(event) => setDraft((current) => ({ ...current, [key]: typeof value === "number" ? Number(event.target.value) : event.target.value }))} /></dd></label>)}</dl> : entries.length ? <dl>{entries.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>)}</dl> : <p>候选内容已生成，可在原始策划任务中查看详情。</p>}{candidate.status === "pending" ? <footer>{editing ? <><button className="cf-button" disabled={pending} onClick={finishEditing}>取消编辑</button><button className="cf-primary" disabled={pending} onClick={() => { onAction(candidate, "adopt", editedPayload); finishEditing(); }}>保存修改并采用</button></> : <><button className="cf-button" disabled={pending} onClick={() => onAction(candidate, "discard")}>搁置</button><button className="cf-button" disabled={pending} onClick={startEditing}>编辑候选</button><button className="cf-primary" disabled={pending} onClick={() => onAction(candidate, "adopt")}>{candidate.kind === "plan" ? "采用此方案" : "采用这个方案"}</button></>}</footer> : null}</article>;
}
