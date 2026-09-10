// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChapterTree } from "../src/features/chapter-tree/chapter-tree";
import type { OutlineNode, StoryDocument } from "../src/shared/api/types";

const root: OutlineNode = {
  id: "book-1",
  projectId: "p-1",
  parentId: null,
  kind: "book",
  path: "book-1",
  depth: 0,
  ordinal: 0,
  title: "潮汐灯塔",
  summary: null,
  goal: null,
  conflict: null,
  outcome: null,
  povEntityId: null,
  storyTime: null,
  status: "planned",
  metadata: {},
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

function chapter(id: string, title: string, ordinal: number): OutlineNode {
  return {
    ...root,
    id,
    parentId: root.id,
    kind: "chapter",
    path: `${root.id}/${id}`,
    depth: 1,
    ordinal,
    title,
    createdAt: `2026-09-01T00:0${ordinal + 1}:00.000Z`,
    updatedAt: `2026-09-01T00:0${ordinal + 1}:00.000Z`,
  };
}

function documentFor(node: OutlineNode): StoryDocument {
  return {
    id: `doc-${node.id}`,
    projectId: node.projectId,
    kind: "chapter",
    title: node.title,
    outlineNodeId: node.id,
    currentVersionId: null,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
  };
}

describe("ChapterTree", () => {
  afterEach(cleanup);

  it("reorders same-volume chapters through drag and drop", () => {
    const first = chapter("chapter-1", "第一章", 0);
    const second = chapter("chapter-2", "第二章", 1);
    const onMove = vi.fn();
    render(
      <MemoryRouter>
        <ChapterTree
          outline={[root, first, second]}
          documents={[documentFor(first), documentFor(second)]}
          projectId="p-1"
          selected={null}
          onSelect={vi.fn()}
          onCreate={vi.fn()}
          onMove={onMove}
        />
      </MemoryRouter>,
    );

    const source = screen.getByRole("button", { name: "第二章" });
    const target = screen.getByRole("button", { name: "第一章" });
    fireEvent.dragStart(source, { dataTransfer: { effectAllowed: "all" } });
    fireEvent.dragOver(target, { dataTransfer: { dropEffect: "move" }, preventDefault: vi.fn() });
    fireEvent.drop(target, { dataTransfer: { dropEffect: "move" }, preventDefault: vi.fn() });

    expect(onMove).toHaveBeenCalledWith(second, root.id, 0);
  });

  it("selects chapters for batch move and archive", () => {
    const first = chapter("chapter-1", "第一章", 0);
    const second = chapter("chapter-2", "第二章", 1);
    const onBatchMove = vi.fn();
    const onBatchArchive = vi.fn();
    render(
      <MemoryRouter>
        <ChapterTree
          outline={[root, first, second]}
          documents={[documentFor(first), documentFor(second)]}
          projectId="p-1"
          selected={documentFor(second).id}
          onSelect={vi.fn()}
          onCreate={vi.fn()}
          onMove={vi.fn()}
          onBatchMove={onBatchMove}
          onBatchArchive={onBatchArchive}
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "选择章节 第一章" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "选择章节 第二章" }));
    fireEvent.click(screen.getByRole("button", { name: "批量移动" }));
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "保存位置" }));

    expect(onBatchMove).toHaveBeenCalledWith([first, second], root.id, 2);
    fireEvent.click(screen.getByRole("button", { name: "批量归档" }));
    expect(onBatchArchive).toHaveBeenCalledWith([documentFor(first), documentFor(second)]);
    expect(screen.getByRole("link", { name: "连续创作" })).toHaveAttribute(
      "href",
      "/books/p-1/quick-create?fromOutline=chapter-2",
    );
  });
});
