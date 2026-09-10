import type { OutlineNode, OutlineStatus } from "@narralume/domain";

import type { NarrativeDatabase } from "./database.js";
import { PersistenceNotFoundError } from "./project-repository.js";
import {
  listForeignKeyReferences,
  totalReferenceCount,
  type ForeignKeyReference,
} from "./reference-inspector.js";

export type OutlineOperationKind = "batch_move" | "copy";

export interface OutlineOperation {
  id: string;
  projectId: string;
  operation: OutlineOperationKind;
  before: OutlineNode[];
  after: OutlineNode[];
  createdAt: string;
  undoneAt: string | null;
}

export interface OutlineBatchMoveItem {
  nodeId: string;
  expectedUpdatedAt: string;
}

export class OutlineOperationError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "OutlineOperationError";
    this.code = code;
  }
}

interface OutlineRow {
  id: string;
  project_id: string;
  parent_id: string | null;
  kind: OutlineNode["kind"];
  path: string;
  depth: number;
  ordinal: number;
  title: string;
  summary: string | null;
  goal: string | null;
  conflict: string | null;
  outcome: string | null;
  pov_entity_id: string | null;
  story_time: string | null;
  status: OutlineStatus;
  metadata_json: string;
  created_at: string;
  updated_at: string;
}

interface OutlineOperationRow {
  id: string;
  project_id: string;
  operation: OutlineOperationKind;
  before_json: string;
  after_json: string;
  created_at: string;
  undone_at: string | null;
}

export interface AuthorIntent {
  projectId: string;
  promise: string | null;
  themes: readonly string[];
  audience: string | null;
  tone: string | null;
  boundaries: readonly string[];
  endingDirection: string | null;
  currentFocus: string | null;
  lockedFields: readonly string[];
  updatedAt: string;
}

export class SqliteStoryRepository {
  constructor(private readonly database: NarrativeDatabase) {}

  insertOutlineNode(node: OutlineNode): OutlineNode {
    if (node.parentId) this.requireOutlineNode(node.projectId, node.parentId);
    this.database.raw
      .prepare(
        `
        INSERT INTO outline_nodes(
          id, project_id, parent_id, kind, path, depth, ordinal, title, summary, goal,
          conflict, outcome, pov_entity_id, story_time, status, metadata_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        node.id,
        node.projectId,
        node.parentId,
        node.kind,
        node.path,
        node.depth,
        node.ordinal,
        node.title,
        node.summary,
        node.goal,
        node.conflict,
        node.outcome,
        node.povEntityId,
        node.storyTime,
        node.status,
        JSON.stringify(node.metadata),
        node.createdAt,
        node.updatedAt,
      );
    return node;
  }

  getOutlineNode(projectId: string, id: string): OutlineNode | null {
    const row = this.database.raw
      .prepare("SELECT * FROM outline_nodes WHERE project_id = ? AND id = ?")
      .get(projectId, id) as OutlineRow | undefined;
    return row ? mapOutline(row) : null;
  }

  requireOutlineNode(projectId: string, id: string): OutlineNode {
    const node = this.getOutlineNode(projectId, id);
    if (!node) throw new PersistenceNotFoundError("outline_node", id);
    return node;
  }

  listOutline(projectId: string): OutlineNode[] {
    const rows = this.database.raw
      .prepare(
        `
        WITH RECURSIVE tree(id, sort_path) AS (
          SELECT id, printf('%08d', ordinal)
          FROM outline_nodes
          WHERE project_id = ? AND parent_id IS NULL
          UNION ALL
          SELECT child.id, tree.sort_path || '.' || printf('%08d', child.ordinal)
          FROM outline_nodes child
          JOIN tree ON child.parent_id = tree.id
          WHERE child.project_id = ?
        )
        SELECT node.* FROM tree JOIN outline_nodes node ON node.id = tree.id
        ORDER BY tree.sort_path
      `,
      )
      .all(projectId, projectId) as unknown as OutlineRow[];
    return rows.map(mapOutline);
  }

  listOutlineChildren(projectId: string, parentId: string): OutlineNode[] {
    const rows = this.database.raw
      .prepare(
        `SELECT * FROM outline_nodes WHERE project_id = ? AND parent_id = ?
         ORDER BY ordinal, created_at`,
      )
      .all(projectId, parentId) as unknown as OutlineRow[];
    return rows.map(mapOutline);
  }

  updateOutlineDetails(
    projectId: string,
    id: string,
    patch: Partial<
      Pick<
        OutlineNode,
        | "title"
        | "summary"
        | "goal"
        | "conflict"
        | "outcome"
        | "povEntityId"
        | "storyTime"
        | "metadata"
      >
    >,
    updatedAt: string,
  ): OutlineNode {
    const current = this.requireOutlineNode(projectId, id);
    const next = { ...current, ...patch, updatedAt };
    this.database.raw
      .prepare(
        `UPDATE outline_nodes SET title = ?, summary = ?, goal = ?, conflict = ?,
           outcome = ?, pov_entity_id = ?, story_time = ?, metadata_json = ?,
           updated_at = ? WHERE project_id = ? AND id = ?`,
      )
      .run(
        next.title,
        next.summary,
        next.goal,
        next.conflict,
        next.outcome,
        next.povEntityId,
        next.storyTime,
        JSON.stringify(next.metadata),
        updatedAt,
        projectId,
        id,
      );
    return this.requireOutlineNode(projectId, id);
  }

  updateOutlineStatus(
    projectId: string,
    id: string,
    status: OutlineStatus,
    updatedAt: string,
  ): OutlineNode {
    const result = this.database.raw
      .prepare(
        "UPDATE outline_nodes SET status = ?, updated_at = ? WHERE project_id = ? AND id = ?",
      )
      .run(status, updatedAt, projectId, id);
    if (result.changes !== 1)
      throw new PersistenceNotFoundError("outline_node", id);
    return this.requireOutlineNode(projectId, id);
  }

  moveOutlineNode(
    projectId: string,
    id: string,
    parentId: string | null,
    ordinal: number,
    updatedAt: string,
  ): OutlineNode {
    const current = this.requireOutlineNode(projectId, id);
    const siblings = (parentId === null
      ? this.database.raw
          .prepare(
            "SELECT * FROM outline_nodes WHERE project_id = ? AND parent_id IS NULL ORDER BY ordinal, created_at",
          )
          .all(projectId)
      : this.database.raw
          .prepare(
            "SELECT * FROM outline_nodes WHERE project_id = ? AND parent_id = ? ORDER BY ordinal, created_at",
          )
          .all(projectId, parentId)) as unknown as OutlineRow[];
    const ordered = siblings.filter((item) => item.id !== id);
    const targetOrdinal = Math.max(0, Math.min(ordinal, ordered.length));
    const temporaryBase = 1_000_000_000;
    this.database.raw
      .prepare(
        "UPDATE outline_nodes SET ordinal = ? WHERE project_id = ? AND id = ?",
      )
      .run(temporaryBase, projectId, id);
    for (const [index, sibling] of ordered.entries()) {
      this.database.raw
        .prepare(
          "UPDATE outline_nodes SET ordinal = ? WHERE project_id = ? AND id = ?",
        )
        .run(temporaryBase + index + 1, projectId, sibling.id);
    }
    let nextOrdinal = 0;
    for (const sibling of ordered) {
      if (nextOrdinal === targetOrdinal) nextOrdinal += 1;
      this.database.raw
        .prepare(
          "UPDATE outline_nodes SET ordinal = ?, updated_at = ? WHERE project_id = ? AND id = ?",
        )
        .run(nextOrdinal, updatedAt, projectId, sibling.id);
      nextOrdinal += 1;
    }
    const parent = parentId
      ? this.requireOutlineNode(projectId, parentId)
      : null;
    const nextDepth = (parent?.depth ?? -1) + 1;
    const nextPath = parent ? `${parent.path}/${id}` : `/${id}`;
    this.database.raw
      .prepare(
        `UPDATE outline_nodes SET parent_id = ?, path = ?, depth = ?, ordinal = ?, updated_at = ?
         WHERE project_id = ? AND id = ?`,
      )
      .run(
        parentId,
        nextPath,
        nextDepth,
        targetOrdinal,
        updatedAt,
        projectId,
        id,
      );
    if (current.path !== nextPath || current.depth !== nextDepth) {
      this.database.raw
        .prepare(
          `UPDATE outline_nodes
           SET path = ? || substr(path, ?), depth = depth + ?
           WHERE project_id = ? AND path LIKE ?`,
        )
        .run(
          nextPath,
          current.path.length + 1,
          nextDepth - current.depth,
          projectId,
          `${current.path}/%`,
        );
    }
    return this.requireOutlineNode(projectId, id);
  }

  /**
   * Move several independent roots as one structural transaction. The method
   * stores the sibling order and every moved descendant before and after the
   * change, so a later undo can restore paths without touching manuscript
   * content or canon fields.
   */
  batchMoveOutlineNodes(
    projectId: string,
    items: readonly OutlineBatchMoveItem[],
    parentId: string,
    ordinal: number,
    operationId: string,
    now: string,
  ): OutlineOperation {
    return this.database.transaction(() => {
      const all = this.listOutline(projectId);
      const byId = new Map(all.map((node) => [node.id, node]));
      const selectedIds = [...new Set(items.map((item) => item.nodeId))];
      if (selectedIds.length !== items.length)
        throw new OutlineOperationError(
          "outline.batch.duplicate",
          "The same outline node was selected more than once",
        );
      const selected = selectedIds.map((id) => {
        const node = byId.get(id);
        if (!node) {
          throw new OutlineOperationError(
            "outline.not_found",
            "One or more selected outline nodes no longer exist",
          );
        }
        const expected = items.find(
          (item) => item.nodeId === id,
        )!.expectedUpdatedAt;
        if (node.updatedAt !== expected)
          throw new OutlineOperationError(
            "outline.version.conflict",
            "One or more selected outline nodes changed; refresh before moving them",
          );
        if (node.kind === "book" || !node.parentId)
          throw new OutlineOperationError(
            "outline.root.protected",
            "The book root node cannot be moved",
          );
        return node;
      });
      const destination = byId.get(parentId);
      if (!destination)
        throw new OutlineOperationError(
          "outline.parent.required",
          "The destination parent no longer exists",
        );
      const selectedSet = new Set(selectedIds);
      if (
        selected.some(
          (node) =>
            destination.id === node.id ||
            destination.path.startsWith(`${node.path}/`),
        )
      )
        throw new OutlineOperationError(
          "outline.parent.invalid",
          "An outline node cannot be moved inside itself",
        );
      const allowedChildren: Record<
        OutlineNode["kind"],
        readonly OutlineNode["kind"][]
      > = {
        book: ["volume", "arc", "chapter"],
        volume: ["arc", "chapter"],
        arc: ["chapter", "scene"],
        chapter: ["scene", "beat"],
        scene: ["beat"],
        beat: [],
      };
      if (
        selected.some(
          (node) => !allowedChildren[destination.kind].includes(node.kind),
        )
      )
        throw new OutlineOperationError(
          "outline.parent.invalid_kind",
          "At least one selected node cannot be placed under that parent",
        );
      for (const node of selected) {
        if (
          selected.some(
            (other) =>
              other.id !== node.id && other.path.startsWith(`${node.path}/`),
          )
        )
          throw new OutlineOperationError(
            "outline.batch.ancestor_conflict",
            "Select a node or its descendants, not both",
          );
      }

      const affectedParentIds = new Set<string | null>([
        ...selected.map((node) => node.parentId),
        destination.id,
      ]);
      const groups = new Map<string | null, OutlineNode[]>();
      for (const parent of affectedParentIds) {
        groups.set(
          parent,
          all
            .filter((node) => node.parentId === parent)
            .sort(
              (left, right) =>
                left.ordinal - right.ordinal ||
                left.createdAt.localeCompare(right.createdAt),
            ),
        );
      }
      const beforeIds = new Set<string>();
      for (const group of groups.values())
        for (const node of group) beforeIds.add(node.id);
      for (const node of selected) {
        for (const descendant of all) {
          if (descendant.path.startsWith(`${node.path}/`))
            beforeIds.add(descendant.id);
        }
      }
      const before = all
        .filter((node) => beforeIds.has(node.id))
        .map(cloneOutline);
      // Clear the existing unique ordinal slots before the in-memory groups
      // are changed. Selected nodes still physically belong to their old
      // parent at this point, even though they will be inserted into the
      // destination group below.
      const temporaryBase = 1_000_000_000;
      for (const group of groups.values()) {
        for (const [index, node] of group.entries()) {
          this.database.raw
            .prepare(
              "UPDATE outline_nodes SET ordinal = ? WHERE project_id = ? AND id = ?",
            )
            .run(temporaryBase + index, projectId, node.id);
        }
      }
      for (const [parent, group] of groups) {
        groups.set(
          parent,
          group.filter((node) => !selectedSet.has(node.id)),
        );
      }
      const destinationGroup = groups.get(destination.id)!;
      const orderedSelected = [...selected].sort((left, right) => {
        const leftIndex = all.indexOf(left);
        const rightIndex = all.indexOf(right);
        return leftIndex - rightIndex;
      });
      const insertion = Math.max(0, Math.min(ordinal, destinationGroup.length));
      destinationGroup.splice(insertion, 0, ...orderedSelected);

      // Update all affected sibling ordinals and parent/path fields. The
      // temporary ordinal avoids UNIQUE(project_id,parent_id,ordinal) while
      // groups are being rearranged.
      const selectedNextPath = new Map<
        string,
        { path: string; depth: number }
      >();
      for (const [index, node] of destinationGroup.entries()) {
        const targetParent = destination.id;
        if (selectedSet.has(node.id)) {
          const nextDepth = destination.depth + 1;
          selectedNextPath.set(node.id, {
            path: `${destination.path}/${node.id}`,
            depth: nextDepth,
          });
          this.database.raw
            .prepare(
              "UPDATE outline_nodes SET parent_id = ?, path = ?, depth = ?, ordinal = ?, updated_at = ? WHERE project_id = ? AND id = ?",
            )
            .run(
              targetParent,
              `${destination.path}/${node.id}`,
              nextDepth,
              index,
              now,
              projectId,
              node.id,
            );
        } else {
          this.database.raw
            .prepare(
              "UPDATE outline_nodes SET ordinal = ?, updated_at = ? WHERE project_id = ? AND id = ?",
            )
            .run(index, now, projectId, node.id);
        }
      }
      for (const [parent, group] of groups) {
        if (parent === destination.id) continue;
        for (const [index, node] of group.entries()) {
          this.database.raw
            .prepare(
              "UPDATE outline_nodes SET ordinal = ?, updated_at = ? WHERE project_id = ? AND id = ?",
            )
            .run(index, now, projectId, node.id);
        }
      }
      for (const node of selected) {
        const next = selectedNextPath.get(node.id)!;
        for (const descendant of all) {
          if (!descendant.path.startsWith(`${node.path}/`)) continue;
          const suffix = descendant.path.slice(node.path.length);
          this.database.raw
            .prepare(
              "UPDATE outline_nodes SET path = ?, depth = ?, updated_at = ? WHERE project_id = ? AND id = ?",
            )
            .run(
              `${next.path}${suffix}`,
              descendant.depth + next.depth - node.depth,
              now,
              projectId,
              descendant.id,
            );
        }
      }
      const afterAll = this.listOutline(projectId);
      const after = afterAll
        .filter((node) => beforeIds.has(node.id))
        .map(cloneOutline);
      const operation = {
        id: operationId,
        projectId,
        operation: "batch_move" as const,
        before,
        after,
        createdAt: now,
        undoneAt: null,
      };
      this.insertOutlineOperation(operation);
      return operation;
    });
  }

  /** Copy a node and its complete outline subtree. Manuscript documents are
   * intentionally not duplicated: a copied plan starts without a second
   * document bound to the same source text. */
  copyOutlineSubtree(
    projectId: string,
    sourceId: string,
    parentId: string,
    ordinal: number,
    expectedUpdatedAt: string,
    operationId: string,
    now: string,
    createId: () => string,
  ): { operation: OutlineOperation; root: OutlineNode } {
    return this.database.transaction(() => {
      const all = this.listOutline(projectId);
      const source = all.find((node) => node.id === sourceId);
      const parent = all.find((node) => node.id === parentId);
      if (!source)
        throw new OutlineOperationError(
          "outline.not_found",
          "The source outline node no longer exists",
        );
      if (!parent)
        throw new OutlineOperationError(
          "outline.parent.required",
          "The destination parent no longer exists",
        );
      if (source.updatedAt !== expectedUpdatedAt)
        throw new OutlineOperationError(
          "outline.version.conflict",
          "The source outline node changed; refresh before copying",
        );
      if (
        source.kind === "book" ||
        parent.path.startsWith(`${source.path}/`) ||
        parent.id === source.id
      )
        throw new OutlineOperationError(
          "outline.parent.invalid",
          "An outline node cannot be copied inside itself",
        );
      const allowedChildren: Record<
        OutlineNode["kind"],
        readonly OutlineNode["kind"][]
      > = {
        book: ["volume", "arc", "chapter"],
        volume: ["arc", "chapter"],
        arc: ["chapter", "scene"],
        chapter: ["scene", "beat"],
        scene: ["beat"],
        beat: [],
      };
      if (!allowedChildren[parent.kind].includes(source.kind))
        throw new OutlineOperationError(
          "outline.parent.invalid_kind",
          `Cannot copy ${source.kind} under ${parent.kind}`,
        );
      const subtree = all.filter(
        (node) =>
          node.id === source.id || node.path.startsWith(`${source.path}/`),
      );
      const mapping = new Map<string, string>(
        subtree.map((node) => [node.id, createId()]),
      );
      const destinationSiblings = all
        .filter((node) => node.parentId === parent.id)
        .sort(
          (left, right) =>
            left.ordinal - right.ordinal ||
            left.createdAt.localeCompare(right.createdAt),
        );
      const insertAt = Math.max(
        0,
        Math.min(ordinal, destinationSiblings.length),
      );
      // Existing destination siblings shift by one ordinal, therefore they
      // are part of the undo snapshot even though their paths do not change.
      const before: OutlineNode[] = destinationSiblings.map(cloneOutline);
      const copied: OutlineNode[] = [];
      const newRootId = mapping.get(source.id)!;
      for (const node of subtree.sort(
        (left, right) =>
          left.depth - right.depth || left.ordinal - right.ordinal,
      )) {
        const mappedId = mapping.get(node.id)!;
        const mappedParentId =
          node.id === source.id ? parent.id : mapping.get(node.parentId!);
        const mappedParent =
          node.id === source.id
            ? parent
            : copied.find((candidate) => candidate.id === mappedParentId)!;
        const siblingOrdinal = node.id === source.id ? insertAt : node.ordinal;
        const created: OutlineNode = {
          ...cloneOutline(node),
          id: mappedId,
          parentId: mappedParentId!,
          path: `${mappedParent.path}/${mappedId}`,
          depth: mappedParent.depth + 1,
          ordinal: siblingOrdinal,
          title: node.id === source.id ? `${node.title}（副本）` : node.title,
          status: "planned",
          createdAt: now,
          updatedAt: now,
        };
        this.insertOutlineNode(created);
        copied.push(created);
      }
      // Normalize the destination sibling ordinals after the insert. Child
      // groups keep their source order; every generated path is independent.
      const rootCopy = copied[0]!;
      const allDestination = [
        ...destinationSiblings.slice(0, insertAt),
        rootCopy,
        ...destinationSiblings.slice(insertAt),
      ];
      for (const [index, sibling] of allDestination.entries()) {
        this.database.raw
          .prepare(
            "UPDATE outline_nodes SET ordinal = ?, updated_at = ? WHERE project_id = ? AND id = ?",
          )
          .run(index, now, projectId, sibling.id);
        if (sibling.id === rootCopy.id)
          copied[0] = { ...rootCopy, ordinal: index, updatedAt: now };
      }
      const after = [
        ...allDestination.map((sibling) =>
          this.requireOutlineNode(projectId, sibling.id),
        ),
        ...copied.slice(1),
      ].map(cloneOutline);
      const operation: OutlineOperation = {
        id: operationId,
        projectId,
        operation: "copy",
        before,
        after,
        createdAt: now,
        undoneAt: null,
      };
      this.insertOutlineOperation(operation);
      return { operation, root: this.requireOutlineNode(projectId, newRootId) };
    });
  }

  getOutlineOperation(
    projectId: string,
    operationId: string,
  ): OutlineOperation | null {
    const row = this.database.raw
      .prepare(
        "SELECT * FROM outline_operations WHERE project_id = ? AND id = ?",
      )
      .get(projectId, operationId) as OutlineOperationRow | undefined;
    return row ? mapOutlineOperation(row) : null;
  }

  undoOutlineOperation(
    projectId: string,
    operationId: string,
    expectedUpdatedAtByNode: Readonly<Record<string, string>> | undefined,
    now: string,
  ): OutlineOperation {
    return this.database.transaction(() => {
      const operation = this.getOutlineOperation(projectId, operationId);
      if (!operation)
        throw new OutlineOperationError(
          "outline.operation.not_found",
          "The outline operation no longer exists",
        );
      if (operation.undoneAt)
        throw new OutlineOperationError(
          "outline.operation.already_undone",
          "This outline operation has already been undone",
        );
      const expected =
        expectedUpdatedAtByNode ??
        Object.fromEntries(
          operation.after.map((node) => [node.id, node.updatedAt]),
        );
      for (const after of operation.after) {
        const current = this.getOutlineNode(projectId, after.id);
        if (!current || current.updatedAt !== expected[after.id])
          throw new OutlineOperationError(
            "outline.operation.version.conflict",
            "The outline changed after this operation; refresh before undoing",
          );
      }
      if (operation.operation === "copy") {
        const beforeIds = new Set(operation.before.map((node) => node.id));
        const copiedIds = operation.after
          .filter((node) => !beforeIds.has(node.id))
          .map((node) => node.id);
        for (const node of operation.after.filter((item) =>
          copiedIds.includes(item.id),
        )) {
          if (this.countOutlineReferences(node.id) > 0)
            throw new OutlineOperationError(
              "outline.operation.references",
              "The copied node is already referenced; remove those references before undoing",
            );
        }
        if (copiedIds.length) {
          this.database.raw
            .prepare(
              `DELETE FROM outline_nodes WHERE project_id = ? AND id IN (${copiedIds.map(() => "?").join(",")})`,
            )
            .run(projectId, ...copiedIds);
        }
        const temporaryBase = 1_000_000_000;
        for (const [index, before] of operation.before.entries()) {
          this.database.raw
            .prepare(
              "UPDATE outline_nodes SET ordinal = ? WHERE project_id = ? AND id = ?",
            )
            .run(temporaryBase + index, projectId, before.id);
        }
        for (const before of operation.before) {
          this.database.raw
            .prepare(
              "UPDATE outline_nodes SET parent_id = ?, path = ?, depth = ?, ordinal = ?, updated_at = ? WHERE project_id = ? AND id = ?",
            )
            .run(
              before.parentId,
              before.path,
              before.depth,
              before.ordinal,
              now,
              projectId,
              before.id,
            );
        }
      } else {
        const temporaryBase = 1_000_000_000;
        for (const [index, before] of operation.before.entries()) {
          this.database.raw
            .prepare(
              "UPDATE outline_nodes SET ordinal = ?, path = ? WHERE project_id = ? AND id = ?",
            )
            .run(
              temporaryBase + index,
              `undo:${operationId}:${before.id}`,
              projectId,
              before.id,
            );
        }
        for (const before of operation.before) {
          const current = this.getOutlineNode(projectId, before.id);
          if (!current)
            throw new OutlineOperationError(
              "outline.operation.source_missing",
              "A node needed to restore the outline no longer exists",
            );
          this.database.raw
            .prepare(
              "UPDATE outline_nodes SET parent_id = ?, path = ?, depth = ?, ordinal = ?, updated_at = ? WHERE project_id = ? AND id = ?",
            )
            .run(
              before.parentId,
              before.path,
              before.depth,
              before.ordinal,
              now,
              projectId,
              before.id,
            );
        }
      }
      this.database.raw
        .prepare(
          "UPDATE outline_operations SET undone_at = ? WHERE project_id = ? AND id = ?",
        )
        .run(now, projectId, operationId);
      return { ...operation, undoneAt: now };
    });
  }

  private insertOutlineOperation(operation: OutlineOperation): void {
    this.database.raw
      .prepare(
        "INSERT INTO outline_operations(id, project_id, operation, before_json, after_json, created_at, undone_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        operation.id,
        operation.projectId,
        operation.operation,
        JSON.stringify(operation.before),
        JSON.stringify(operation.after),
        operation.createdAt,
        operation.undoneAt,
      );
  }

  countOutlineReferences(id: string): number {
    return totalReferenceCount(this.database, "outline_nodes", id);
  }

  listOutlineReferences(id: string): ForeignKeyReference[] {
    return listForeignKeyReferences(this.database, "outline_nodes", id);
  }

  deleteOutlineNode(projectId: string, id: string): boolean {
    return (
      this.database.raw
        .prepare("DELETE FROM outline_nodes WHERE project_id = ? AND id = ?")
        .run(projectId, id).changes === 1
    );
  }

  upsertAuthorIntent(intent: AuthorIntent): AuthorIntent {
    this.database.raw
      .prepare(
        `
        INSERT INTO author_intents(
          project_id, promise, themes_json, audience, tone, boundaries_json,
          ending_direction, current_focus, locked_fields_json, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(project_id) DO UPDATE SET
          promise = excluded.promise,
          themes_json = excluded.themes_json,
          audience = excluded.audience,
          tone = excluded.tone,
          boundaries_json = excluded.boundaries_json,
          ending_direction = excluded.ending_direction,
          current_focus = excluded.current_focus,
          locked_fields_json = excluded.locked_fields_json,
          updated_at = excluded.updated_at
      `,
      )
      .run(
        intent.projectId,
        intent.promise,
        JSON.stringify(intent.themes),
        intent.audience,
        intent.tone,
        JSON.stringify(intent.boundaries),
        intent.endingDirection,
        intent.currentFocus,
        JSON.stringify(intent.lockedFields),
        intent.updatedAt,
      );
    return intent;
  }

  getAuthorIntent(projectId: string): AuthorIntent | null {
    const row = this.database.raw
      .prepare("SELECT * FROM author_intents WHERE project_id = ?")
      .get(projectId) as
      | {
          project_id: string;
          promise: string | null;
          themes_json: string;
          audience: string | null;
          tone: string | null;
          boundaries_json: string;
          ending_direction: string | null;
          current_focus: string | null;
          locked_fields_json: string;
          updated_at: string;
        }
      | undefined;
    return row
      ? {
          projectId: row.project_id,
          promise: row.promise,
          themes: parseStringArray(row.themes_json),
          audience: row.audience,
          tone: row.tone,
          boundaries: parseStringArray(row.boundaries_json),
          endingDirection: row.ending_direction,
          currentFocus: row.current_focus,
          lockedFields: parseStringArray(row.locked_fields_json),
          updatedAt: row.updated_at,
        }
      : null;
  }
}

function mapOutline(row: OutlineRow): OutlineNode {
  return {
    id: row.id,
    projectId: row.project_id,
    parentId: row.parent_id,
    kind: row.kind,
    path: row.path,
    depth: row.depth,
    ordinal: row.ordinal,
    title: row.title,
    summary: row.summary,
    goal: row.goal,
    conflict: row.conflict,
    outcome: row.outcome,
    povEntityId: row.pov_entity_id,
    storyTime: row.story_time,
    status: row.status,
    metadata: parseObject(row.metadata_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function cloneOutline(node: OutlineNode): OutlineNode {
  return { ...node, metadata: { ...node.metadata } };
}

function mapOutlineOperation(row: OutlineOperationRow): OutlineOperation {
  return {
    id: row.id,
    projectId: row.project_id,
    operation: row.operation,
    before: parseOutlineSnapshots(row.before_json),
    after: parseOutlineSnapshots(row.after_json),
    createdAt: row.created_at,
    undoneAt: row.undone_at,
  };
}

function parseOutlineSnapshots(value: string): OutlineNode[] {
  const parsed = JSON.parse(value) as OutlineNode[];
  return parsed.map(cloneOutline);
}

function parseStringArray(value: string): string[] {
  const parsed = JSON.parse(value) as unknown;
  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === "string")
    : [];
}

function parseObject(value: string): Record<string, unknown> {
  const parsed = JSON.parse(value) as unknown;
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}
