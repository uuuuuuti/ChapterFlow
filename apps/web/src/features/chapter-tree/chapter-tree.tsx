import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArchiveRestore,
  ChevronDown,
  ChevronRight,
  FileText,
  Move,
  Plus,
} from "lucide-react";
import { Link } from "react-router";
import type { OutlineNode, StoryDocument } from "../../shared/api/types";
export function ChapterTree({
  outline,
  documents,
  archived,
  projectId,
  selected,
  onSelect,
  onCreate,
  onMove,
  onBatchMove,
  onBatchArchive,
  moving = false,
}: {
  outline: OutlineNode[];
  documents: StoryDocument[];
  archived?: StoryDocument[];
  projectId?: string;
  selected: string | null;
  onSelect: (doc: StoryDocument | OutlineNode) => void;
  onCreate: () => void;
  onMove?: (node: OutlineNode, parentId: string, ordinal: number) => void;
  onBatchMove?: (nodes: OutlineNode[], parentId: string, ordinal: number) => void;
  onBatchArchive?: (documents: StoryDocument[]) => void;
  moving?: boolean;
}) {
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [moveTarget, setMoveTarget] = useState<OutlineNode | null>(null);
  const [moveParentId, setMoveParentId] = useState("");
  const [moveOrdinal, setMoveOrdinal] = useState("0");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [moveTargets, setMoveTargets] = useState<OutlineNode[]>([]);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const boundDocumentNodeIds = new Set(
    [...documents, ...(archived ?? [])]
      .map((document) => document.outlineNodeId)
      .filter((id): id is string => Boolean(id)),
  );
  /* 重新规划会保留 abandoned 节点作为审计历史，但它们不应继续伪装成
     当前章节；否则同一个章名会在写作侧栏出现两次。只要该节点仍绑定着
     作者正文，就保留它，避免隐藏用户自己的稿件。 */
  const visibleOutline = outline.filter(
    (node) =>
      node.kind !== "chapter" ||
      node.status !== "abandoned" ||
      boundDocumentNodeIds.has(node.id),
  );
  const hasVisibleDescendants = (parentId: string): boolean =>
    visibleOutline.some(
      (node) =>
        node.parentId === parentId &&
        (node.kind === "chapter" || hasVisibleDescendants(node.id)),
    );
  const moveParents = outline.filter((node) => ["book", "volume", "arc"].includes(node.kind));
  const selectedNodes = outline.filter(
    (node) => selectedIds.includes(node.id) && node.kind === "chapter",
  );
  const selectedDocuments = selectedNodes
    .map((node) => documents.find((document) => document.outlineNodeId === node.id))
    .filter((document): document is StoryDocument => Boolean(document));
  const selectedDocument = selected
    ? documents.find((document) => document.id === selected)
    : undefined;
  const openMove = (node: OutlineNode, batch = false) => {
    const targets = batch
      ? selectedNodes
      : selectedIds.includes(node.id)
        ? selectedNodes
        : [node];
    const nextTargets = targets.length ? targets : [node];
    setMoveTargets(nextTargets);
    setMoveTarget(nextTargets[0] ?? node);
    setMoveParentId((nextTargets[0] ?? node).parentId ?? moveParents[0]?.id ?? "");
    setMoveOrdinal(String(Math.min(...nextTargets.map((target) => target.ordinal))));
  };
  const toggleSelected = (nodeId: string) => {
    setSelectedIds((current) =>
      current.includes(nodeId)
        ? current.filter((id) => id !== nodeId)
        : [...current, nodeId],
    );
  };
  const canDrop = (sourceId: string | null, targetId: string) => {
    if (!onMove || !sourceId || sourceId === targetId) return false;
    const source = outline.find((node) => node.id === sourceId);
    const target = outline.find((node) => node.id === targetId);
    return Boolean(
      source &&
        target &&
        source.kind === "chapter" &&
        target.kind === "chapter" &&
        source.parentId &&
        source.parentId === target.parentId,
    );
  };
  const drop = (targetId: string) => {
    if (!canDrop(draggedId, targetId)) {
      setDraggedId(null);
      setDropTargetId(null);
      return;
    }
    const source = outline.find((node) => node.id === draggedId);
    const target = outline.find((node) => node.id === targetId);
    if (!source || !target || !source.parentId) return;
    onMove?.(source, source.parentId, target.ordinal);
    setDraggedId(null);
    setDropTargetId(null);
  };
  const render = (parentId: string | null): React.ReactNode =>
    visibleOutline
      .filter((n) => n.parentId === parentId)
      .sort((a, b) => a.ordinal - b.ordinal)
      .map((node) => {
        const doc = documents.find((d) => d.outlineNodeId === node.id);
        const children = outline.some((n) => n.parentId === node.id);
        if (node.kind === "book")
          return <div key={node.id}>{render(node.id)}</div>;
        if (node.kind === "volume" || node.kind === "arc")
          return hasVisibleDescendants(node.id) ? (
            <div key={node.id} className="cf-tree-group">
              <button
                className="cf-tree-volume"
                onClick={() =>
                  setCollapsed((v) =>
                    v.includes(node.id)
                      ? v.filter((id) => id !== node.id)
                      : [...v, node.id],
                  )
                }
              >
                {collapsed.includes(node.id) ? (
                  <ChevronRight size={15} />
                ) : (
                  <ChevronDown size={15} />
                )}
                <strong>{node.kind === "volume" ? "卷 · " : "篇 · "}{node.title}</strong>
              </button>
              {!collapsed.includes(node.id) ? render(node.id) : null}
            </div>
          ) : null;
        if (node.kind !== "chapter")
          return children ? <div key={node.id}>{render(node.id)}</div> : null;
        const chapterSiblings = outline
          .filter((item) => item.parentId === node.parentId && item.kind === "chapter")
          .sort((a, b) => a.ordinal - b.ordinal || a.createdAt.localeCompare(b.createdAt));
        const chapterIndex = chapterSiblings.findIndex((item) => item.id === node.id);
        const isSelected = selectedIds.includes(node.id);
        return (
          <div key={node.id} className="cf-tree-chapter-row">
            {onBatchMove || onBatchArchive ? (
              <input
                type="checkbox"
                aria-label={`选择章节 ${node.title}`}
                checked={isSelected}
                onChange={() => toggleSelected(node.id)}
                onClick={(event) => event.stopPropagation()}
              />
            ) : null}
            <button
              className={`cf-tree-chapter ${selected === doc?.id ? "is-active" : ""} ${dropTargetId === node.id ? "is-drop-target" : ""} ${draggedId === node.id ? "is-dragging" : ""}`}
              draggable={Boolean(onMove)}
              aria-grabbed={draggedId === node.id}
              onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; setDraggedId(node.id); setDropTargetId(null); }}
              onDragEnd={() => { setDraggedId(null); setDropTargetId(null); }}
              onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; if (canDrop(draggedId, node.id)) setDropTargetId(node.id); }}
              onDragLeave={() => setDropTargetId((current) => current === node.id ? null : current)}
              onDrop={(event) => { event.preventDefault(); drop(node.id); }}
              onClick={() => onSelect(doc ?? node)}
            >
              <FileText size={15} />
              <span>{node.title}</span>
              {!doc ? <small>未写</small> : null}
            </button>
            {onMove ? (
              <span className="cf-tree-chapter-actions">
                <button
                  type="button"
                  aria-label={`上移章节 ${node.title}`}
                  title="上移章节"
                  disabled={moving || chapterIndex <= 0}
                  onClick={() => onMove(node, node.parentId ?? "", Math.max(0, node.ordinal - 1))}
                >
                  <ArrowUp size={12} />
                </button>
                <button
                  type="button"
                  aria-label={`下移章节 ${node.title}`}
                  title="下移章节"
                  disabled={moving || chapterIndex < 0 || chapterIndex >= chapterSiblings.length - 1}
                  onClick={() => onMove(node, node.parentId ?? "", node.ordinal + 1)}
                >
                  <ArrowDown size={12} />
                </button>
                <button
                  type="button"
                  aria-label={`移动章节 ${node.title}`}
                  title="移动章节"
                  disabled={moving}
                  onClick={() => openMove(node)}
                >
                  <Move size={12} />
                </button>
              </span>
            ) : null}
          </div>
        );
      });
  const unbound = documents.filter(
    (d) => !d.outlineNodeId || !outline.some((n) => n.id === d.outlineNodeId),
  );
  return (
    <aside className="cf-chapter-tree">
      <header>
        <h2>章节</h2>
        <div className="cf-tree-header-actions">
          {projectId ? (
            <Link
              className="cf-tree-quick-link"
              to={`/books/${projectId}/quick-create${selectedDocument?.outlineNodeId ? `?fromOutline=${encodeURIComponent(selectedDocument.outlineNodeId)}` : ""}`}
            >
              连续创作
            </Link>
          ) : null}
          <button aria-label="新建章节" onClick={onCreate}>
            <Plus size={17} />
          </button>
        </div>
      </header>
      <small>{documents.length} 章 · 每一页都算数</small>
      {selectedNodes.length ? (
        <div className="cf-tree-batch-actions" role="group" aria-label="批量章节操作">
          <span>已选 {selectedNodes.length} 章</span>
          {onBatchMove ? (
            <button
              type="button"
              className="cf-button"
              disabled={moving}
              onClick={() => openMove(selectedNodes[0]!, true)}
            >
              批量移动
            </button>
          ) : null}
          {onBatchArchive && selectedDocuments.length ? (
            <button
              type="button"
              className="cf-button"
              disabled={moving}
              onClick={() => onBatchArchive(selectedDocuments)}
            >
              批量归档
            </button>
          ) : null}
          {selectedDocuments.length < selectedNodes.length ? (
            <small>未写章节不会被归档</small>
          ) : null}
        </div>
      ) : null}
      <div className="cf-tree-scroll">
        {moveTarget && (onMove || onBatchMove) ? (
          <form
            className="cf-tree-move-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!moveParentId) return;
              const ordinal = Math.max(0, Number(moveOrdinal) || 0);
              if (moveTargets.length > 1 && onBatchMove) {
                onBatchMove(moveTargets, moveParentId, ordinal);
              } else if (moveTargets[0] && onMove) {
                onMove(moveTargets[0], moveParentId, ordinal);
              }
              setMoveTarget(null);
              setMoveTargets([]);
            }}
          >
            <strong>
              {moveTargets.length > 1
                ? `移动 ${moveTargets.length} 个章节`
                : `移动“${moveTarget.title}”`}
            </strong>
            <label>
              所属卷/篇章
              <select value={moveParentId} onChange={(event) => setMoveParentId(event.target.value)}>
                {moveParents.map((parent) => <option key={parent.id} value={parent.id}>{parent.title}</option>)}
              </select>
            </label>
            <label>
              插入序号
              <input type="number" min={0} value={moveOrdinal} onChange={(event) => setMoveOrdinal(event.target.value)} />
            </label>
            <div className="cf-actions">
              <button type="button" className="cf-button" onClick={() => setMoveTarget(null)}>取消</button>
              <button className="cf-primary" disabled={moving || !moveParentId}>保存位置</button>
            </div>
          </form>
        ) : null}
        {render(null)}
        {unbound.map((doc) => (
          <button
            key={doc.id}
            className={`cf-tree-chapter ${selected === doc.id ? "is-active" : ""}`}
            onClick={() => onSelect(doc)}
          >
            <FileText size={15} />
            <span>{doc.title}</span>
          </button>
        ))}
        {archived?.length ? (
          <section className="cf-tree-archived">
            <header>
              <strong>已归档</strong>
              <small>{archived.length}</small>
            </header>
            {archived.map((doc) => (
              <button
                key={doc.id}
                className={`cf-tree-chapter is-archived ${selected === doc.id ? "is-active" : ""}`}
                onClick={() => onSelect(doc)}
              >
                <ArchiveRestore size={15} />
                <span>{doc.title}</span>
              </button>
            ))}
          </section>
        ) : null}
      </div>
      <button className="cf-add-chapter" onClick={onCreate}>
        <Plus size={16} />
        新建章节
      </button>
    </aside>
  );
}
