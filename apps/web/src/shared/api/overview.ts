import { type ProjectOverview } from "./types";
import { requestJson } from "./client";

export async function getProjectOverview(
  projectId: string,
  signal?: AbortSignal,
): Promise<ProjectOverview> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/overview`,
    signal ? { signal } : {},
  );
}
