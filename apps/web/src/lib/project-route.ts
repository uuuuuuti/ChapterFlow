import { useParams } from "react-router";

/** 项目工作区只从 URL 读取作用域，避免刷新、深链和多标签页串项目。 */
export function useProjectId(): string | null {
  const { projectId } = useParams<{ projectId: string }>();
  return projectId ?? null;
}

/**
 * The default project link is deliberately native.  A surprisingly large
 * portion of the old workspaces still imports this helper, so keeping the
 * legacy path here would make ordinary buttons leak back into NarraLume even
 * after the ChapterFlow shell has taken over.
 */
export function projectWorkspacePath(projectId: string, workspace: string): string {
  const id = encodeURIComponent(projectId);
  switch (workspace) {
    case "overview":
      return `/books/${id}/dashboard`;
    case "bible":
      return `/books/${id}/outline`;
    case "studio":
      return `/books/${id}/write`;
    case "delivery":
      return `/books/${id}/publish`;
    case "autopilot":
      return `/books/${id}/quick-create`;
    case "runs":
      return `/books/${id}/tasks`;
    case "lab":
      return `/books/${id}/advanced`;
    default:
      return `/books/${id}/${workspace}`;
  }
}

/**
 * Compatibility-only link builder.  It is intentionally named so a new
 * product surface cannot accidentally use a legacy URL.  Existing NarraLume
 * workspace tests and bookmarked compatibility pages may keep using it until
 * their UI is removed from the runtime bundle.
 */
export function legacyProjectWorkspacePath(projectId: string, workspace: string): string {
  return `/projects/${encodeURIComponent(projectId)}/${workspace}`;
}

/**
 * ChapterFlow 的项目内入口。旧工作区仍然需要保留给兼容测试和书签，
 * 但新壳层产生的任务、助手和恢复链接必须落到文织自己的信息架构。
 */
export function chapterFlowProjectPath(
  projectId: string,
  workspace:
    | "overview"
    | "bible"
    | "studio"
    | "delivery"
    | "autopilot"
    | "runs"
    | "lab",
): string {
  const id = encodeURIComponent(projectId);
  switch (workspace) {
    case "overview":
      return `/books/${id}/dashboard`;
    case "bible":
      return `/books/${id}/outline`;
    case "studio":
      return `/books/${id}/write`;
    case "delivery":
      return `/books/${id}/publish`;
    case "lab":
      return `/books/${id}/advanced`;
    case "autopilot":
      return `/books/${id}/quick-create`;
    case "runs":
      return `/books/${id}/tasks`;
  }
}
