import { ProjectActions } from "../../features/project-actions/project-actions";
import { useQuery } from "@tanstack/react-query";
import { getProjectsIncludingArchived } from "../../shared/api/projects";
import { useEffect, useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router";
import {
  BookOpen,
  Plus,
  PenLine,
  ArrowRight,
  Library,
  Lightbulb,
} from "lucide-react";
import { useProjects } from "../../entities/project/queries";
import {
  createProject,
  deleteProject,
  purgeRecycledProject,
  updateProject,
} from "../../shared/api/projects";
import { controlRun, getRunDetail } from "../../shared/api/automation";
import {
  analyzeStoryImport,
  applyStoryImport,
  discardStoryImport,
  getStoryImport,
  uploadStoryFile,
} from "../../shared/api/delivery";
import {
  createProjectWithFoundation,
} from "../../shared/api/automation";
import { FoundationReview } from "./foundation-review";
import type {
  ImportBatchDetail,
  ImportFormat,
  RunDetail,
} from "../../shared/api/types";
import { queryKeys } from "../../shared/query/keys";
import { BookCover, bookStatus } from "../../shared/ui/book-cover";
import { ErrorNote } from "../../shared/ui";
import type { Project } from "../../shared/api/types";
import { createSigningSprint } from "../../shared/api/signing-sprint";
export function LibraryPage() {
  const query = useProjects();
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("recent");
  const archived = params.get("archived") === "1";
  const all = useQuery({
    queryKey: queryKeys.archivedProjects,
    queryFn: ({ signal }) => getProjectsIncludingArchived(signal),
    enabled: archived,
  });
  const books = archived
    ? (all.data ?? []).filter((p) => p.archivedAt)
    : (query.data ?? []);
  const search = params.get("q") ?? "";
  const normalizedSearch = search.trim().toLocaleLowerCase("zh-CN");
  const shown = books
    .filter(
      (p) =>
        (!status || bookStatus(p.phase) === status) &&
        `${p.title} ${p.premise ?? ""}`.toLocaleLowerCase("zh-CN").includes(normalizedSearch),
    )
    .sort((a, b) =>
      sort === "title"
        ? a.title.localeCompare(b.title, "zh-CN")
        : b.updatedAt.localeCompare(a.updatedAt),
    );
  const titleGroups = new Map<string, Project[]>();
  for (const project of shown) {
    const key = project.title.trim().toLocaleLowerCase("zh-CN");
    const group = titleGroups.get(key) ?? [];
    group.push(project);
    titleGroups.set(key, group);
  }
  const duplicateLabel = (project: Project): string | null => {
    const group =
      titleGroups.get(project.title.trim().toLocaleLowerCase("zh-CN")) ?? [];
    return group.length > 1
      ? `同名副本 ${group.indexOf(project) + 1}/${group.length}`
      : null;
  };
  const recent = [...shown]
    .sort((a, b) =>
      (b.lastWritingAt ?? b.updatedAt).localeCompare(
        a.lastWritingAt ?? a.updatedAt,
      ),
    )
    .slice(0, 2);
  const recentIds = new Set(recent.map((project) => project.id));
  const remaining = shown.filter((project) => !recentIds.has(project.id));
  return (
    <div className="cf-page">
      <div className="cf-page-title">
        <div>
          <h1>我的作品</h1>
          <p>管理你的小说作品，继续创作，或开始新的故事。</p>
        </div>
        <Link className="cf-primary" to="/books/new">
          <Plus size={17} />
          新建作品
        </Link>
      </div>
      <div className="cf-content-aside">
        <div>
          {query.isError ? <ErrorNote error={query.error} /> : null}
          {query.isPending ? <p role="status">正在打开你的作品…</p> : null}
          {recent.length > 0 ? (
            <>
              <h2>最近创作</h2>
              <div className="cf-recent-grid">
                {recent.map((p) => (
                  <BookCard
                    key={p.id}
                    project={p}
                    featured
                    duplicateLabel={duplicateLabel(p)}
                  />
                ))}
              </div>
            </>
          ) : null}
          <div className="cf-section-title">
            <h2>
              {archived ? "归档作品" : recent.length ? "其他作品" : "全部作品"}{" "}
              <span>（{archived || !recent.length ? shown.length : remaining.length}）</span>
            </h2>
            <div className="cf-actions">
              <label className="cf-library-search">
                <span>搜索作品</span>
                <input
                  aria-label="搜索作品"
                  value={search}
                  placeholder="书名或简介"
                  onChange={(event) => {
                    const next = new URLSearchParams(params);
                    const value = event.target.value;
                    if (value) next.set("q", value);
                    else next.delete("q");
                    setParams(next, { replace: true });
                  }}
                />
              </label>
              <Link
                className="cf-text-link"
                to={archived ? "/books" : "/books?archived=1"}
              >
                {archived ? "返回作品" : "查看归档"}
              </Link>
              {!archived ? (
                <Link className="cf-text-link" to="/books/trash">
                  回收站
                </Link>
              ) : null}
              <select
                aria-label="作品状态"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">全部状态</option>
                {["准备中", "创作中", "已完结"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              <select
                aria-label="作品排序"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
                <option value="recent">按更新时间</option>
                <option value="title">按书名</option>
              </select>
            </div>
          </div>
          <div className="cf-book-grid">
            {(recent.length && !archived ? remaining : shown).map((p) => (
              <BookCard
                key={p.id}
                project={p}
                duplicateLabel={duplicateLabel(p)}
              />
            ))}
          </div>
          {!query.isPending && !query.isError && shown.length === 0 ? (
            <div className="cf-empty cf-card">
              <BookOpen size={46} />
              <h2>
                {books.length
                  ? "没有找到匹配的作品"
                  : "每一个长篇，都从一个想法开始。"}
              </h2>
              <p>
                {books.length
                  ? "试试其他书名或状态。"
                  : "写下一句话，为你的故事留一个位置。"}
              </p>
              <Link className="cf-primary" to="/books/new">
                <Plus size={17} />
                创建第一部作品
              </Link>
            </div>
          ) : null}
        </div>
        <aside className="cf-side-stack">
          <section className="cf-card">
            <h2>创作概览</h2>
            <Stat
              icon={<Library />}
              label="总作品数"
              value={books.length}
              note="记录你的每一个故事"
            />
            <Stat
              icon={<PenLine />}
              label="创作中"
              value={
                books.filter((p) => bookStatus(p.phase) === "创作中").length
              }
              note="持续创作，慢慢成篇"
            />
            <Stat
              icon={<BookOpen />}
              label="累计正文字数"
              value={books
                .reduce((n, p) => n + (p.wordCount ?? 0), 0)
                .toLocaleString()}
              note="来自已保存的作品内容"
            />
          </section>
          <QuoteCard />
          <section className="cf-card">
            <h3>
              <Lightbulb size={19} />
              创作小贴士
            </h3>
            <p>
              先完成，再完善。
              <br />
              好故事是在持续的书写中诞生的。
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
function Stat({
  icon,
  label,
  value,
  note,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  note: string;
}) {
  return (
    <div className="cf-stat">
      <span>{icon}</span>
      <div>
        <strong>{label}</strong>
        <small>{note}</small>
      </div>
      <b>{value}</b>
    </div>
  );
}
function BookCard({
  project: p,
  featured = false,
  duplicateLabel = null,
}: {
  project: Project;
  featured?: boolean;
  duplicateLabel?: string | null;
}) {
  const recoveryCopy =
    p.title.includes("备份恢复") || p.title.includes("恢复副本");
  return (
    <article
      className={`cf-card cf-book ${featured ? "cf-book-featured" : ""}`}
    >
      <ProjectActions project={p} />
      <BookCover project={p} />
      <div className="cf-book-info">
        <Link to={`/books/${p.id}/dashboard`}>
          <h3>{p.title}</h3>
        </Link>
        <span className="cf-badge">{bookStatus(p.phase)}</span>
        {recoveryCopy ? <span className="cf-badge is-muted">恢复副本</span> : null}
        {duplicateLabel ? (
          <span className="cf-badge is-muted">{duplicateLabel}</span>
        ) : null}
        <p className="cf-clamp">{p.premise || "故事的下一页，等你来写。"}</p>
        <small>
          {(p.wordCount ?? 0).toLocaleString()} 字 · {p.totalChapters ?? 0} 章节
        </small>
        <small>
          最近更新：
          {new Date(p.lastWritingAt ?? p.updatedAt).toLocaleDateString("zh-CN")}
        </small>
        <div className="cf-actions">
          <Link
            className={featured ? "cf-primary" : "cf-text-link"}
            to={`/books/${p.id}/write`}
          >
            {featured ? "继续创作" : "打开作品"}
            {!featured ? <ArrowRight size={14} /> : null}
          </Link>
          {featured ? (
            <Link className="cf-button" to={`/books/${p.id}/dashboard`}>
              查看作品
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}
export function QuoteCard() {
  return (
    <section className="cf-quote">
      <p>
        好故事，
        <br />
        会在这里慢慢长大。
      </p>
      <span>——</span>
      <small>
        在这里，
        <br />
        创作不再孤单。
      </small>
      <BookOpen size={78} strokeWidth={0.8} />
    </section>
  );
}
export function BookCreatePage() {
  const [params] = useSearchParams();
  const requestedMode = params.get("mode");
  const queryMode: "choose" | "manual" | "ai" | "import" | "signing-sprint" =
    requestedMode === "manual" ||
    requestedMode === "ai" ||
    requestedMode === "import" ||
    requestedMode === "signing-sprint"
      ? requestedMode
      : "choose";
  return <BookCreateMode key={queryMode} initialMode={queryMode} />;
}

function BookCreateMode({
  initialMode,
}: {
  initialMode: "choose" | "manual" | "ai" | "import" | "signing-sprint";
}) {
  const [mode, setMode] = useState<"choose" | "manual" | "ai" | "import" | "signing-sprint">(
    initialMode,
  );
  if (mode === "choose") return <CreateModeChooser onChoose={setMode} />;
  if (mode === "import") return <ImportCreateFlow onBack={() => setMode("choose")} />;
  if (mode === "signing-sprint") {
    return <SigningSprintCreateForm onBack={() => setMode("choose")} />;
  }
  return <CreateForm key={mode} mode={mode} onBack={() => setMode("choose")} />;
}

function CreateModeChooser({ onChoose }: { onChoose: (mode: "manual" | "ai" | "import" | "signing-sprint") => void }) {
  return <div className="cf-page cf-create"><Link className="cf-text-link" to="/books">← 我的作品</Link><h1>开始一个新故事</h1><p>选择最适合现在的方式，之后仍可以随时切换为手工创作。</p><div className="cf-create-options"><button className="cf-card cf-create-option cf-create-option-featured" onClick={() => onChoose("signing-sprint")}><span className="cf-create-option-icon">↗</span><h2>快速开书</h2><p>从一句话想法走到作品定位、包装和前三章，边确认边开始写。</p><strong>进入签约准备工作流 →</strong></button><button className="cf-card cf-create-option" onClick={() => onChoose("ai")}><span className="cf-create-option-icon">✦</span><h2>AI 帮我开书</h2><p>从一句话想法开始，生成作品定位、主线和章节规划草案。</p><strong>输入想法 →</strong></button><button className="cf-card cf-create-option" onClick={() => onChoose("manual")}><span className="cf-create-option-icon">✎</span><h2>自己创建</h2><p>只填写书名和简介，人物、大纲和正文都由你慢慢补全。</p><strong>从空白开始 →</strong></button><button className="cf-card cf-create-option" onClick={() => onChoose("import")}><span className="cf-create-option-icon">↥</span><h2>导入已有作品</h2><p>上传 Markdown、TXT、DOCX、HTML、EPUB 或文织备份，先预览再导入。</p><strong>上传作品 →</strong></button></div></div>;
}

function SigningSprintCreateForm({ onBack }: { onBack: () => void }) {
  const [title, setTitle] = useState("");
  const [premise, setPremise] = useState("");
  const [genre, setGenre] = useState("");
  const [audience, setAudience] = useState("");
  const [coreEmotion, setCoreEmotion] = useState("");
  const navigate = useNavigate();
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: async () => {
      const project = await createProject({
        requestId: crypto.randomUUID(),
        title: title.trim() || "未命名作品",
        premise: premise.trim() || null,
        language: "zh-CN",
        bookProfile: {
          presetId: null,
          genre: genre.trim() || null,
          audience: audience.trim() || null,
          promise: null,
          tone: null,
          endingDirection: null,
          pov: null,
          updateCadence: null,
          targetWordsPerChapter: null,
          boundaries: [],
          worldRules: [],
          arcNotes: [],
        },
      });
      await createSigningSprint(project.id, {
        premise: premise.trim() || null,
        genre: genre.trim() || null,
        audience: audience.trim() || null,
        coreEmotion: coreEmotion.trim() || null,
      });
      return project;
    },
    onSuccess: async (project) => {
      await client.invalidateQueries({ queryKey: queryKeys.projects });
      navigate(`/books/${project.id}/signing-sprint`);
    },
  });
  return <div className="cf-page cf-create"><button className="cf-text-link cf-back-button" onClick={onBack}>← 选择其他方式</button><h1>快速开书</h1><p>可以从空白开始，也可以先写下一个模糊想法。后面每一步都能修改。</p><form className="cf-card cf-signing-sprint-create-form" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}><h2>先建立一个可编辑的起点</h2><div className="cf-form-grid"><label>作品名（可先留空）<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="暂时不确定也没关系" /></label><label>大致题材<input value={genre} onChange={(event) => setGenre(event.target.value)} placeholder="都市、悬疑、玄幻……" /></label><label>目标读者<input value={audience} onChange={(event) => setAudience(event.target.value)} placeholder="想写给谁看？" /></label><label>核心阅读体验<input value={coreEmotion} onChange={(event) => setCoreEmotion(event.target.value)} placeholder="爽感、紧张、治愈、反转……" /></label></div><label>一句话想法（可选）<textarea rows={5} value={premise} onChange={(event) => setPremise(event.target.value)} placeholder="例如：一个能看见临终前七秒的人，必须在城市停电前找到真正的凶手。" /></label><div className="cf-actions"><button type="submit" className="cf-primary" disabled={mutation.isPending}>{mutation.isPending ? "正在建立作品…" : "进入快速开书"}</button>{mutation.isError ? <span className="cf-error">{mutation.error instanceof Error ? mutation.error.message : "建立作品失败，请重试。"}</span> : null}</div></form></div>;
}

type NewBookDraft = {
  hasValue: boolean;
  title: string;
  premise: string;
  genre: string;
  audience: string;
  tone: string;
  promise: string;
  pov: string;
  endingDirection: string;
  updateCadence: string;
  targetWordsPerChapter: string;
  boundaries: string;
  worldRules: string;
  arcNotes: string;
};

function readNewBookDraft(key: string): NewBookDraft {
  const empty: NewBookDraft = {
    hasValue: false,
    title: "",
    premise: "",
    genre: "",
    audience: "",
    tone: "",
    promise: "",
    pov: "",
    endingDirection: "",
    updateCadence: "",
    targetWordsPerChapter: "",
    boundaries: "",
    worldRules: "",
    arcNotes: "",
  };
  if (typeof window === "undefined") return empty;
  try {
    const saved = window.localStorage.getItem(key);
    if (!saved) return empty;
    const parsed = JSON.parse(saved) as Partial<NewBookDraft>;
    return {
      ...empty,
      hasValue: true,
      ...Object.fromEntries(
        Object.keys(empty)
          .filter((field) => field !== "hasValue")
          .map((field) => [field, typeof parsed[field as keyof NewBookDraft] === "string" ? parsed[field as keyof NewBookDraft] : ""]),
      ),
    } as NewBookDraft;
  } catch {
    window.localStorage.removeItem(key);
    return empty;
  }
}

function CreateForm({ mode, onBack }: { mode: "manual" | "ai"; onBack: () => void }) {
  const draftKey = `chapterflow:new-book-draft:${mode}`;
  const savedDraft = readNewBookDraft(draftKey);
  const [title, setTitle] = useState(savedDraft.title);
  const [premise, setPremise] = useState(savedDraft.premise);
  const [genre, setGenre] = useState(savedDraft.genre);
  const [audience, setAudience] = useState(savedDraft.audience);
  const [tone, setTone] = useState(savedDraft.tone);
  const [promise, setPromise] = useState(savedDraft.promise);
  const [pov, setPov] = useState(savedDraft.pov);
  const [endingDirection, setEndingDirection] = useState(savedDraft.endingDirection);
  const [updateCadence, setUpdateCadence] = useState(savedDraft.updateCadence);
  const [targetWordsPerChapter, setTargetWordsPerChapter] = useState(savedDraft.targetWordsPerChapter);
  const [boundaries, setBoundaries] = useState(savedDraft.boundaries);
  const [worldRules, setWorldRules] = useState(savedDraft.worldRules);
  const [arcNotes, setArcNotes] = useState(savedDraft.arcNotes);
  const [draftNotice] = useState(savedDraft.hasValue ? "已恢复上次未提交的档案草稿；提交成功后会自动清理。" : "");
  const navigate = useNavigate();
  const client = useQueryClient();
  const [foundation, setFoundation] = useState<{ projectId: string; runId: string } | null>(null);
  const request = useRef({ key: "", id: "" });
  useEffect(() => {
    window.localStorage.setItem(draftKey, JSON.stringify({ title, premise, genre, audience, tone, promise, pov, endingDirection, updateCadence, targetWordsPerChapter, boundaries, worldRules, arcNotes }));
  }, [arcNotes, audience, boundaries, draftKey, endingDirection, genre, pov, premise, promise, targetWordsPerChapter, title, tone, updateCadence, worldRules]);
  const mutation = useMutation({
    mutationFn: async () => {
      const key = JSON.stringify([
        mode,
        title.trim(),
        premise.trim(),
        genre.trim(),
        audience.trim(),
        tone.trim(),
        promise.trim(),
        pov.trim(),
        endingDirection.trim(),
        updateCadence.trim(),
        targetWordsPerChapter.trim(),
        boundaries,
        worldRules,
        arcNotes,
      ]);
      if (request.current.key !== key)
        request.current = { key, id: crypto.randomUUID() };
      const bookProfile = {
        presetId: null,
        genre: genre.trim() || null,
        audience: audience.trim() || null,
        promise: promise.trim() || null,
        tone: tone.trim() || null,
        endingDirection: endingDirection.trim() || null,
        pov: pov.trim() || null,
        updateCadence: updateCadence.trim() || null,
        targetWordsPerChapter: targetWordsPerChapter.trim()
          ? Number(targetWordsPerChapter)
          : null,
        boundaries: lines(boundaries),
        worldRules: lines(worldRules),
        arcNotes: lines(arcNotes),
      };
      if (mode === "ai") {
        const result = await createProjectWithFoundation({
          requestId: request.current.id,
          title: title.trim(),
          premise: premise.trim() || null,
          language: "zh-CN",
          braindump: premise.trim(),
          bookProfile,
          preferences: {
            genre: genre.trim() || null,
            audience: audience.trim() || null,
            tone: tone.trim() || null,
            targetChapters: 12,
            wordsPerChapter: bookProfile.targetWordsPerChapter ?? 2500,
            volumes: 1,
          },
        });
        return { kind: "foundation" as const, value: result };
      }
      const result = await createProject({
        requestId: request.current.id,
        title: title.trim(),
        premise: premise.trim() || null,
        language: "zh-CN",
        bookProfile,
      });
      return { kind: "project" as const, value: result };
    },
    onSuccess: async (result) => {
      window.localStorage.removeItem(draftKey);
      await client.invalidateQueries({ queryKey: queryKeys.projects });
      if (result.kind === "foundation") {
        setFoundation({ projectId: result.value.project.id, runId: result.value.task.run.id });
        return;
      }
      navigate(`/books/${result.value.id}/dashboard`);
    },
  });
  if (foundation) {
    return (
      <div className="cf-page cf-create">
        <button className="cf-text-link cf-back-button" onClick={onBack}>← 选择其他方式</button>
        <h1>AI 开书结果</h1>
        <p>作品已经建立，先处理候选内容，再开始第一章。</p>
        <FoundationReview
          projectId={foundation.projectId}
          runId={foundation.runId}
          onComplete={() => navigate(`/books/${foundation.projectId}/dashboard`)}
        />
      </div>
    );
  }
  return (
    <div className="cf-page cf-create">
      <button className="cf-text-link cf-back-button" onClick={onBack}>← 选择其他方式</button>
      <h1>开始一个新故事</h1>
      <p>{mode === "ai" ? "告诉我你想写什么，先生成一份可以修改的策划草案。" : "从一个想法，到一部长篇。"}</p>
      {draftNotice ? <p className="cf-notice" role="status">{draftNotice}</p> : null}
      {mode === "manual" ? <div className="cf-create-switch"><Link to="/books/new?mode=ai">✦ AI 帮我开书</Link><Link to="/books/new?mode=import">↥ 导入已有作品</Link></div> : null}
      <form
        className="cf-card"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        <h2>{mode === "ai" ? "AI 帮我开书" : "自己创建"}</h2>
        <p>{mode === "ai" ? "作品会先进入策划任务，确认结果后再继续完善。" : "先给故事起个名字，其他设定都可以慢慢补充。"}</p>
        <label>
          书名
          <input
            required
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="你的故事叫什么名字？"
          />
        </label>
        <div className="cf-form-grid">
          <label>
            题材
            <input value={genre} onChange={(e) => setGenre(e.target.value)} placeholder="例如：都市、玄幻、悬疑" />
          </label>
          <label>
            目标读者
            <input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="例如：喜欢快节奏升级的读者" />
          </label>
          <label>
            叙事风格
            <input value={tone} onChange={(e) => setTone(e.target.value)} placeholder="例如：轻快、热血、反转密集" />
          </label>
          <label>
            叙事视角
            <input value={pov} onChange={(e) => setPov(e.target.value)} placeholder="例如：近距离第三人称" />
          </label>
        </div>
        <label>
          核心承诺
          <textarea rows={2} value={promise} onChange={(e) => setPromise(e.target.value)} placeholder="读者持续追更时，最期待得到什么？" />
        </label>
        <div className="cf-form-grid">
          <label>
            更新节奏
            <input value={updateCadence} onChange={(e) => setUpdateCadence(e.target.value)} placeholder="例如：日更 1 章" />
          </label>
          <label>
            每章目标字数
            <input type="number" min={1} max={100000} value={targetWordsPerChapter} onChange={(e) => setTargetWordsPerChapter(e.target.value)} placeholder="例如：2500" />
          </label>
        </div>
        <label>
          结局方向
          <textarea rows={2} value={endingDirection} onChange={(e) => setEndingDirection(e.target.value)} placeholder="你希望故事最终走向哪里？" />
        </label>
        <div className="cf-form-grid">
          <label>
            创作边界（每行一项）
            <textarea rows={3} value={boundaries} onChange={(e) => setBoundaries(e.target.value)} placeholder="不使用的主题、表达或情节" />
          </label>
          <label>
            世界规则（每行一项）
            <textarea rows={3} value={worldRules} onChange={(e) => setWorldRules(e.target.value)} placeholder="力量、社会或世界运行规则" />
          </label>
          <label>
            长线弧光（每行一项）
            <textarea rows={3} value={arcNotes} onChange={(e) => setArcNotes(e.target.value)} placeholder="主线、人物成长或卷章规划" />
          </label>
        </div>
        <label>
          一句话简介
          <textarea
            rows={4}
            value={premise}
            onChange={(e) => setPremise(e.target.value)}
            placeholder="谁，遇到了什么，又将去往哪里？"
          />
        </label>
        {mutation.isError ? <ErrorNote error={mutation.error} /> : null}
        <button
          className="cf-primary"
          disabled={!title.trim() || mutation.isPending}
        >
          {mutation.isPending ? "正在创建…" : "创建作品"}
          <ArrowRight size={17} />
        </button>
      </form>
    </div>
  );
}

function lines(value: string): string[] {
  return value
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

type ImportDuplicate = {
  batchId: string;
  status: ImportBatchDetail["batch"]["status"];
  targetProjectId: string | null;
  appliedProjectId: string | null;
  createdAt: string;
};

function readImportDuplicate(metadata: Record<string, unknown>): ImportDuplicate | null {
  const value = metadata.duplicate;
  if (!value || typeof value !== "object") return null;
  const duplicate = value as Record<string, unknown>;
  if (
    typeof duplicate.batchId !== "string" ||
    typeof duplicate.status !== "string" ||
    typeof duplicate.createdAt !== "string"
  ) return null;
  const statuses: ImportDuplicate["status"][] = ["previewed", "analyzing", "ready", "applied", "discarded"];
  if (!statuses.includes(duplicate.status as ImportDuplicate["status"])) return null;
  return {
    batchId: duplicate.batchId,
    status: duplicate.status as ImportDuplicate["status"],
    targetProjectId: typeof duplicate.targetProjectId === "string" ? duplicate.targetProjectId : null,
    appliedProjectId: typeof duplicate.appliedProjectId === "string" ? duplicate.appliedProjectId : null,
    createdAt: duplicate.createdAt,
  };
}

function duplicateStatusLabel(status: ImportDuplicate["status"]): string {
  return status === "previewed"
    ? "待分析"
    : status === "analyzing"
      ? "分析中"
      : status === "ready"
        ? "待确认"
        : status === "applied"
          ? "已应用"
          : "已放弃";
}

function ImportCreateFlow({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate();
  const [detail, setDetail] = useState<ImportBatchDetail | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState({ received: 0, total: 0 });
  const [title, setTitle] = useState("");
  const [analysisRun, setAnalysisRun] = useState<RunDetail | null>(null);
  const [resetting, setResetting] = useState(false);
  const [duplicate, setDuplicate] = useState<ImportDuplicate | null>(null);
  const draftProjectRef = useRef<Project | null>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const recoveryKey = "chapterflow:import:last-batch";

  const rememberDraftProject = (project: Project | null) => {
    draftProjectRef.current = project;
  };
  const clearRecovery = () => window.localStorage.removeItem(recoveryKey);
  const resetLocalState = () => {
    setDetail(null);
    setSelected([]);
    setAnalysisRun(null);
    setProgress({ received: 0, total: 0 });
    setNotice(null);
    setDuplicate(null);
  };
  const cleanupDraftProject = async () => {
    const project = draftProjectRef.current;
    if (!project) return;
    try {
      const archived = project.archivedAt
        ? project
        : await updateProject(project.id, {
            title: project.title,
            subtitle: project.subtitle,
            premise: project.premise,
            language: project.language,
            archived: true,
            expectedUpdatedAt: project.updatedAt,
          });
      const recycled = await deleteProject(archived);
      // A cancelled or failed import must not leave a half-created work in
      // the user's recycle bin. The normal delete flow stays recoverable;
      // this temporary context is explicitly safe to purge after the server
      // acknowledges its deletion token.
      await purgeRecycledProject(recycled);
      clearRecovery();
      rememberDraftProject(null);
    } catch (reason) {
      throw new Error(
        `导入已经停止，但临时作品未能清理：${reason instanceof Error ? reason.message : "请稍后从回收站处理"}`,
        { cause: reason },
      );
    }
  };

  useEffect(() => {
    const saved = window.localStorage.getItem(recoveryKey);
    if (!saved) return;
    let recovery: {
      batchId: string;
      title?: string;
      draftProject?: Project;
    };
    try {
      recovery = JSON.parse(saved) as typeof recovery;
    } catch {
      recovery = { batchId: saved };
    }
    if (!recovery.batchId) return;
    if (recovery.draftProject?.id) rememberDraftProject(recovery.draftProject);
    if (recovery.batchId === "pending-upload") {
      return;
    }
    void getStoryImport(recovery.batchId)
      .then((value) => {
        if (value.batch.status === "applied") {
          clearRecovery();
          rememberDraftProject(null);
          return;
        }
        setDetail(value);
        setDuplicate(readImportDuplicate(value.batch.metadata));
        setTitle(recovery.title ?? String(value.batch.metadata.title ?? ""));
        setSelected(
          value.candidates
            .filter((candidate) => candidate.status !== "discarded")
            .map((candidate) => candidate.id),
        );
      })
      .catch(() => {
        clearRecovery();
        rememberDraftProject(null);
      });
  }, []);

  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (file.size <= 0 || file.size > 50 * 1024 * 1024)
        throw new Error("导入文件必须大于 0 且不超过 50 MB。");
      const format = importFormatFor(file.name);
      let project = draftProjectRef.current;
      if (format !== "narrative-bundle" && !project) {
        project = await createProject({
          requestId: crypto.randomUUID(),
          title:
            title.trim() || file.name.replace(/\.[^.]+$/u, "") || "未命名作品",
          premise: null,
        });
        rememberDraftProject(project);
        window.localStorage.setItem(
          recoveryKey,
          JSON.stringify({
            batchId: "pending-upload",
            title: project.title,
            draftProject: project,
          }),
        );
      }
      setProgress({ received: 0, total: file.size });
      const controller = new AbortController();
      uploadAbortRef.current = controller;
      try {
        return await uploadStoryFile(
          file,
          format === "narrative-bundle" ? null : project?.id ?? null,
          format,
          (receivedBytes, totalBytes) =>
            setProgress({ received: receivedBytes, total: totalBytes }),
          controller.signal,
        );
      } finally {
        if (uploadAbortRef.current === controller) uploadAbortRef.current = null;
      }
    },
    onSuccess: (value) => {
      setDetail(value);
      setDuplicate(readImportDuplicate(value.batch.metadata));
      setSelected(
        value.candidates
          .filter((candidate) => candidate.status !== "discarded")
          .map((candidate) => candidate.id),
      );
      setAnalysisRun(null);
      setError(null);
      setNotice(null);
      window.localStorage.setItem(
        recoveryKey,
        JSON.stringify({
          batchId: value.batch.id,
          title: title.trim() || value.batch.metadata.title,
          ...(draftProjectRef.current
            ? { draftProject: draftProjectRef.current }
            : {}),
        }),
      );
    },
    onError: (reason) => {
      void (async () => {
        try {
          await cleanupDraftProject();
          if (reason instanceof DOMException && reason.name === "AbortError") {
            setNotice("上传已取消，临时作品已经清理。");
            setError(null);
          } else {
            setError(reason);
          }
        } catch (cleanupError) {
          setError(cleanupError);
        }
      })();
    },
  });

  const analysis = useMutation({
    mutationFn: () => {
      if (!detail?.batch.targetProjectId)
        throw new Error("导入批次还没有可用的作品上下文，请重新选择文件。");
      return analyzeStoryImport(detail.batch.id, crypto.randomUUID(), {
        qualityPreset: "standard",
      });
    },
    onSuccess: (value) => {
      setAnalysisRun(null);
      setDetail((current) =>
        current
          ? {
              ...current,
              batch: {
                ...current.batch,
                status: "analyzing",
                analysisRunId: value.run.id,
              },
            }
          : current,
      );
      setError(null);
    },
    onError: setError,
  });

  const cancelAnalysis = useMutation({
    mutationFn: () => {
      if (!detail?.batch.targetProjectId || !detail.batch.analysisRunId)
        throw new Error("当前没有可停止的分析任务。");
      return controlRun(detail.batch.targetProjectId, detail.batch.analysisRunId, {
        action: "cancel",
      });
    },
    onSuccess: () => {
      setNotice("分析已请求停止，正在保存取消状态…");
    },
    onError: setError,
  });

  const analysisBatchId = detail?.batch.id;
  const analysisProjectId = detail?.batch.targetProjectId;
  const analysisRunId = detail?.batch.analysisRunId;
  const analysisBatchStatus = detail?.batch.status;
  useEffect(() => {
    if (
      !analysisBatchId ||
      !analysisProjectId ||
      !analysisRunId ||
      analysisBatchStatus !== "analyzing"
    )
      return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const next = await getRunDetail(analysisProjectId, analysisRunId);
        if (stopped) return;
        setAnalysisRun(next);
        if (["completed", "failed", "cancelled"].includes(next.run.status)) {
          if (next.run.status === "completed") {
            const refreshed = await getStoryImport(analysisBatchId);
            if (stopped) return;
            setDetail(refreshed);
            setSelected(
              refreshed.candidates
                .filter((candidate) => candidate.status !== "discarded")
                .map((candidate) => candidate.id),
            );
          }
          return;
        }
        timer = setTimeout(() => void poll(), 1_500);
      } catch (reason) {
        if (!stopped) setError(reason);
      }
    };
    void poll();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [analysisBatchId, analysisProjectId, analysisRunId, analysisBatchStatus]);

  const apply = useMutation({
    mutationFn: () => applyStoryImport(detail!.batch.id, selected),
    onSuccess: ({ projectId }) => {
      clearRecovery();
      rememberDraftProject(null);
      navigate(`/books/${projectId}/dashboard`);
    },
    onError: setError,
  });
  const resetImport = async () => {
    if (!detail || resetting) return;
    setResetting(true);
    setError(null);
    try {
      if (!terminal) await discardStoryImport(detail.batch.id);
      await cleanupDraftProject();
      clearRecovery();
      resetLocalState();
    } catch (reason) {
      setError(reason);
    } finally {
      setResetting(false);
    }
  };
  const terminal =
    detail?.batch.status === "applied" || detail?.batch.status === "discarded";
  const analysisFailed = Boolean(
    analysisRun && ["failed", "cancelled"].includes(analysisRun.run.status),
  );
  const detectedEncoding =
    typeof detail?.batch.metadata.sourceEncoding === "string"
      ? detail.batch.metadata.sourceEncoding
      : null;
  const duplicateProjectId = duplicate?.targetProjectId ?? duplicate?.appliedProjectId ?? null;

  return (
    <div className="cf-page cf-create">
      <button className="cf-text-link cf-back-button" onClick={onBack}>
        ← 选择其他方式
      </button>
      <h1>导入已有作品</h1>
      <p>
        先建立可恢复的作品上下文，再上传、分析和确认导入。刷新页面会恢复最近一次批次，分析失败也可以从这里重试。
      </p>
      {notice ? <p className="cf-notice" role="status">{notice}</p> : null}
      {error ? <ErrorNote error={error} /> : null}
      {!detail ? (
        <section className="cf-card cf-import-drop">
          <label>
            作品名称
            <input
              aria-label="导入作品名称"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="默认使用文件名"
              maxLength={200}
            />
          </label>
          <input
            type="file"
            accept=".md,.markdown,.txt,.text,.docx,.html,.htm,.epub,.json"
            aria-label="选择作品文件"
            disabled={upload.isPending || resetting}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.currentTarget.value = "";
              if (file) {
                if (!title.trim())
                  setTitle(file.name.replace(/\.[^.]+$/u, ""));
                upload.mutate(file);
              }
            }}
          />
          {upload.isPending ? (
            <>
              <p role="status">正在建立作品并上传文件…</p>
              <progress
                max={progress.total || 1}
                value={progress.received}
              />
              <small>
                {progress.total
                  ? `${Math.round((progress.received / progress.total) * 100)}% · ${(progress.received / 1024 / 1024).toFixed(1)} / ${(progress.total / 1024 / 1024).toFixed(1)} MB`
                  : "准备中"}
              </small>
              <button
                type="button"
                className="cf-button"
                onClick={() => uploadAbortRef.current?.abort()}
              >
                取消上传
              </button>
            </>
          ) : (
            <>
              <h2>选择一份作品文件</h2>
              <p>
                支持 Markdown、TXT、DOCX、HTML、EPUB 和文织备份，单个文件不超过 50 MB。
              </p>
            </>
          )}
        </section>
      ) : (
        <section className="cf-card cf-import-preview">
          <div className="cf-section-title">
            <div>
              <h2>{detail.batch.filename}</h2>
              <p>
                {detail.candidates.length} 项当前候选 · {detail.batch.sourceCharacters.toLocaleString()} 字符 · 来源校验 {detail.batch.sourceHash.slice(0, 10)}
                {detectedEncoding ? ` · 编码 ${detectedEncoding}` : ""}
              </p>
            </div>
            <span className="cf-badge">
              {detail.batch.status === "previewed"
                ? "待分析"
                : detail.batch.status === "analyzing"
                  ? "分析中"
                  : detail.batch.status === "ready"
                    ? "待确认"
                    : detail.batch.status}
            </span>
          </div>
          {duplicate ? (
            <div className="cf-import-duplicate" role="alert">
              <strong>检测到相同文件的导入批次</strong>
              <p>
                已有批次于 {new Date(duplicate.createdAt).toLocaleString("zh-CN")} 创建，状态为“{duplicateStatusLabel(duplicate.status)}”。请选择如何处理这次导入。
              </p>
              <div className="cf-actions">
                {duplicateProjectId ? (
                  <button
                    type="button"
                    className="cf-button"
                    onClick={() => navigate(`/books/${encodeURIComponent(duplicateProjectId)}/advanced?tool=assets&batch=${encodeURIComponent(duplicate.batchId)}`)}
                  >
                    打开已有批次
                  </button>
                ) : null}
                <button type="button" className="cf-button" onClick={() => setDuplicate(null)}>
                  继续创建副本
                </button>
                <button type="button" className="cf-text-danger" onClick={() => void resetImport()}>
                  取消本次导入
                </button>
              </div>
            </div>
          ) : null}
          {detectedEncoding === "utf-8-replacement" ? (
            <p role="alert">
              这份文件包含无法确认的文字编码，系统保留了替换字符；请检查正文后再确认导入。
            </p>
          ) : null}
          {detail.batch.status === "previewed" || analysisFailed ? (
            <div className="cf-import-analysis-actions">
              <button
                className="cf-button"
                disabled={analysis.isPending || terminal || detail.batch.format === "narrative-bundle"}
                onClick={() => analysis.mutate()}
              >
                {analysis.isPending
                  ? "正在提交分析…"
                  : analysisFailed
                    ? "重试 AI 分析"
                    : "开始 AI 分析"}
              </button>
              {detail.batch.format === "narrative-bundle" ? (
                <small>文织备份已经包含结构化设定，不需要重复分析。</small>
              ) : (
                <small>分析会生成可逐项选择的人物、设定、关系、时间线和伏笔候选。</small>
              )}
              {detail.batch.targetProjectId && detail.batch.analysisRunId ? (
                <Link
                  to={`/books/${detail.batch.targetProjectId}/tasks/${detail.batch.analysisRunId}?returnTo=${encodeURIComponent("/books/new?mode=import")}`}
                >
                  查看分析任务
                </Link>
              ) : null}
            </div>
          ) : null}
          {detail.batch.status === "analyzing" && !analysisFailed ? (
            <div className="cf-import-analysis-running">
              <p role="status">
                AI 正在分析这份作品，离开页面后回来会继续恢复。
                {detail.batch.targetProjectId && detail.batch.analysisRunId ? (
                  <Link
                    to={`/books/${detail.batch.targetProjectId}/tasks/${detail.batch.analysisRunId}?returnTo=${encodeURIComponent("/books/new?mode=import")}`}
                  >
                    查看任务详情
                  </Link>
                ) : null}
              </p>
              <button
                type="button"
                className="cf-button"
                disabled={cancelAnalysis.isPending || terminal}
                onClick={() => cancelAnalysis.mutate()}
              >
                {cancelAnalysis.isPending ? "正在停止分析…" : "停止分析"}
              </button>
            </div>
          ) : null}
          {analysisFailed ? (
            <p role="alert">
              分析任务{analysisRun?.run.status === "cancelled" ? "已取消" : "失败"}，候选尚未更新；可以重试，或打开任务查看失败原因。
            </p>
          ) : null}
          <div className="cf-import-candidates">
            {detail.candidates.map((candidate) => (
              <label key={candidate.id}>
                <input
                  type="checkbox"
                  disabled={terminal || detail.batch.status === "analyzing"}
                  checked={selected.includes(candidate.id)}
                  onChange={() =>
                    setSelected((current) =>
                      current.includes(candidate.id)
                        ? current.filter((id) => id !== candidate.id)
                        : [...current, candidate.id],
                    )
                  }
                />
                <span>{candidate.title}</span>
                <small>{candidate.kind}</small>
              </label>
            ))}
          </div>
          <div className="cf-actions">
            <button
              className="cf-button"
              disabled={apply.isPending || analysis.isPending || resetting || terminal}
              onClick={() => void resetImport()}
            >
              {resetting ? "正在清理…" : "重新选择"}
            </button>
            <button
              className="cf-primary"
              disabled={apply.isPending || !selected.length || terminal || detail.batch.status === "analyzing"}
              onClick={() => apply.mutate()}
            >
              {apply.isPending ? "正在导入…" : `确认导入（${selected.length}）`}
            </button>
            <button
              className="cf-button"
              disabled={apply.isPending || analysis.isPending || resetting || terminal}
              onClick={() => void resetImport()}
            >
              放弃本次导入
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function importFormatFor(filename: string): ImportFormat {
  const extension = filename.split(".").pop()?.toLowerCase();
  if (extension === "txt" || extension === "text") return "text";
  if (extension === "docx") return "docx";
  if (extension === "html" || extension === "htm") return "html";
  if (extension === "epub") return "epub";
  if (extension === "json") return "narrative-bundle";
  return "markdown";
}
