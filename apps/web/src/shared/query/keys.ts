/** Shared cache identities. Keep legacy keys stable during incremental migration. */
export const queryKeys = {
  projects: ["projects"] as const,
  health: ["health"] as const,
  project: (id: string | null) => ["project", id] as const,
  overview: (id: string | null) => ["project", id, "overview"] as const,
  story: (id: string | null) => ["project", id, "bible"] as const,
  documents: (id: string | null) =>
    ["project", id, "studio", "documents"] as const,
  document: (id: string | null, documentId: string | null) =>
    ["project", id, "studio", "document", documentId] as const,
  runs: (id: string | null) => ["project", id, "runs"] as const,
  review: (id: string | null) => ["project", id, "review"] as const,
  run: (id: string | null) => ["run", id] as const,
};
