import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createChapter, createStoryDocument } from "../../shared/api/writing";
import { queryKeys } from "../../shared/query/keys";
/** Keep a successfully created outline binding when document creation needs retrying. */
export function useCreateChapter(
  projectId: string,
  onCreated: (id: string) => void,
) {
  const client = useQueryClient();
  const pending = useRef<{
    key: string;
    outlineId: string | null;
    parentId: string | null;
    requestId: string;
  } | null>(null);
  return useMutation({
    mutationFn: async (input: {
      title: string;
      parentId?: string;
      outlineId?: string;
    }) => {
      const key = JSON.stringify(input);
      if (pending.current?.key !== key)
        pending.current = {
          key,
          outlineId: input.outlineId ?? null,
          parentId: input.parentId ?? null,
          requestId: crypto.randomUUID(),
        };
      const state = pending.current;
      if (state.outlineId) {
        return createStoryDocument(projectId, {
          requestId: state.requestId,
          kind: "chapter",
          title: input.title,
          outlineNodeId: state.outlineId,
        });
      }
      const created = await createChapter(projectId, {
        requestId: state.requestId,
        title: input.title,
        parentId: state.parentId,
      });
      state.outlineId = created.outline.id;
      return created.document;
    },
    onSuccess: async (doc) => {
      pending.current = null;
      await client.invalidateQueries({
        queryKey: queryKeys.project(projectId),
      });
      onCreated(doc.id);
    },
  });
}
