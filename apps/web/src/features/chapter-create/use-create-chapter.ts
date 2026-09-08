import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createStoryDocument } from "../../shared/api/writing";
import { createOutlineNode, getStoryBible } from "../../shared/api/story";
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
          requestId: crypto.randomUUID(),
        };
      const state = pending.current;
      if (!state.outlineId) {
        const story = await getStoryBible(projectId);
        const parent =
          input.parentId ??
          story.outline.find((n) => n.kind === "volume")?.id ??
          story.outline.find((n) => n.kind === "book")?.id;
        if (!parent)
          throw new Error("作品大纲尚未准备好，请在大纲页创建全书结构。");
        const siblings = story.outline.filter((n) => n.parentId === parent);
        const node = await createOutlineNode(projectId, {
          parentId: parent,
          kind: "chapter",
          ordinal: Math.max(0, ...siblings.map((n) => n.ordinal)) + 1,
          title: input.title,
          summary: null,
          metadata: {},
        });
        state.outlineId = node.id;
      }
      return createStoryDocument(projectId, {
        requestId: state.requestId,
        kind: "chapter",
        title: input.title,
        outlineNodeId: state.outlineId,
      });
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
