import { type Project, type RecycledProject } from "./types";
import { requestJson, jsonRequest, requestBlob, requestVoid } from "./client";
import {
  type ProjectLanguage,
  type ProjectCoverMutation,
} from "@narralume/contracts";
import { readDriverOverride, currentDriverMode } from "../../kernel/transport";

export async function getProjects(signal?: AbortSignal): Promise<Project[]> {
  return getAllProjectPages(false, signal);
}

export async function getProjectsIncludingArchived(
  signal?: AbortSignal,
): Promise<Project[]> {
  return getAllProjectPages(true, signal);
}

export async function getAllProjectPages(
  includeArchived: boolean,
  signal?: AbortSignal,
): Promise<Project[]> {
  const pageSize = 100;
  const projects: Project[] = [];
  let offset = 0;
  while (true) {
    const params = new URLSearchParams();
    if (includeArchived) params.set("includeArchived", "true");
    if (offset > 0) params.set("offset", String(offset));
    const query = params.toString();
    const page = await requestJson<Project[]>(
      `/api/projects${query ? `?${query}` : ""}`,
      signal ? { signal } : {},
    );
    projects.push(...page);
    if (page.length < pageSize) return projects;
    offset += page.length;
  }
}

export async function createProject(input: {
  requestId: string;
  title: string;
  premise: string | null;
  language?: ProjectLanguage;
}): Promise<Project> {
  return requestJson<Project>("/api/projects", jsonRequest("POST", input));
}

export async function updateProject(
  projectId: string,
  input: {
    title: string;
    subtitle: string | null;
    premise: string | null;
    language?: ProjectLanguage;
    archived: boolean;
    expectedUpdatedAt: string;
    cover?: ProjectCoverMutation;
  },
): Promise<Project> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}`,
    jsonRequest("PUT", input),
  );
}

export function projectCoverUrl(
  project: Pick<Project, "id" | "cover">,
): string | null {
  if (!project.cover) return null;
  if (readDriverOverride() === "local" || currentDriverMode() === "local") {
    // local 模式封面无 HTTP URL——封面经 projectCoverBlob() 取 bytes 后
    // 由调用方渲染；此处返回 null 让调用方走默认占位或已缓存的 blob。
    return localCoverCache.get(coverCacheKey(project)) ?? null;
  }
  return `/api/projects/${encodeURIComponent(project.id)}/cover?v=${encodeURIComponent(project.cover.updatedAt)}`;
}

const localCoverCache = new Map<string, string>();

export function coverCacheKey(project: Pick<Project, "id" | "cover">): string {
  return `${project.id}:${project.cover?.updatedAt ?? ""}`;
}

export async function projectCoverBlob(
  project: Pick<Project, "id" | "cover">,
): Promise<string | null> {
  if (!project.cover) return null;
  const key = coverCacheKey(project);
  const cached = localCoverCache.get(key);
  if (cached) return cached;
  const { blob } = await requestBlob(
    `/api/projects/${encodeURIComponent(project.id)}/cover`,
  );
  const url = URL.createObjectURL(blob);
  // 回收旧版本的 Blob URL，避免刷新封面后累积泄漏。
  for (const [existingKey, existingUrl] of localCoverCache) {
    if (existingKey.startsWith(`${project.id}:`) && existingKey !== key) {
      URL.revokeObjectURL(existingUrl);
      localCoverCache.delete(existingKey);
    }
  }
  localCoverCache.set(key, url);
  return url;
}

export async function duplicateProject(
  projectId: string,
  title?: string,
): Promise<Project> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/duplicate`,
    jsonRequest("POST", title ? { title } : {}),
  );
}

export async function deleteProject(
  project: Pick<Project, "id" | "title" | "updatedAt">,
): Promise<RecycledProject> {
  return requestJson(
    `/api/projects/${encodeURIComponent(project.id)}`,
    jsonRequest("DELETE", {
      confirmationTitle: project.title,
      expectedUpdatedAt: project.updatedAt,
    }),
  );
}

export async function getRecycledProjects(
  signal?: AbortSignal,
): Promise<RecycledProject[]> {
  return requestJson("/api/projects/recycle-bin", signal ? { signal } : {});
}

export async function restoreRecycledProject(
  project: Pick<RecycledProject, "id" | "deletionToken">,
): Promise<Project> {
  return requestJson(
    `/api/projects/${encodeURIComponent(project.id)}/restore`,
    jsonRequest("POST", { deletionToken: project.deletionToken }),
  );
}

export async function purgeRecycledProject(
  project: Pick<RecycledProject, "id" | "title" | "deletionToken">,
): Promise<void> {
  return requestVoid(
    `/api/projects/${encodeURIComponent(project.id)}/purge`,
    jsonRequest("DELETE", {
      deletionToken: project.deletionToken,
      confirmationTitle: project.title,
    }),
  );
}
