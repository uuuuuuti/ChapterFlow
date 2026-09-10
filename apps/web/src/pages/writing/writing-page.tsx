import { ChapterEditor } from "../../features/chapter-editor/chapter-editor";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Navigate,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router";
import { BookOpen, Plus } from "lucide-react";
import {
  useChapters,
  useProjectOverview,
  useStory,
} from "../../entities/project/queries";
import { useWritingGuard } from "../../app/layouts/chapterflow-shell";
import { ChapterTree } from "../../features/chapter-tree/chapter-tree";
import { useCreateChapter } from "../../features/chapter-create/use-create-chapter";
import { type FlushDraft } from "../../features/draft-autosave/use-draft-autosave";
import {
  getStudioDocument,
  getStudioDocuments,
  setStoryDocumentArchived,
} from "../../shared/api/writing";
import { getStoryBible, moveOutlineNode } from "../../shared/api/story";
import { ApiError } from "../../shared/api/client";
import { queryKeys } from "../../shared/query/keys";
import { ErrorNote, ResourceErrorState } from "../../shared/ui";
import { Drawer } from "../../shared/ui/drawer";
import type { OutlineNode, StoryDocument } from "../../shared/api/types";

export function WritingPageV2() {
  const { projectId = "", chapterId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedOutline = searchParams.get("outline");
  const openedOutline = useRef<string | null>(null);
  const chapters = useChapters(projectId);
  const story = useStory(projectId);
  const overview = useProjectOverview(projectId);
  const client = useQueryClient();
  const allDocuments = useQuery({
    queryKey: queryKeys.documents(projectId, true),
    queryFn: ({ signal }) => getStudioDocuments(projectId, signal, true),
  });
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [parent, setParent] = useState("");
  const flush = useRef<FlushDraft | null>(null);
  const register = useWritingGuard();
  const [error, setError] = useState("");
  const archiveMutation = useMutation({
    mutationFn: ({ document, archived }: { document: StoryDocument; archived: boolean }) =>
      setStoryDocumentArchived(document, archived),
    onSuccess: async (document) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.documents(projectId) }),
        client.invalidateQueries({ queryKey: queryKeys.project(projectId) }),
        client.invalidateQueries({
          queryKey: queryKeys.document(projectId, document.id),
        }),
      ]);
      if (document.archivedAt && chapterId === document.id)
        navigate(`/books/${projectId}/write`, { replace: true });
    },
  });
  const moveMutation = useMutation({
    mutationFn: ({ node, parentId, ordinal }: { node: OutlineNode; parentId: string; ordinal: number }) =>
      moveOutlineNode(projectId, node.id, {
        parentId,
        ordinal,
        expectedUpdatedAt: node.updatedAt,
      }),
    onSuccess: async () => {
      setError("");
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.story(projectId) }),
        client.invalidateQueries({ queryKey: queryKeys.project(projectId) }),
      ]);
    },
    onError: (reason) => setError(reason instanceof Error ? reason.message : "章节位置保存失败，请刷新后重试。"),
  });
  const batchMoveMutation = useMutation({
    mutationFn: async ({ nodes, parentId, ordinal }: { nodes: OutlineNode[]; parentId: string; ordinal: number }) => {
      const ordered = nodes.slice().sort((left, right) => left.ordinal - right.ordinal);
      for (const [index, node] of ordered.entries()) {
        const latest = await getStoryBible(projectId);
        const current = latest.outline.find((candidate) => candidate.id === node.id);
        if (!current) throw new Error(`找不到章节“${node.title}”，批量移动已停止。`);
        await moveOutlineNode(projectId, current.id, {
          parentId,
          ordinal: ordinal + index,
          expectedUpdatedAt: current.updatedAt,
        });
      }
    },
    onSuccess: async () => {
      setError("");
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.story(projectId) }),
        client.invalidateQueries({ queryKey: queryKeys.project(projectId) }),
      ]);
    },
    onError: (reason) => setError(reason instanceof Error ? reason.message : "批量移动失败，已保留已完成的章节位置，请刷新核对。"),
  });
  const batchArchiveMutation = useMutation({
    mutationFn: async (documents: StoryDocument[]) => {
      const latest = await getStudioDocuments(projectId, undefined, true);
      for (const document of documents) {
        const current = latest.find((candidate) => candidate.id === document.id);
        if (!current || current.archivedAt) continue;
        await setStoryDocumentArchived(current, true);
      }
    },
    onSuccess: async () => {
      setError("");
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.documents(projectId) }),
        client.invalidateQueries({ queryKey: queryKeys.project(projectId) }),
      ]);
    },
    onError: (reason) => setError(reason instanceof Error ? reason.message : "批量归档失败，已保留已完成的归档，请刷新核对。"),
  });
  const onFlush = useCallback(
    (value: FlushDraft | null) => {
      flush.current = value;
      register(value);
    },
    [register],
  );
  const go = async (id: string) => {
    if (flush.current && !(await flush.current())) {
      setError("草稿保存失败，请先重试保存。");
      return;
    }
    navigate(`/books/${projectId}/write/${id}`);
  };
  const create = useCreateChapter(projectId, (id) => {
    setCreating(false);
    setTitle("");
    void go(id);
  });
  const listedDocuments = allDocuments.data ?? chapters.data ?? [];
  const activeDocuments = listedDocuments.filter((document) => !document.archivedAt);
  const archivedDocuments = listedDocuments.filter((document) => Boolean(document.archivedAt));
  const archiveDocument = async (document: StoryDocument, archived: boolean) => {
    if (archived && flush.current && !(await flush.current())) {
      setError("草稿保存失败，暂时无法归档章节。");
      return;
    }
    archiveMutation.mutate({ document, archived });
  };
  const choose = async (item: StoryDocument | OutlineNode) => {
    if (flush.current && !(await flush.current())) {
      setError("草稿尚未保存，暂时无法切换章节。");
      return;
    }
    if ("currentVersionId" in item) void go(item.id);
    else create.mutate({ title: item.title, outlineId: item.id });
  };
  const detail = useQuery({
    queryKey: queryKeys.document(projectId, chapterId ?? null),
    queryFn: ({ signal }) => getStudioDocument(projectId, chapterId!, signal),
    enabled: Boolean(chapterId),
    refetchInterval: 2500,
  });
  const requestedNode = story.data?.outline.find(
    (node) => node.id === requestedOutline && node.kind === "chapter",
  );
  const requestedOutlineMissing = Boolean(
    requestedOutline &&
      story.isSuccess &&
      chapters.isSuccess &&
      !story.data?.outline.some((node) => node.id === requestedOutline),
  );
  const createChapter = create.mutate;
  useEffect(() => {
    if (
      chapterId ||
      !requestedNode ||
      !chapters.data ||
      openedOutline.current === requestedNode.id
    )
      return;
    const existing = chapters.data.find(
      (doc) => doc.outlineNodeId === requestedNode.id,
    );
    openedOutline.current = requestedNode.id;
    if (existing)
      navigate(`/books/${projectId}/write/${existing.id}`, { replace: true });
    else
      createChapter({
        title: requestedNode.title,
        outlineId: requestedNode.id,
      });
  }, [
    chapterId,
    requestedNode,
    chapters.data,
    createChapter,
    navigate,
    projectId,
  ]);
  if (!chapterId && !requestedOutline && activeDocuments.length) {
    const current = overview.data?.currentChapter?.documentId;
    const target =
      activeDocuments.find((d) => d.id === current) ?? activeDocuments[0]!;
    const query = searchParams.toString();
    return (
      <Navigate
        replace
        to={`/books/${projectId}/write/${target.id}${query ? `?${query}` : ""}`}
      />
    );
  }
  const failure = allDocuments.error ?? chapters.error ?? story.error ?? detail.error;
  if (requestedOutlineMissing && !chapterId) {
    return (
      <div className="cf-writing">
        <ResourceErrorState
          error={new ApiError("outline.not_found", "找不到这个大纲节点", 404)}
          backHref={`/books/${projectId}/outline`}
          backLabel="回到大纲"
          title="找不到这个大纲节点"
          description="该节点可能已被删除，或当前书签已经过期。"
        />
      </div>
    );
  }
  return (
    <div className="cf-writing">
      <ChapterTree
        projectId={projectId}
        outline={story.data?.outline ?? []}
        documents={activeDocuments}
        archived={archivedDocuments}
        selected={chapterId ?? null}
        onSelect={(item) => void choose(item)}
        onCreate={() => {
          setTitle(`第${(chapters.data?.length ?? 0) + 1}章 `);
          setCreating(true);
        }}
        onMove={(node, parentId, ordinal) => {
          if (!parentId) {
            setError("章节必须放在全书、卷或篇章下。 ");
            return;
          }
          moveMutation.mutate({ node, parentId, ordinal });
        }}
        onBatchMove={(nodes, parentId, ordinal) => {
          if (!parentId) {
            setError("章节必须放在全书、卷或篇章下。");
            return;
          }
          batchMoveMutation.mutate({ nodes, parentId, ordinal });
        }}
        onBatchArchive={(documents) => batchArchiveMutation.mutate(documents)}
        moving={
          moveMutation.isPending ||
          batchMoveMutation.isPending ||
          archiveMutation.isPending ||
          batchArchiveMutation.isPending
        }
      />
      {failure ? (
        <div className="cf-writing-empty">
          <ResourceErrorState
            error={failure}
            backHref="/books"
            backLabel="回到作品库"
            title={chapterId ? "找不到这章内容" : "找不到这本作品"}
            description={chapterId ? "章节可能已被移除，或当前链接已经过期。" : "作品可能已经被移除，或当前链接已经过期。"}
          />
        </div>
      ) : detail.data && story.data ? (
        <ChapterEditor
          key={detail.data.document.id}
          projectId={projectId}
          detail={detail.data}
          story={story.data}
          onFlushReady={onFlush}
          onArchive={(document, archived) => void archiveDocument(document, archived)}
        />
      ) : (
        <div className="cf-writing-empty">
          <BookOpen size={50} />
          <h1>{chapterId ? "正在打开章节…" : "写下故事的第一行"}</h1>
          <p>不需要配置 AI，也可以开始创作。正文会自动保存。</p>
          {!chapterId ? (
            <button
              className="cf-primary"
              onClick={() => {
                setTitle("第1章 ");
                setCreating(true);
              }}
            >
              <Plus size={17} />
              新建章节
            </button>
          ) : null}
        </div>
      )}
      {error ? (
        <div role="alert" className="cf-notice">
          {error}
        </div>
      ) : null}
      {archiveMutation.isError ? <ErrorNote error={archiveMutation.error} /> : null}
      {batchMoveMutation.isError ? <ErrorNote error={batchMoveMutation.error} /> : null}
      {batchArchiveMutation.isError ? <ErrorNote error={batchArchiveMutation.error} /> : null}
      {create.isError && !creating ? <ErrorNote error={create.error} /> : null}
      {creating ? (
        <Drawer
          title="新建章节"
          onClose={() => {
            if (!create.isPending) setCreating(false);
          }}
        >
          <form
            className="cf-form"
            onSubmit={(e) => {
              e.preventDefault();
              void (async () => {
                if (flush.current && !(await flush.current())) {
                  setError("草稿保存失败。");
                  return;
                }
                create.mutate({
                  title: title.trim(),
                  ...(parent ? { parentId: parent } : {}),
                });
              })();
            }}
          >
            <label>
              章节标题
              <input
                required
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
              />
            </label>
            <label>
              所属卷
              <select
                value={parent}
                onChange={(e) => setParent(e.target.value)}
              >
                <option value="">自动选择</option>
                {story.data?.outline
                  .filter((n) => n.kind === "book" || n.kind === "volume")
                  .map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.title}
                    </option>
                  ))}
              </select>
            </label>
            <p>章节与大纲会自动关联，创建后就能开始写作。</p>
            <button
              className="cf-primary"
              disabled={!title.trim() || create.isPending}
            >
              {create.isPending ? "正在创建…" : "创建章节"}
            </button>
            {create.isError ? <ErrorNote error={create.error} /> : null}
          </form>
        </Drawer>
      ) : null}
    </div>
  );
}
