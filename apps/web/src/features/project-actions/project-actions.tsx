import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal } from "lucide-react";
import {
  updateProject,
  duplicateProject,
  deleteProject,
} from "../../shared/api/projects";
import { getProjectExport } from "../../shared/api/delivery";
import { queryKeys } from "../../shared/query/keys";
import { Drawer } from "../../shared/ui/drawer";
import { ErrorNote, ConfirmDialog } from "../../shared/ui";
import type { Project } from "../../shared/api/types";
import type { ProjectLanguage } from "@narralume/contracts";
import { ApiError } from "../../shared/api/client";
export function ProjectActions({ project: p }: { project: Project }) {
  const [mode, setMode] = useState<"edit" | "delete" | null>(null);
  const [title, setTitle] = useState(p.title);
  const [subtitle, setSubtitle] = useState(p.subtitle ?? "");
  const [premise, setPremise] = useState(p.premise ?? "");
  const [language, setLanguage] = useState<ProjectLanguage>(p.language);
  const client = useQueryClient();
  const action = useMutation({
    mutationFn: async (
      kind: "save" | "archive" | "duplicate" | "export" | "delete",
    ) => {
      if (kind === "delete") return deleteProject(p);
      if (kind === "duplicate")
        return duplicateProject(p.id, `${p.title}（副本）`);
      if (kind === "export") {
        const file = await getProjectExport(p.id, "markdown");
        const url = URL.createObjectURL(file.blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = file.filename;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        return;
      }
      return updateProject(p.id, {
        title: kind === "save" ? title.trim() : p.title,
        subtitle: kind === "save" ? subtitle.trim() || null : p.subtitle,
        premise: kind === "save" ? premise.trim() || null : p.premise,
        language: kind === "save" ? language : p.language,
        archived: kind === "archive" ? !p.archivedAt : Boolean(p.archivedAt),
        expectedUpdatedAt: p.updatedAt,
      });
    },
    onSuccess: async () => {
      setMode(null);
      await client.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
  return (
    <div className="cf-book-menu">
      <details>
        <summary aria-label={`更多：${p.title}`}>
          <MoreHorizontal size={19} />
        </summary>
        <div>
          <button
            onClick={() => {
              setTitle(p.title);
              setSubtitle(p.subtitle ?? "");
              setPremise(p.premise ?? "");
              setLanguage(p.language);
              setMode("edit");
            }}
          >
            作品设置
          </button>
          <button
            disabled={action.isPending}
            onClick={() => action.mutate("duplicate")}
          >
            复制作品
          </button>
          <button
            disabled={action.isPending}
            onClick={() => action.mutate("export")}
          >
            导出作品
          </button>
          <button
            disabled={action.isPending}
            onClick={() => action.mutate("archive")}
          >
            {p.archivedAt ? "取消归档" : "归档作品"}
          </button>
          <button onClick={() => setMode("delete")}>移至回收站</button>
        </div>
      </details>
      {action.isError ? <ErrorNote error={action.error} /> : null}
      {action.isError && isProjectConflict(action.error) ? (
        <button
          type="button"
          className="cf-button"
          onClick={() => {
            setMode(null);
            void client.invalidateQueries({ queryKey: queryKeys.projects });
          }}
        >
          重新读取作品资料
        </button>
      ) : null}
      {mode === "edit" ? (
        <Drawer title="作品设置" onClose={() => setMode(null)}>
          <form
            className="cf-form"
            onSubmit={(e) => {
              e.preventDefault();
              action.mutate("save");
            }}
          >
            <label>
              书名
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
              />
            </label>
            <label>
              副题
              <input
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                maxLength={300}
                placeholder="可选的副标题"
              />
            </label>
            <label>
              一句话简介
              <textarea
                rows={5}
                value={premise}
                onChange={(e) => setPremise(e.target.value)}
              />
            </label>
            <label>
              创作语言
              <select
                value={language}
                onChange={(event) => setLanguage(event.target.value as ProjectLanguage)}
              >
                <option value="zh-CN">简体中文</option>
                <option value="en">English</option>
              </select>
            </label>
            <button
              className="cf-primary"
              disabled={action.isPending || !title.trim()}
            >
              保存作品设置
            </button>
            {action.isError ? <ErrorNote error={action.error} /> : null}
          </form>
        </Drawer>
      ) : null}
      {mode === "delete" ? (
        <ConfirmDialog
          title="将作品移至回收站？"
          confirmLabel="移至回收站"
          pending={action.isPending}
          onCancel={() => setMode(null)}
          onConfirm={() => action.mutate("delete")}
        >
          <p>
            《{p.title}
            》将从作品列表移除。你可以在作品库的回收站中恢复它。
          </p>
        </ConfirmDialog>
      ) : null}
    </div>
  );
}

function isProjectConflict(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 409 || error.code === "project.version.conflict");
}
