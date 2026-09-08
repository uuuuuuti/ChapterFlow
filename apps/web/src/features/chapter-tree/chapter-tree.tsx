import { useState } from "react";
import { ChevronDown, ChevronRight, FileText, Plus } from "lucide-react";
import type { OutlineNode, StoryDocument } from "../../shared/api/types";
export function ChapterTree({
  outline,
  documents,
  selected,
  onSelect,
  onCreate,
}: {
  outline: OutlineNode[];
  documents: StoryDocument[];
  selected: string | null;
  onSelect: (doc: StoryDocument | OutlineNode) => void;
  onCreate: () => void;
}) {
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const render = (parentId: string | null): React.ReactNode =>
    outline
      .filter((n) => n.parentId === parentId)
      .sort((a, b) => a.ordinal - b.ordinal)
      .map((node) => {
        const doc = documents.find((d) => d.outlineNodeId === node.id);
        const children = outline.some((n) => n.parentId === node.id);
        if (node.kind === "book")
          return <div key={node.id}>{render(node.id)}</div>;
        if (node.kind === "volume" || node.kind === "arc")
          return (
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
                <strong>{node.title}</strong>
              </button>
              {!collapsed.includes(node.id) ? render(node.id) : null}
            </div>
          );
        if (node.kind !== "chapter")
          return children ? <div key={node.id}>{render(node.id)}</div> : null;
        return (
          <button
            key={node.id}
            className={`cf-tree-chapter ${selected === doc?.id ? "is-active" : ""}`}
            onClick={() => onSelect(doc ?? node)}
          >
            <FileText size={15} />
            <span>{node.title}</span>
            {!doc ? <small>未写</small> : null}
          </button>
        );
      });
  const unbound = documents.filter(
    (d) => !d.outlineNodeId || !outline.some((n) => n.id === d.outlineNodeId),
  );
  return (
    <aside className="cf-chapter-tree">
      <header>
        <h2>章节</h2>
        <button aria-label="新建章节" onClick={onCreate}>
          <Plus size={17} />
        </button>
      </header>
      <small>{documents.length} 章 · 每一页都算数</small>
      <div className="cf-tree-scroll">
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
      </div>
      <button className="cf-add-chapter" onClick={onCreate}>
        <Plus size={16} />
        新建章节
      </button>
    </aside>
  );
}
