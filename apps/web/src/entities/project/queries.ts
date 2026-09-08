import { useQuery } from "@tanstack/react-query";
import { getProjects } from "../../shared/api/projects";
import { getProjectOverview } from "../../shared/api/overview";
import { getStoryBible } from "../../shared/api/story";
import { getStudioDocuments } from "../../shared/api/writing";
import { queryKeys } from "../../shared/query/keys";
export function useProjects() {
  return useQuery({
    queryKey: queryKeys.projects,
    queryFn: ({ signal }) => getProjects(signal),
  });
}
export function useProjectOverview(id: string) {
  return useQuery({
    queryKey: queryKeys.overview(id),
    queryFn: ({ signal }) => getProjectOverview(id, signal),
    refetchInterval: 5000,
  });
}
export function useStory(id: string) {
  return useQuery({
    queryKey: queryKeys.story(id),
    queryFn: ({ signal }) => getStoryBible(id, signal),
  });
}
export function useChapters(id: string) {
  return useQuery({
    queryKey: queryKeys.documents(id),
    queryFn: ({ signal }) => getStudioDocuments(id, signal),
  });
}
