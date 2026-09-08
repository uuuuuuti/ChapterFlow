import { ChapterEditor } from "../../features/chapter-editor/chapter-editor";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { getStudioDocument } from "../../shared/api/writing";
import { queryKeys } from "../../shared/query/keys";
import { ErrorNote } from "../../shared/ui";
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
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [parent, setParent] = useState("");
  const flush = useRef<FlushDraft | null>(null);
  const register = useWritingGuard();
  const [error, setError] = useState("");
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
  if (!chapterId && !requestedOutline && chapters.data?.length) {
    const current = overview.data?.currentChapter?.documentId;
    const target =
      chapters.data.find((d) => d.id === current) ?? chapters.data[0]!;
    return <Navigate replace to={`/books/${projectId}/write/${target.id}`} />;
  }
  const failure = chapters.error ?? story.error ?? detail.error;
  return (
    <div className="cf-writing">
      <ChapterTree
        outline={story.data?.outline ?? []}
        documents={chapters.data ?? []}
        selected={chapterId ?? null}
        onSelect={(item) => void choose(item)}
        onCreate={() => {
          setTitle(`第${(chapters.data?.length ?? 0) + 1}章 `);
          setCreating(true);
        }}
      />
      {failure ? (
        <div className="cf-writing-empty">
          <ErrorNote error={failure} />
        </div>
      ) : detail.data && story.data ? (
        <ChapterEditor
          key={detail.data.document.id}
          projectId={projectId}
          detail={detail.data}
          story={story.data}
          onFlushReady={onFlush}
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
