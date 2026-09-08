import { ProjectActions } from "../../features/project-actions/project-actions";
import { useQuery } from "@tanstack/react-query";
import { getProjectsIncludingArchived } from "../../shared/api/projects";
import { useState, useRef } from "react";
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
import { createProject } from "../../shared/api/projects";
import { queryKeys } from "../../shared/query/keys";
import { BookCover, bookStatus } from "../../shared/ui/book-cover";
import { ErrorNote } from "../../shared/ui";
import type { Project } from "../../shared/api/types";
export function LibraryPage() {
  const query = useProjects();
  const [params] = useSearchParams();
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("recent");
  const archived = params.get("archived") === "1";
  const all = useQuery({
    queryKey: ["projects", "archived"],
    queryFn: ({ signal }) => getProjectsIncludingArchived(signal),
    enabled: archived,
  });
  const books = archived
    ? (all.data ?? []).filter((p) => p.archivedAt)
    : (query.data ?? []);
  const search = params.get("q") ?? "";
  const shown = books
    .filter(
      (p) =>
        (!status || bookStatus(p.phase) === status) &&
        `${p.title} ${p.premise ?? ""}`.includes(search),
    )
    .sort((a, b) =>
      sort === "title"
        ? a.title.localeCompare(b.title, "zh-CN")
        : b.updatedAt.localeCompare(a.updatedAt),
    );
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
          {books.length > 0 ? (
            <>
              <h2>最近创作</h2>
              <div className="cf-recent-grid">
                {[...books]
                  .sort((a, b) =>
                    (b.lastWritingAt ?? b.updatedAt).localeCompare(
                      a.lastWritingAt ?? a.updatedAt,
                    ),
                  )
                  .slice(0, 2)
                  .map((p) => (
                    <BookCard key={p.id} project={p} featured />
                  ))}
              </div>
            </>
          ) : null}
          <div className="cf-section-title">
            <h2>
              {archived ? "归档作品" : "全部作品"}{" "}
              <span>（{shown.length}）</span>
            </h2>
            <div className="cf-actions">
              <Link
                className="cf-text-link"
                to={archived ? "/books" : "/books?archived=1"}
              >
                {archived ? "返回作品" : "查看归档"}
              </Link>
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
            {shown.map((p) => (
              <BookCard key={p.id} project={p} />
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
}: {
  project: Project;
  featured?: boolean;
}) {
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
  const [title, setTitle] = useState("");
  const [premise, setPremise] = useState("");
  const navigate = useNavigate();
  const client = useQueryClient();
  const request = useRef({ key: "", id: "" });
  const mutation = useMutation({
    mutationFn: () => {
      const key = JSON.stringify([title.trim(), premise.trim()]);
      if (request.current.key !== key)
        request.current = { key, id: crypto.randomUUID() };
      return createProject({
        requestId: request.current.id,
        title: title.trim(),
        premise: premise.trim() || null,
        language: "zh-CN",
      });
    },
    onSuccess: async (p) => {
      await client.invalidateQueries({ queryKey: queryKeys.projects });
      navigate(`/books/${p.id}/dashboard`);
    },
  });
  return (
    <div className="cf-page cf-create">
      <Link className="cf-text-link" to="/books">
        ← 我的作品
      </Link>
      <h1>开始一个新故事</h1>
      <p>从一个想法，到一部长篇。</p>
      <form
        className="cf-card"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        <h2>自己创建</h2>
        <p>先给故事起个名字，其他设定都可以慢慢补充。</p>
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
      <p>
        已有作品？
        <Link className="cf-text-link" to="/shelf">
          前往作品导入
        </Link>{" "}
        ·{" "}
        <Link className="cf-text-link" to="/shelf">
          使用已有 AI 开书工具
        </Link>
      </p>
    </div>
  );
}
