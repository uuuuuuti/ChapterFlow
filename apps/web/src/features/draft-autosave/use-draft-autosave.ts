import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  saveDocumentDraft,
  type DocumentDraft,
  type StudioDocumentDetail,
} from "../../lib/api";
export type FlushDraft = () => Promise<boolean>;
export function useDraftAutosave(
  projectId: string,
  detail: StudioDocumentDetail | undefined,
  onFlushReady: (flush: FlushDraft | null) => void,
) {
  const initialContent =
    detail?.draft?.content ?? detail?.currentVersion?.content ?? "";
  const [content, setContent] = useState(initialContent);
  const [draftSavedContent, setDraftSavedContent] = useState(initialContent);
  const contentRef = useRef(content);
  const savedContentRef = useRef(draftSavedContent);
  const latestDraftRef = useRef<DocumentDraft | null>(detail?.draft ?? null);
  const baseVersionRef = useRef(detail?.document.currentVersionId ?? null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const autosaveTimerRef = useRef<number | null>(null);
  const queryClient = useQueryClient();
  const draftMutation = useMutation({
    mutationFn: (value: string) =>
      saveDocumentDraft(projectId, detail!.document.id, {
        content: value,
        baseVersionId: baseVersionRef.current,
        expectedDraftUpdatedAt: latestDraftRef.current?.updatedAt ?? null,
      }),
    onSuccess: (draft, value) => {
      latestDraftRef.current = draft;
      savedContentRef.current = value;
      setDraftSavedContent(value);
      if (detail) {
        queryClient.setQueryData<StudioDocumentDetail>(
          ["project", projectId, "studio", "document", detail.document.id],
          (current) => (current ? { ...current, draft } : current),
        );
      }
    },
  });
  const mutateDraft = draftMutation.mutateAsync;
  const persistDraft = useCallback(
    (value: string): Promise<DocumentDraft | null> => {
      const perform = () => mutateDraft(value);
      const queued = saveQueueRef.current.then(perform, perform);
      saveQueueRef.current = queued.then(
        () => undefined,
        () => undefined,
      );
      return queued;
    },
    [mutateDraft],
  );
  const cancelScheduledAutosave = useCallback(() => {
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
  }, []);
  const flushCurrentDraft = useCallback(
    async (force = false): Promise<boolean> => {
      if (!detail) return true;
      cancelScheduledAutosave();
      await saveQueueRef.current;
      const value = contentRef.current;
      if (!force && value === savedContentRef.current) return true;
      try {
        await persistDraft(value);
        return true;
      } catch {
        return false;
      }
    },
    [cancelScheduledAutosave, detail, persistDraft],
  );
  const flushDraft = useCallback(
    () => flushCurrentDraft(false),
    [flushCurrentDraft],
  );
  const retryDraft = useCallback(
    () => flushCurrentDraft(true),
    [flushCurrentDraft],
  );
  useEffect(() => {
    if (!detail || content === draftSavedContent) return;
    autosaveTimerRef.current = window.setTimeout(() => {
      autosaveTimerRef.current = null;
      void persistDraft(content).catch(() => undefined);
    }, 700);
    return cancelScheduledAutosave;
  }, [
    cancelScheduledAutosave,
    content,
    detail,
    draftSavedContent,
    persistDraft,
  ]);
  // 正式版本身份或服务端草稿变化（历史恢复、AI 候选采纳、其他标签页写入）时，
  // 编辑器必须重新装载新正文；本地有未保存编辑时不覆盖，留待草稿保存冲突显式暴露。
  const detailContentIdentity = detail
    ? `${detail.document.id}·${detail.document.currentVersionId ?? "none"}·${detail.draft?.contentHash ?? "none"}·${detail.draft?.updatedAt ?? "none"}`
    : null;
  const syncedIdentityRef = useRef(detailContentIdentity);
  useEffect(() => {
    if (!detail || detailContentIdentity === null) return;
    if (detailContentIdentity === syncedIdentityRef.current) return;
    syncedIdentityRef.current = detailContentIdentity;
    if (contentRef.current !== savedContentRef.current) return;
    latestDraftRef.current = detail.draft;
    baseVersionRef.current = detail.document.currentVersionId;
    cancelScheduledAutosave();
    const next = detail.draft?.content ?? detail.currentVersion?.content ?? "";
    contentRef.current = next;
    savedContentRef.current = next;
    setContent(next);
    setDraftSavedContent(next);
  }, [cancelScheduledAutosave, detail, detailContentIdentity]);
  useEffect(() => {
    onFlushReady(flushDraft);
    return () => onFlushReady(null);
  }, [flushDraft, onFlushReady]);
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (
        content !== draftSavedContent ||
        draftMutation.isPending ||
        draftMutation.isError
      )
        event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [
    content,
    draftSavedContent,
    draftMutation.isPending,
    draftMutation.isError,
  ]);
  return {
    content,
    setContent,
    draftSavedContent,
    setDraftSavedContent,
    contentRef,
    savedContentRef,
    latestDraftRef,
    saveQueueRef,
    draftMutation,
    persistDraft,
    cancelScheduledAutosave,
    flushDraft,
    retryDraft,
  };
}
