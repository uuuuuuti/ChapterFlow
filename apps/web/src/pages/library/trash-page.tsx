import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import { ArchiveRestore, BookOpen, Trash2 } from "lucide-react";
import {
  getRecycledProjects,
  purgeRecycledProject,
  restoreRecycledProject,
} from "../../shared/api/projects";
import { queryKeys } from "../../shared/query/keys";
import { ErrorNote, ConfirmDialog } from "../../shared/ui";
import type { RecycledProject } from "../../shared/api/types";
import { useState } from "react";
import { ApiError } from "../../shared/api/client";

export function TrashPage() {
  const client = useQueryClient();
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: queryKeys.recycleBin,
    queryFn: ({ signal }) => getRecycledProjects(signal),
  });
  const [purgeTarget, setPurgeTarget] = useState<RecycledProject | null>(null);
  const [purgeConfirmation, setPurgeConfirmation] = useState("");
  const restore = useMutation({
    mutationFn: (project: RecycledProject) => restoreRecycledProject(project),
    onSuccess: async (project) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.recycleBin }),
        client.invalidateQueries({ queryKey: queryKeys.projects }),
      ]);
      navigate(`/books/${encodeURIComponent(project.id)}/dashboard`);
    },
  });
  const purge = useMutation({
    mutationFn: (project: RecycledProject) => purgeRecycledProject(project),
    onSuccess: async () => {
      setPurgeTarget(null);
      setPurgeConfirmation("");
      await client.invalidateQueries({ queryKey: queryKeys.recycleBin });
    },
  });
  const recycleStateStale = isRecycleStateStale(restore.error) || isRecycleStateStale(purge.error);
  const refreshRecycleBin = () => {
    setPurgeTarget(null);
    setPurgeConfirmation("");
    restore.reset();
    purge.reset();
    void query.refetch();
  };

  return (
    <div className="cf-page">
      <div className="cf-page-title">
        <div>
          <Link className="cf-text-link" to="/books">
            ← 我的作品
          </Link>
          <h1>回收站</h1>
          <p>移入回收站的作品会保留一段时间，可恢复后继续创作。</p>
        </div>
      </div>
      {query.isError ? <ErrorNote error={query.error} /> : null}
      {recycleStateStale ? (
        <section className="cf-inline-warning" role="alert">
          <div>
            <strong>回收站内容已在其他页面变化</strong>
            <p>当前恢复或删除令牌已经过期，先重新读取回收站再决定下一步。</p>
          </div>
          <button type="button" className="cf-button" disabled={query.isFetching} onClick={refreshRecycleBin}>
            {query.isFetching ? "正在读取…" : "重新读取回收站"}
          </button>
        </section>
      ) : null}
      {restore.isError && !recycleStateStale ? <ErrorNote error={restore.error} /> : null}
      {purge.isError && !recycleStateStale ? <ErrorNote error={purge.error} /> : null}
      {query.isPending ? <p role="status">正在读取回收站…</p> : null}
      {!query.isPending && query.data?.length === 0 ? (
        <section className="cf-card cf-empty">
          <Trash2 size={42} />
          <h2>回收站是空的</h2>
          <p>暂时没有需要恢复的作品。</p>
        </section>
      ) : null}
      <div className="cf-book-grid">
        {query.data?.map((project) => (
          <TrashCard
            key={project.id}
            project={project}
            restoring={restore.isPending}
            onRestore={() => restore.mutate(project)}
            onPurge={() => {
              setPurgeConfirmation("");
              setPurgeTarget(project);
            }}
          />
        ))}
      </div>
      {purgeTarget ? (
        <ConfirmDialog
          title="彻底删除作品？"
          confirmLabel="彻底删除"
          danger
          pending={purge.isPending}
          confirmDisabled={purgeConfirmation.trim() !== purgeTarget.title}
          onCancel={() => setPurgeTarget(null)}
          onConfirm={() => purge.mutate(purgeTarget)}
        >
          <p>《{purgeTarget.title}》及其中的正文、版本和设定将无法恢复。</p>
          <label>
            输入作品名确认
            <input
              aria-label="永久删除作品名确认"
              value={purgeConfirmation}
              onChange={(event) => setPurgeConfirmation(event.target.value)}
              placeholder={purgeTarget.title}
            />
          </label>
        </ConfirmDialog>
      ) : null}
    </div>
  );
}

function isRecycleStateStale(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  return (
    error.status === 409 ||
    error.code === "deleted_project.not_found" ||
    error.code === "project.recycle.not_found" ||
    error.code === "project.purge.token_mismatch"
  );
}

function TrashCard({
  project,
  restoring,
  onRestore,
  onPurge,
}: {
  project: RecycledProject;
  restoring: boolean;
  onRestore: () => void;
  onPurge: () => void;
}) {
  return (
    <article className="cf-card cf-book">
      <div className="cf-book-cover cf-book-cover-placeholder" aria-hidden="true">
        <BookOpen size={34} />
      </div>
      <div className="cf-book-info">
        <h3>{project.title}</h3>
        <p className="cf-clamp">{project.premise || "没有简介"}</p>
        <small>删除于 {new Date(project.deletedAt).toLocaleDateString("zh-CN")}</small>
        <div className="cf-actions">
          <button className="cf-primary" disabled={restoring} onClick={onRestore}>
            <ArchiveRestore size={15} />
            {restoring ? "正在恢复…" : "恢复作品"}
          </button>
          <button className="cf-button" onClick={onPurge}>
            彻底删除
          </button>
        </div>
      </div>
    </article>
  );
}
