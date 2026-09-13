import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { ChevronDown, ChevronRight, FileText, Folder, Plus, Trash2 } from "lucide-react";
import { CanonCandidatePanel } from "../../features/canon/canon-candidate-panel";
import {
  batchMoveOutlineNodes,
  copyOutlineNode,
  createOutlineNode,
  getOutlineRemovalImpact,
  moveOutlineNode,
  removeOutlineNode,
  updateOutlineAssociations,
  undoOutlineOperation,
  updateOutlineNode,
} from "../../shared/api/story";
import { useStory } from "../../entities/project/queries";
import { queryKeys } from "../../shared/query/keys";
import { ConfirmDialog, ErrorNote, ResourceErrorState } from "../../shared/ui";
import type { CanonEntity, Foreshadow, OutlineNode, TimelineEvent } from "../../shared/api/types";
import type { OutlineOperationDto } from "@narralume/contracts";

const kindLabels: Record<OutlineNode["kind"], string> = {
  book: "全书",
  volume: "卷",
  arc: "篇章",
  chapter: "章节",
  scene: "场景",
  beat: "节拍",
};

const allowedChildren: Record<OutlineNode["kind"], readonly OutlineNode["kind"][]> = {
  book: ["volume", "arc", "chapter"],
  volume: ["arc", "chapter"],
  arc: ["chapter", "scene"],
  chapter: ["scene", "beat"],
  scene: ["beat"],
  beat: [],
};

export function OutlinePage() {
  const { projectId = "" } = useParams();
  const client = useQueryClient();
  const story = useStory(projectId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<OutlineNode | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [quickKind, setQuickKind] = useState<OutlineNode["kind"]>("chapter");
  const [quickTitle, setQuickTitle] = useState("");
  const [quickSummary, setQuickSummary] = useState("");
  const [quickStatus, setQuickStatus] = useState("");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchParentId, setBatchParentId] = useState("");
  const [batchOrdinal, setBatchOrdinal] = useState(0);
  const [lastOperation, setLastOperation] = useState<OutlineOperationDto | null>(null);
  const [showAiCandidates, setShowAiCandidates] = useState(false);
  const allNodes = useMemo(() => story.data?.outline ?? [], [story.data?.outline]);
  const nodes = useMemo(() => {
    const boundDocumentNodeIds = new Set(
      (story.data?.documents ?? [])
        .map((document) => document.outlineNodeId)
        .filter((id): id is string => Boolean(id)),
    );
    const hasVisibleDescendant = (parentId: string): boolean =>
      allNodes.some(
        (node) =>
          node.parentId === parentId &&
          (node.kind === "chapter"
            ? node.status !== "abandoned" || boundDocumentNodeIds.has(node.id)
            : hasVisibleDescendant(node.id)),
      );
    return allNodes.filter((node) => {
      if (node.kind === "book") return true;
      if (node.kind === "chapter") {
        return node.status !== "abandoned" || boundDocumentNodeIds.has(node.id);
      }
      if (node.kind === "volume") {
        // Keep an empty non-abandoned volume visible as a valid move target;
        // an empty historical arc is still hidden with its old children.
        return node.status !== "abandoned";
      }
      if (node.kind === "arc") {
        return hasVisibleDescendant(node.id);
      }
      return node.status !== "abandoned";
    });
  }, [allNodes, story.data?.documents]);
  const hiddenNodeCount = allNodes.length - nodes.length;
  const selected = nodes.find((node) => node.id === selectedId) ?? nodes.find((node) => node.kind === "chapter") ?? nodes[0];
  const roots = nodes.filter((node) => node.parentId === null).sort(byOrdinal);
  const selectedNodes = nodes.filter((node) => selectedIds.includes(node.id));
  const entities = story.data?.entities ?? [];
  const foreshadows = story.data?.foreshadows ?? [];
  const timelines = story.data?.timeline ?? [];
  const batchParentOptions = selectedNodes.length
    ? nodes
        .filter(
          (node) =>
            node.kind !== "beat" &&
            selectedNodes.every((selectedNode) => allowedChildren[node.kind].includes(selectedNode.kind)) &&
            selectedNodes.every(
              (selectedNode) =>
                node.id !== selectedNode.id &&
                !node.path.startsWith(`${selectedNode.path}/`),
            ),
        )
        .sort((left, right) => left.path.localeCompare(right.path))
    : [];
  const resolvedBatchParentId = batchParentOptions.some((node) => node.id === batchParentId)
    ? batchParentId
    : batchParentOptions[0]?.id ?? "";
  const parentOptions = selected
    ? nodes
        .filter(
          (node) =>
            node.id !== selected.id &&
            !node.path.startsWith(`${selected.path}/`) &&
            allowedChildren[node.kind].includes(selected.kind),
        )
        .sort((left, right) => left.path.localeCompare(right.path))
    : [];
  const invalidate = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: queryKeys.story(projectId) }),
      client.invalidateQueries({ queryKey: queryKeys.overview(projectId) }),
      client.invalidateQueries({ queryKey: queryKeys.documents(projectId) }),
    ]);
  };
  const save = useMutation({
    mutationFn: (input: Partial<Pick<OutlineNode, "title" | "summary" | "goal" | "conflict" | "outcome" | "status" | "metadata">>) =>
      updateOutlineNode(projectId, selected!.id, {
        ...input,
        expectedUpdatedAt: selected!.updatedAt,
      }),
    onSuccess: async () => {
      setError(null);
      await invalidate();
    },
    onError: setError,
  });
  const saveAssociations = useMutation({
    mutationFn: (input: {
      node: OutlineNode;
      povEntityId: string | null;
      foreshadowIds: string[];
      timelineEventIds: string[];
    }) => {
      const selectedForeshadows = new Set(input.foreshadowIds);
      const affected = foreshadows.filter(
        (item) =>
          selectedForeshadows.has(item.id) ||
          item.evidenceNodeIds.includes(input.node.id),
      );
      const selectedTimelines = new Set(input.timelineEventIds);
      const affectedTimelines = timelines.filter(
        (item) => selectedTimelines.has(item.id) || item.outlineNodeId === input.node.id,
      );
      return updateOutlineAssociations(projectId, input.node, {
        povEntityId: input.povEntityId,
        foreshadowIds: input.foreshadowIds,
        timelineEventIds: input.timelineEventIds,
        expectedForeshadowUpdatedAt: Object.fromEntries(
          affected.map((item) => [item.id, item.updatedAt]),
        ),
        expectedTimelineUpdatedAt: Object.fromEntries(
          affectedTimelines.map((item) => [item.id, item.updatedAt]),
        ),
      });
    },
    onSuccess: async () => {
      setError(null);
      await invalidate();
    },
    onError: setError,
  });
  const create = useMutation({
    mutationFn: (input: { parentId: string; kind: OutlineNode["kind"]; title: string }) =>
      createOutlineNode(projectId, {
        ...input,
        ordinal: nodes.filter((node) => node.parentId === input.parentId).length,
        summary: null,
        metadata: {},
      }),
    onSuccess: async (node) => {
      setCreating(false);
      setSelectedId(node.id);
      setError(null);
      await invalidate();
    },
    onError: setError,
  });
  const quickSave = useMutation({
    mutationFn: () => {
      const parent = nodes.find((node) => node.kind === "book") ?? nodes[0];
      if (!parent) throw new Error("请先创建全书节点。");
      const existing = nodes.find((node) => node.title === quickTitle.trim() && node.kind === quickKind);
      return existing
        ? updateOutlineNode(projectId, existing.id, { title: quickTitle.trim(), summary: quickSummary.trim() || null, expectedUpdatedAt: existing.updatedAt })
        : createOutlineNode(projectId, { parentId: parent.id, kind: quickKind, ordinal: nodes.filter((node) => node.parentId === parent.id).length, title: quickTitle.trim(), summary: quickSummary.trim() || null, metadata: {} });
    },
    onSuccess: async (node) => {
      setSelectedId(node.id);
      setQuickStatus("已写入服务端");
      await invalidate();
    },
    onError: setError,
  });
  const remove = useMutation({
    mutationFn: (node: OutlineNode) => removeOutlineNode(projectId, node),
    onSuccess: async () => {
      setDeleteTarget(null);
      setSelectedId(null);
      setError(null);
      await invalidate();
    },
    onError: setError,
  });
  const move = useMutation({
    mutationFn: (input: { node: OutlineNode; parentId?: string | null; ordinal: number }) => {
      if (!input.node.parentId) throw new Error("全书节点不能移动。");
      return moveOutlineNode(projectId, input.node.id, {
        parentId: input.parentId ?? input.node.parentId,
        ordinal: input.ordinal,
        expectedUpdatedAt: input.node.updatedAt,
      });
    },
    onSuccess: async () => {
      setError(null);
      await invalidate();
    },
    onError: setError,
  });
  const batchMove = useMutation({
    mutationFn: () => {
      if (!resolvedBatchParentId || !selectedNodes.length) throw new Error("请先选择目标父节点。");
      return batchMoveOutlineNodes(projectId, {
        parentId: resolvedBatchParentId,
        ordinal: batchOrdinal,
        items: selectedNodes.map((node) => ({ nodeId: node.id, expectedUpdatedAt: node.updatedAt })),
      });
    },
    onSuccess: async (value) => {
      setLastOperation(value.operation);
      setSelectedIds([]);
      setError(null);
      await invalidate();
    },
    onError: setError,
  });
  const copy = useMutation({
    mutationFn: () => {
      const node = selectedNodes[0];
      if (!node || !resolvedBatchParentId) throw new Error("请选择一个节点和目标父节点。");
      return copyOutlineNode(projectId, node, { parentId: resolvedBatchParentId, ordinal: batchOrdinal });
    },
    onSuccess: async (value) => {
      setLastOperation(value.operation);
      setSelectedIds([]);
      setSelectedId(value.root.id);
      setError(null);
      await invalidate();
    },
    onError: setError,
  });
  const undo = useMutation({
    mutationFn: () => {
      if (!lastOperation) throw new Error("没有可撤销的大纲操作。");
      return undoOutlineOperation(projectId, lastOperation, nodes);
    },
    onSuccess: async () => {
      setLastOperation(null);
      setError(null);
      await invalidate();
    },
    onError: setError,
  });
  const canDrop = (sourceId: string | null, targetId: string) => {
    if (!sourceId || sourceId === targetId) return false;
    const source = nodes.find((node) => node.id === sourceId);
    const target = nodes.find((node) => node.id === targetId);
    if (!source || !target || source.kind === "book" || !source.parentId) return false;
    if (target.path === source.path || target.path.startsWith(`${source.path}/`)) return false;
    return source.parentId === target.parentId || allowedChildren[target.kind].includes(source.kind);
  };
  const drop = (targetId: string) => {
    if (!canDrop(draggedId, targetId)) {
      setDraggedId(null);
      setDropTargetId(null);
      return;
    }
    const source = nodes.find((node) => node.id === draggedId);
    const target = nodes.find((node) => node.id === targetId);
    if (!source || !target || !source.parentId) return;
    const reparent = allowedChildren[target.kind].includes(source.kind);
    const sameParent = !reparent && source.parentId === target.parentId;
    move.mutate({
      node: source,
      parentId: sameParent ? target.parentId! : target.id,
      ordinal: sameParent ? target.ordinal : nodes.filter((node) => node.parentId === target.id).length,
    });
    setDraggedId(null);
    setDropTargetId(null);
  };
  const removalImpact = useQuery({
    queryKey: queryKeys.outlineRemovalImpact(projectId, deleteTarget?.id ?? null),
    queryFn: ({ signal }) =>
      getOutlineRemovalImpact(projectId, deleteTarget!.id, signal),
    enabled: Boolean(deleteTarget),
  });
  const volumeParents = useMemo(
    () => nodes.filter((node) => node.kind === "book" || node.kind === "volume" || node.kind === "arc"),
    [nodes],
  );
  if (story.isPending)
    return <div className="cf-page" role="status">正在打开大纲…</div>;
  if (story.isError)
    return <div className="cf-page"><ResourceErrorState error={story.error} backHref="/books" backLabel="回到作品库" title="找不到这本作品的大纲" description="大纲所属的作品可能已经被移除，或当前链接已经过期。" /></div>;
  return (
    <div className="cf-page cf-outline-page">
      <div className="cf-page-title">
        <div>
          <p className="cf-eyebrow">STORY PLAN</p>
          <h1>大纲</h1>
          <p>把全书、卷和章节放在同一张可继续推进的地图上。</p>
        </div>
        <button className="cf-primary" onClick={() => setCreating(true)}>
          <Plus size={17} /> 新建节点
        </button>
      </div>
      <div className="cf-outline-ai-toggle">
        <button type="button" className="cf-button" onClick={() => setShowAiCandidates((current) => !current)}>
          {showAiCandidates ? "收起 AI 章纲候选" : "打开 AI 章纲候选"}
        </button>
        <small>先生成可比较的章纲修改建议，逐项确认后才会写入大纲。</small>
      </div>
      {error ? <ErrorNote error={error} /> : null}
      {showAiCandidates ? (
        <CanonCandidatePanel
          projectId={projectId}
          spread="outline"
          origin={
            selected
              ? {
                  surface: "outline",
                  documentId: null,
                  outlineNodeId: selected.id,
                  outlineUpdatedAt: selected.updatedAt,
                  canonSpread: "outline",
                  selection: null,
                }
              : null
          }
        />
      ) : null}
      <section className="cf-card cf-outline-quick-form">
        <div><h2>快速记录一个节点</h2><p>先写下章节标题和摘要，后面可以在右侧继续补齐目标与冲突。</p></div>
        <form className="cf-form-grid" onSubmit={(event) => { event.preventDefault(); setQuickStatus(""); quickSave.mutate(); }}>
          <label>类型<select aria-label="类型" value={quickKind} onChange={(event) => setQuickKind(event.target.value as OutlineNode["kind"])}><option value="volume">卷</option><option value="chapter">章节</option><option value="scene">场景</option></select></label>
          <label>标题<input aria-label="标题" required value={quickTitle} onChange={(event) => setQuickTitle(event.target.value)} placeholder="例如：第1章 风起之时" /></label>
          <label>摘要<textarea aria-label="摘要" rows={2} value={quickSummary} onChange={(event) => setQuickSummary(event.target.value)} placeholder="这一节点发生什么？" /></label>
          <div className="cf-quick-form-actions"><button className="cf-primary" disabled={quickSave.isPending || !quickTitle.trim()}>{quickSave.isPending ? "正在保存…" : "保存"}</button>{quickStatus ? <span role="status">{quickStatus}</span> : null}</div>
        </form>
        {nodes.filter((node) => node.kind === "chapter").length ? <label className="cf-quick-select">编辑对象<select aria-label="编辑对象" value={selected?.id ?? ""} onChange={(event) => setSelectedId(event.target.value)}>{nodes.filter((node) => node.kind === "chapter").map((node, index) => <option key={node.id} value={node.id}>第 {index + 1} 章 · {node.title}</option>)}</select></label> : null}
        {selected?.kind === "chapter" ? <Link className="cf-text-link" to={`/books/${projectId}/write?outline=${encodeURIComponent(selected.id)}`}>去写作台写本章</Link> : null}
      </section>
      {selectedNodes.length ? (
        <section className="cf-card cf-outline-batch-toolbar" aria-label="批量操作">
          <div>
            <strong>已选择 {selectedNodes.length} 个节点</strong>
            <p>批量移动会在一次事务中完成；复制只复制规划结构，不复制正文。</p>
          </div>
          <label>目标父节点<select aria-label="批量移动目标" value={resolvedBatchParentId} onChange={(event) => setBatchParentId(event.target.value)}>{batchParentOptions.map((parent) => <option key={parent.id} value={parent.id}>{parent.title} · {kindLabels[parent.kind]}</option>)}</select></label>
          <label>插入位置<input aria-label="批量插入位置" type="number" min={0} value={batchOrdinal} onChange={(event) => setBatchOrdinal(Math.max(0, Number(event.target.value) || 0))} /></label>
          <div className="cf-actions">
            <button type="button" className="cf-button" disabled={batchMove.isPending || !resolvedBatchParentId} onClick={() => batchMove.mutate()}>批量移动</button>
            {selectedNodes.length === 1 ? <button type="button" className="cf-button" disabled={copy.isPending || !resolvedBatchParentId} onClick={() => copy.mutate()}>复制到这里</button> : null}
            <button type="button" className="cf-text-link" onClick={() => setSelectedIds([])}>清空选择</button>
          </div>
        </section>
      ) : null}
      {lastOperation ? (
        <div className="cf-inline-success cf-outline-operation" role="status">
          <span>{lastOperation.operation === "copy" ? "已复制大纲结构。" : "已完成批量移动。"} 如需恢复，可以撤销这次操作。</span>
          <button type="button" className="cf-button" disabled={undo.isPending} onClick={() => undo.mutate()}>{undo.isPending ? "正在恢复…" : "撤销这次操作"}</button>
        </div>
      ) : null}
      <div className="cf-outline-layout">
        <aside className="cf-card cf-outline-tree" aria-label="大纲树">
            <header><strong>故事结构</strong><small>{nodes.length} 个当前节点{hiddenNodeCount ? ` · ${hiddenNodeCount} 个历史节点已保留` : ""}</small></header>
          <div className="cf-outline-scroll">
            {roots.map((node) => (
              <OutlineBranch
                key={node.id}
                node={node}
                nodes={nodes}
                selectedId={selected?.id ?? null}
                selectedIds={selectedIds}
                collapsed={collapsed}
                onSelect={setSelectedId}
                onToggleSelection={(id) => setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])}
                onToggle={(id) => setCollapsed((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])}
                draggedId={draggedId}
                dropTargetId={dropTargetId}
                onDragStart={(id) => { setDraggedId(id); setDropTargetId(null); }}
                onDragEnd={() => { setDraggedId(null); setDropTargetId(null); }}
                onDragOver={(id) => { if (canDrop(draggedId, id)) setDropTargetId(id); }}
                onDragLeave={(id) => setDropTargetId((current) => current === id ? null : current)}
                onDrop={drop}
              />
            ))}
          </div>
          {!roots.length ? <p className="cf-empty-note">还没有大纲节点。先创建一卷或一章。</p> : null}
        </aside>
        <section className="cf-card cf-outline-editor">
          {selected ? (
            <OutlineEditor
              key={selected.id}
              node={selected}
              saving={save.isPending}
              moving={move.isPending}
                siblings={nodes.filter((node) => node.parentId === selected.parentId).sort(byOrdinal)}
                parentOptions={parentOptions}
        entities={entities}
        foreshadows={foreshadows}
        timelines={timelines}
                associating={saveAssociations.isPending}
                onSave={(input) => save.mutate(input)}
                onSaveAssociations={(input) => saveAssociations.mutate({ node: selected, ...input })}
                onMove={(node, ordinal) => move.mutate({ node, ordinal })}
                onMoveParent={(node, parentId) =>
                  move.mutate({
                    node,
                    parentId,
                    ordinal: nodes.filter((item) => item.parentId === parentId).length,
                  })
                }
                onDelete={() => setDeleteTarget(selected)}
              />
          ) : <div className="cf-empty"><FileText size={44} /><h2>选择一个节点开始规划</h2><p>先建立全书结构，再逐章写下目标和冲突。</p></div>}
        </section>
      </div>
      {creating ? (
        <CreateOutlineDialog
          parents={volumeParents}
          pending={create.isPending}
          onCancel={() => setCreating(false)}
          onCreate={(input) => create.mutate(input)}
        />
      ) : null}
      {deleteTarget ? (
        <ConfirmDialog
          title="删除这个大纲节点？"
          confirmLabel="删除节点"
          danger={removalImpact.data?.dispositionIfConfirmed === "deleted"}
          pending={remove.isPending || removalImpact.isPending}
          confirmDisabled={removalImpact.isError || !removalImpact.data}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => remove.mutate(deleteTarget)}
        >
          <p>只处理“{deleteTarget.title}”这个规划节点，不会自动删除已经写好的正文。</p>
          {removalImpact.isPending ? <p role="status">正在检查正文、任务和设定引用…</p> : null}
          {removalImpact.isError ? <ErrorNote error={removalImpact.error} title="无法读取删除影响" /> : null}
          {removalImpact.data ? (
            <div className="cf-outline-removal-impact" role="status">
              <strong>
                {removalImpact.data.dispositionIfConfirmed === "deleted"
                  ? "没有发现引用，确认后会删除节点。"
                  : `发现 ${removalImpact.data.totalReferences} 条引用，确认后只会标记为“已放弃”，不会删除正文。`}
              </strong>
              {removalImpact.data.references.length ? (
                <ul>
                  {removalImpact.data.references.map((reference) => (
                    <li key={`${reference.table}:${reference.column}`}>
                      {reference.label}：{reference.count} 条
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </ConfirmDialog>
      ) : null}
    </div>
  );
}

function OutlineBranch({
  node,
  nodes,
  selectedId,
  selectedIds,
  collapsed,
  onSelect,
  onToggleSelection,
  onToggle,
  draggedId,
  dropTargetId,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  node: OutlineNode;
  nodes: OutlineNode[];
  selectedId: string | null;
  selectedIds: string[];
  collapsed: string[];
  onSelect: (id: string) => void;
  onToggleSelection: (id: string) => void;
  onToggle: (id: string) => void;
  draggedId: string | null;
  dropTargetId: string | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDragOver: (id: string) => void;
  onDragLeave: (id: string) => void;
  onDrop: (id: string) => void;
}) {
  const children = nodes.filter((item) => item.parentId === node.id).sort(byOrdinal);
  const hasChildren = children.length > 0;
  return (
    <div className="cf-outline-branch">
      <div className="cf-outline-row-wrap">
        {node.kind !== "book" ? <input type="checkbox" aria-label={`选择节点：${node.title}`} checked={selectedIds.includes(node.id)} onChange={() => onToggleSelection(node.id)} /> : null}
        <button
          className={`cf-outline-row ${selectedId === node.id ? "is-active" : ""} ${dropTargetId === node.id ? "is-drop-target" : ""} ${draggedId === node.id ? "is-dragging" : ""}`}
          draggable={node.kind !== "book"}
          aria-grabbed={draggedId === node.id}
          onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; onDragStart(node.id); }}
          onDragEnd={onDragEnd}
          onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; onDragOver(node.id); }}
          onDragLeave={() => onDragLeave(node.id)}
          onDrop={(event) => { event.preventDefault(); onDrop(node.id); }}
          onClick={() => onSelect(node.id)}
        >
          {hasChildren ? <span
            className="cf-outline-toggle"
            role="button"
            tabIndex={0}
            aria-expanded={!collapsed.includes(node.id)}
            aria-label={collapsed.includes(node.id) ? "展开" : "收起"}
            onClick={(event) => { event.stopPropagation(); onToggle(node.id); }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              event.stopPropagation();
              onToggle(node.id);
            }}
          >{collapsed.includes(node.id) ? <ChevronRight size={14} /> : <ChevronDown size={14} />}</span> : <span className="cf-outline-spacer" />}
          {node.kind === "chapter" ? <FileText size={14} /> : <Folder size={14} />}
          <span>{node.title}</span><small>{kindLabels[node.kind]}</small>
        </button>
      </div>
      {hasChildren && !collapsed.includes(node.id) ? <div className="cf-outline-children">{children.map((child) => <OutlineBranch key={child.id} node={child} nodes={nodes} selectedId={selectedId} selectedIds={selectedIds} collapsed={collapsed} onSelect={onSelect} onToggleSelection={onToggleSelection} onToggle={onToggle} draggedId={draggedId} dropTargetId={dropTargetId} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} />)}</div> : null}
    </div>
  );
}

function OutlineEditor({
  node,
  siblings,
  parentOptions,
  entities,
  foreshadows,
  timelines,
  associating,
  saving,
  moving,
  onSave,
  onSaveAssociations,
  onMove,
  onMoveParent,
  onDelete,
}: {
  node: OutlineNode;
  siblings: OutlineNode[];
  parentOptions: OutlineNode[];
  entities: CanonEntity[];
  foreshadows: Foreshadow[];
  timelines: TimelineEvent[];
  associating: boolean;
  saving: boolean;
  moving: boolean;
  onSave: (input: Partial<Pick<OutlineNode, "title" | "summary" | "goal" | "conflict" | "outcome" | "status" | "metadata">>) => void;
  onSaveAssociations: (input: { povEntityId: string | null; foreshadowIds: string[]; timelineEventIds: string[] }) => void;
  onMove: (node: OutlineNode, ordinal: number) => void;
  onMoveParent: (node: OutlineNode, parentId: string) => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(node.title);
  const [summary, setSummary] = useState(node.summary ?? "");
  const [goal, setGoal] = useState(node.goal ?? "");
  const [conflict, setConflict] = useState(node.conflict ?? "");
  const [outcome, setOutcome] = useState(node.outcome ?? "");
  const [hook, setHook] = useState(
    typeof node.metadata.hook === "string" ? node.metadata.hook : "",
  );
  const [parentId, setParentId] = useState(node.parentId ?? "");
  const [povEntityId, setPovEntityId] = useState(node.povEntityId ?? "");
  const [foreshadowIds, setForeshadowIds] = useState(() =>
    foreshadows
      .filter((item) => item.evidenceNodeIds.includes(node.id))
      .map((item) => item.id),
  );
  const [timelineIds, setTimelineIds] = useState(() =>
    timelines
      .filter((item) => item.outlineNodeId === node.id)
      .map((item) => item.id),
  );
  const siblingIndex = siblings.findIndex((sibling) => sibling.id === node.id);
  return (
    <form className="cf-outline-form" onSubmit={(event) => { event.preventDefault(); onSave({ title: title.trim(), summary: summary.trim() || null, goal: goal.trim() || null, conflict: conflict.trim() || null, outcome: outcome.trim() || null, metadata: { ...node.metadata, hook: hook.trim() || null } }); }}>
      <div className="cf-outline-editor-head"><div><span className="cf-badge">{kindLabels[node.kind]}</span><h2>{node.title}</h2><small>节点路径：{node.path}</small></div><div className="cf-actions"><button type="button" className="cf-button" disabled={moving || siblingIndex <= 0} onClick={() => onMove(node, siblingIndex - 1)}>上移</button><button type="button" className="cf-button" disabled={moving || siblingIndex < 0 || siblingIndex >= siblings.length - 1} onClick={() => onMove(node, siblingIndex + 1)}>下移</button><button type="button" className="cf-icon-danger" aria-label="删除节点" onClick={onDelete}><Trash2 size={17} /></button></div></div>
      <label>标题<input aria-label="编辑标题" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} required /></label>
      <label>本节点作用<textarea rows={3} value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="这一段故事为什么存在？" /></label>
      <div className="cf-form-grid"><label>目标<textarea rows={4} value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="主角要完成什么？" /></label><label>核心冲突<textarea rows={4} value={conflict} onChange={(event) => setConflict(event.target.value)} placeholder="什么力量阻止他？" /></label></div>
      <label>结果与章尾钩子<textarea rows={4} value={outcome} onChange={(event) => setOutcome(event.target.value)} placeholder="这一节点结束时，故事发生了什么变化？" /></label>
      <label>追踪钩子<input aria-label="追踪钩子" value={hook} onChange={(event) => setHook(event.target.value)} placeholder="供连续创作与联合审阅核对的具体钩子" maxLength={2000} /></label>
      {entities.some((entity) => entity.type === "character") || foreshadows.length || timelines.length ? (
        <section className="cf-outline-associations" aria-label="人物、伏笔与时间线关联">
          {entities.some((entity) => entity.type === "character") ? <label>本节点视角人物<select aria-label="本节点视角人物" value={povEntityId} onChange={(event) => setPovEntityId(event.target.value)}><option value="">暂不指定</option>{entities.filter((entity) => entity.type === "character").map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}</select></label> : <small>还没有人物，可先到作品设定中创建；当前仍可关联伏笔和时间线。</small>}
          <div><strong>关联伏笔</strong>{foreshadows.length ? <div className="cf-outline-association-list">{foreshadows.map((item) => <label key={item.id}><input type="checkbox" checked={foreshadowIds.includes(item.id)} onChange={() => setForeshadowIds((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])} />{item.title}</label>)}</div> : <small>还没有伏笔，可先到作品设定中创建。</small>}</div>
          <div><strong>关联时间线</strong>{timelines.length ? <div className="cf-outline-association-list">{timelines.map((item) => <label key={item.id}><input type="checkbox" checked={timelineIds.includes(item.id)} onChange={() => setTimelineIds((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])} />{item.title}</label>)}</div> : <small>还没有时间线事件，可先到作品设定中创建。</small>}</div>
          <button type="button" className="cf-button" disabled={associating} onClick={() => onSaveAssociations({ povEntityId: povEntityId || null, foreshadowIds, timelineEventIds: timelineIds })}>{associating ? "正在保存关联…" : "保存人物、伏笔与时间线关联"}</button>
        </section>
      ) : null}
      {parentOptions.length ? (
        <div className="cf-outline-parent-move">
          <label>移动到父节点<select aria-label="移动到父节点" value={parentId} onChange={(event) => setParentId(event.target.value)}>{parentOptions.map((parent) => <option key={parent.id} value={parent.id}>{parent.title} · {kindLabels[parent.kind]}</option>)}</select></label>
          <button type="button" className="cf-button" disabled={moving || !parentId || parentId === node.parentId} onClick={() => onMoveParent(node, parentId)}>移动到这里</button>
        </div>
      ) : null}
      <footer><small>最后更新：{new Date(node.updatedAt).toLocaleString("zh-CN")}</small><button className="cf-primary" disabled={saving || !title.trim()}>{saving ? "正在保存…" : "保存大纲"}</button></footer>
    </form>
  );
}

function CreateOutlineDialog({
  parents,
  pending,
  onCancel,
  onCreate,
}: {
  parents: OutlineNode[];
  pending: boolean;
  onCancel: () => void;
  onCreate: (input: { parentId: string; kind: OutlineNode["kind"]; title: string }) => void;
}) {
  const [parentId, setParentId] = useState(parents.find((node) => node.kind === "book")?.id ?? parents[0]?.id ?? "");
  const [kind, setKind] = useState<OutlineNode["kind"]>("chapter");
  const [title, setTitle] = useState("");
  return <div className="cf-modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onCancel(); }}><form className="cf-modal cf-form" onSubmit={(event) => { event.preventDefault(); onCreate({ parentId, kind, title: title.trim() }); }}><h2>新建大纲节点</h2><p>先建立结构，再在右侧补充目标、冲突和结果。</p><label>放在<select value={parentId} onChange={(event) => setParentId(event.target.value)}>{parents.map((node) => <option key={node.id} value={node.id}>{node.title} · {kindLabels[node.kind]}</option>)}</select></label><label>类型<select value={kind} onChange={(event) => setKind(event.target.value as OutlineNode["kind"])}><option value="volume">卷</option><option value="arc">篇章</option><option value="chapter">章节</option><option value="scene">场景</option></select></label><label>标题<input autoFocus required value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} /></label><div className="cf-modal-actions"><button type="button" className="cf-button" onClick={onCancel}>取消</button><button className="cf-primary" disabled={pending || !parentId || !title.trim()}>{pending ? "正在创建…" : "创建节点"}</button></div></form></div>;
}

function byOrdinal(a: OutlineNode, b: OutlineNode) {
  return a.ordinal - b.ordinal || a.createdAt.localeCompare(b.createdAt);
}
