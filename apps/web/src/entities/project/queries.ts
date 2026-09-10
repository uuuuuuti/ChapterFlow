import { useQuery } from "@tanstack/react-query";
import { getProjects } from "../../shared/api/projects";
import { getProjectOverview } from "../../shared/api/overview";
import {
  getCanonEntities,
  getCanonFacts,
  getForeshadows,
  getRelationships,
  getRelationshipHistory,
  getStoryBible,
  getStoryEvidence,
  getTimelineEvents,
} from "../../shared/api/story";
import { getStudioDocuments } from "../../shared/api/writing";
import { getBookProfile } from "../../shared/api/web-novel";
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
export function useStory(id: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.story(id),
    queryFn: ({ signal }) => getStoryBible(id, signal),
    enabled: options.enabled ?? Boolean(id),
  });
}
export function useStoryEvidence(id: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.storyEvidence(id),
    queryFn: ({ signal }) => getStoryEvidence(id, signal),
    enabled: options.enabled ?? Boolean(id),
  });
}
export function useCanonEntities(
  id: string,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: queryKeys.entities(id),
    queryFn: ({ signal }) => getCanonEntities(id, signal),
    enabled: options.enabled ?? Boolean(id),
  });
}
export function useCanonFacts(id: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.facts(id),
    queryFn: ({ signal }) => getCanonFacts(id, signal),
    enabled: options.enabled ?? Boolean(id),
  });
}
export function useRelationships(
  id: string,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: queryKeys.relationships(id),
    queryFn: ({ signal }) => getRelationships(id, signal),
    enabled: options.enabled ?? Boolean(id),
  });
}
export function useRelationshipHistory(
  id: string,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: queryKeys.relationshipHistory(id),
    queryFn: ({ signal }) => getRelationshipHistory(id, signal),
    enabled: options.enabled ?? Boolean(id),
  });
}
export function useTimelineEvents(
  id: string,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: queryKeys.timeline(id),
    queryFn: ({ signal }) => getTimelineEvents(id, signal),
    enabled: options.enabled ?? Boolean(id),
  });
}
export function useForeshadows(
  id: string,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: queryKeys.foreshadows(id),
    queryFn: ({ signal }) => getForeshadows(id, signal),
    enabled: options.enabled ?? Boolean(id),
  });
}
export function useChapters(id: string) {
  return useQuery({
    queryKey: queryKeys.documents(id),
    queryFn: ({ signal }) => getStudioDocuments(id, signal),
  });
}

export function useBookProfile(id: string) {
  return useQuery({
    queryKey: queryKeys.bookProfile(id),
    queryFn: ({ signal }) => getBookProfile(id, signal),
    retry: false,
  });
}
