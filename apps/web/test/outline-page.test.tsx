// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLocale } from "../src/i18n";
import { OutlinePage } from "../src/pages/outline/outline-page";

const root = {
  id: "root-1",
  projectId: "p-1",
  parentId: null,
  kind: "book",
  path: "root-1",
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
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
} as const;

const chapter = {
  ...root,
  id: "chapter-1",
  parentId: root.id,
  kind: "chapter",
  path: "root-1/chapter-1",
  depth: 1,
  ordinal: 0,
  title: "会被引用的章节",
  updatedAt: "2026-08-01T00:01:00.000Z",
} as const;

const chapterTwo = {
  ...chapter,
  id: "chapter-2",
  path: "root-1/chapter-2",
  ordinal: 1,
  title: "第二章",
  updatedAt: "2026-08-01T00:02:00.000Z",
} as const;

function json(value: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(value), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
}

describe("native outline removal impact", () => {
  beforeEach(() => setLocale("zh-CN"));
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows references and protects the confirm action until the preview loads", async () => {
    const story = {
      project: { id: "p-1", title: "潮汐灯塔" },
      outline: [root, chapter],
      entities: [],
      facts: [],
      relationships: [],
      timeline: [],
      foreshadows: [],
      documents: [],
    };
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/projects/p-1/story-bible") return json(story);
      if (url === "/api/projects/p-1/outline/chapter-1/removal-impact") {
        return json({
          id: chapter.id,
          title: chapter.title,
          kind: chapter.kind,
          references: [
            {
              table: "documents",
              column: "outline_node_id",
              label: "正文绑定",
              count: 1,
            },
          ],
          totalReferences: 1,
          canDelete: false,
          dispositionIfConfirmed: "abandoned",
        });
      }
      if (init?.method === "DELETE" && url === "/api/projects/p-1/outline/chapter-1") {
        return json({ id: chapter.id, disposition: "abandoned", references: 1 });
      }
      throw new Error(`unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/books/p-1/outline"]}>
          <Routes>
            <Route path="/books/:projectId/outline" element={<OutlinePage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await screen.findByRole("heading", { name: "大纲" });
    fireEvent.click(screen.getByRole("button", { name: "删除节点" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(await within(dialog).findByText(/发现 1 条引用/)).toBeInTheDocument();
    expect(within(dialog).getByText(/正文绑定：1 条/)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "删除节点" })).not.toBeDisabled();

    fireEvent.click(within(dialog).getByRole("button", { name: "删除节点" }));
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([url, request]) =>
            String(url) === "/api/projects/p-1/outline/chapter-1" &&
            (request as RequestInit | undefined)?.method === "DELETE",
        ),
      ).toBe(true);
    });
  });

  it("moves an outline sibling through the guarded native action", async () => {
    const story = {
      project: { id: "p-1", title: "潮汐灯塔" },
      outline: [root, chapter, chapterTwo],
      entities: [], facts: [], relationships: [], timeline: [], foreshadows: [], documents: [],
    };
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/projects/p-1/story-bible") return json(story);
      if (url === "/api/projects/p-1/outline/chapter-2/move" && init?.method === "POST") {
        return json({ ...chapterTwo, ordinal: 0 });
      }
      throw new Error(`unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/books/p-1/outline"]}>
          <Routes>
            <Route path="/books/:projectId/outline" element={<OutlinePage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await screen.findByRole("heading", { name: "大纲" });
    fireEvent.click(screen.getByRole("button", { name: /第二章/ }));
    fireEvent.click(screen.getByRole("button", { name: "上移" }));
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([url, request]) => String(url) === "/api/projects/p-1/outline/chapter-2/move" && (request as RequestInit | undefined)?.method === "POST",
      );
      expect(call).toBeDefined();
      expect(JSON.parse(String((call?.[1] as RequestInit).body))).toMatchObject({ parentId: "root-1", ordinal: 0 });
    });
  });

  it("reorders outline siblings through native drag and drop", async () => {
    const story = {
      project: { id: "p-1", title: "潮汐灯塔" },
      outline: [root, chapter, chapterTwo],
      entities: [], facts: [], relationships: [], timeline: [], foreshadows: [], documents: [],
    };
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/projects/p-1/story-bible") return json(story);
      if (url === "/api/projects/p-1/outline/chapter-2/move" && init?.method === "POST") {
        return json({ ...chapterTwo, ordinal: 0 });
      }
      throw new Error(`unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/books/p-1/outline"]}>
          <Routes>
            <Route path="/books/:projectId/outline" element={<OutlinePage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await screen.findByRole("heading", { name: "大纲" });
    const source = screen.getByRole("button", { name: /第二章/ });
    const target = screen.getByRole("button", { name: /会被引用的章节/ });
    fireEvent.dragStart(source, { dataTransfer: { effectAllowed: "all", dropEffect: "none" } });
    fireEvent.dragOver(target, { dataTransfer: { dropEffect: "move" }, preventDefault: vi.fn() });
    fireEvent.drop(target, { dataTransfer: { dropEffect: "move" }, preventDefault: vi.fn() });
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([url, request]) => String(url) === "/api/projects/p-1/outline/chapter-2/move" && (request as RequestInit | undefined)?.method === "POST",
      );
      expect(call).toBeDefined();
      expect(JSON.parse(String((call?.[1] as RequestInit).body))).toMatchObject({
        parentId: "root-1",
        ordinal: 0,
        expectedUpdatedAt: chapterTwo.updatedAt,
      });
    });
  });

  it("moves a chapter into a compatible parent through native drag and drop", async () => {
    const volume = {
      ...root,
      id: "volume-1",
      parentId: root.id,
      kind: "volume",
      path: "root-1/volume-1",
      title: "第一卷",
      updatedAt: "2026-08-01T00:01:00.000Z",
    } as const;
    const movableChapter = {
      ...chapter,
      id: "chapter-move",
      path: "root-1/chapter-move",
      title: "待归卷章节",
      ordinal: 0,
      updatedAt: "2026-08-01T00:02:00.000Z",
    } as const;
    const story = {
      project: { id: "p-1", title: "潮汐灯塔" },
      outline: [root, volume, movableChapter],
      entities: [], facts: [], relationships: [], timeline: [], foreshadows: [], documents: [],
    };
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/projects/p-1/story-bible") return json(story);
      if (url === "/api/projects/p-1/outline/chapter-move/move" && init?.method === "POST") {
        return json({ ...movableChapter, parentId: volume.id, path: `${volume.path}/${movableChapter.id}` });
      }
      throw new Error(`unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/books/p-1/outline"]}>
          <Routes>
            <Route path="/books/:projectId/outline" element={<OutlinePage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await screen.findByRole("heading", { name: "大纲" });
    const source = screen.getByRole("button", { name: /待归卷章节/ });
    const target = screen.getByRole("button", { name: /第一卷/ });
    fireEvent.dragStart(source, { dataTransfer: { effectAllowed: "all", dropEffect: "none" } });
    fireEvent.dragOver(target, { dataTransfer: { dropEffect: "move" }, preventDefault: vi.fn() });
    fireEvent.drop(target, { dataTransfer: { dropEffect: "move" }, preventDefault: vi.fn() });
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([url, request]) => String(url) === "/api/projects/p-1/outline/chapter-move/move" && (request as RequestInit | undefined)?.method === "POST",
      );
      expect(call).toBeDefined();
      expect(JSON.parse(String((call?.[1] as RequestInit).body))).toMatchObject({
        parentId: volume.id,
        ordinal: 0,
        expectedUpdatedAt: movableChapter.updatedAt,
      });
    });
  });

  it("saves a chapter POV character and foreshadow links from the native editor", async () => {
    const character = { id: "entity-1", projectId: "p-1", type: "character", name: "林昼", aliases: [], description: "主角", attributes: {}, status: "active", createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" };
    const foreshadow = { id: "foreshadow-1", projectId: "p-1", title: "第三下钟声", description: "灯塔的线索", status: "planned", importance: 4, targetFromNodeId: null, targetToNodeId: null, dependencies: [], evidenceNodeIds: [], resolutionNodeId: null, createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" };
    const timeline = { id: "timeline-1", projectId: "p-1", title: "潮声退去", description: "港口失去潮汐", outlineNodeId: null, storyTimeStart: null, storyTimeEnd: null, sequence: 0, participants: [], causes: [], visibility: "reader", sourceId: null, createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" };
    const story = { project: { id: "p-1", title: "潮汐灯塔" }, outline: [root, chapter], entities: [character], facts: [], relationships: [], timeline: [timeline], foreshadows: [foreshadow], documents: [] };
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/projects/p-1/story-bible") return json(story);
      if (url === "/api/projects/p-1/outline/chapter-1/associations" && init?.method === "PUT") {
        return json({ node: { ...chapter, povEntityId: character.id, updatedAt: "2026-08-01T00:03:00.000Z" }, foreshadows: [{ ...foreshadow, evidenceNodeIds: [chapter.id] }], timelines: [{ ...timeline, outlineNodeId: chapter.id }] });
      }
      throw new Error(`unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/books/p-1/outline"]}><Routes><Route path="/books/:projectId/outline" element={<OutlinePage />} /></Routes></MemoryRouter></QueryClientProvider>);
    await screen.findByRole("heading", { name: "大纲" });
    fireEvent.click(screen.getByRole("button", { name: /会被引用的章节/ }));
    fireEvent.change(screen.getByRole("combobox", { name: "本节点视角人物" }), { target: { value: character.id } });
    fireEvent.click(screen.getByRole("checkbox", { name: "第三下钟声" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "潮声退去" }));
    fireEvent.click(screen.getByRole("button", { name: "保存人物、伏笔与时间线关联" }));
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([request, options]) => String(request).endsWith("/outline/chapter-1/associations") && (options as RequestInit | undefined)?.method === "PUT");
      expect(call).toBeDefined();
      expect(JSON.parse(String((call?.[1] as RequestInit).body))).toMatchObject({ povEntityId: character.id, foreshadowIds: [foreshadow.id], timelineEventIds: [timeline.id], expectedUpdatedAt: chapter.updatedAt, expectedForeshadowUpdatedAt: { [foreshadow.id]: foreshadow.updatedAt }, expectedTimelineUpdatedAt: { [timeline.id]: timeline.updatedAt } });
    });
  });

  it("opens the outline candidate desk inside the native outline page", async () => {
    const story = {
      project: { id: "p-1", title: "潮汐灯塔" },
      outline: [root, chapter],
      entities: [],
      facts: [],
      relationships: [],
      timeline: [],
      foreshadows: [],
      documents: [],
    };
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/projects/p-1/story-bible") return json(story);
      if (url === "/api/projects/p-1/canon-spreads/outline/candidates") return json([]);
      if (url === "/api/projects/p-1/runs") return json([]);
      throw new Error(`unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/books/p-1/outline"]}>
          <Routes>
            <Route path="/books/:projectId/outline" element={<OutlinePage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await screen.findByRole("heading", { name: "大纲" });
    expect(screen.queryByLabelText("设定修改说明")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "打开 AI 章纲候选" }));
    expect(await screen.findByLabelText("设定修改说明")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/p-1/canon-spreads/outline/candidates",
      expect.anything(),
    );
  });

  it("offers an explicit parent move for touch and keyboard users", async () => {
    const volume = {
      ...root,
      id: "volume-1",
      parentId: root.id,
      kind: "volume",
      path: "root-1/volume-1",
      title: "第一卷",
      updatedAt: "2026-08-01T00:01:00.000Z",
    } as const;
    const movableChapter = {
      ...chapter,
      id: "chapter-explicit",
      path: "root-1/chapter-explicit",
      title: "显式移动章节",
      updatedAt: "2026-08-01T00:02:00.000Z",
    } as const;
    const story = {
      project: { id: "p-1", title: "潮汐灯塔" },
      outline: [root, volume, movableChapter],
      entities: [], facts: [], relationships: [], timeline: [], foreshadows: [], documents: [],
    };
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/projects/p-1/story-bible") return json(story);
      if (url === "/api/projects/p-1/outline/chapter-explicit/move" && init?.method === "POST") {
        return json({ ...movableChapter, parentId: volume.id, path: `${volume.path}/${movableChapter.id}` });
      }
      throw new Error(`unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/books/p-1/outline"]}>
          <Routes>
            <Route path="/books/:projectId/outline" element={<OutlinePage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await screen.findByRole("heading", { name: "大纲" });
    fireEvent.change(screen.getByRole("combobox", { name: "移动到父节点" }), { target: { value: volume.id } });
    fireEvent.click(screen.getByRole("button", { name: "移动到这里" }));
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([url, request]) => String(url) === "/api/projects/p-1/outline/chapter-explicit/move" && (request as RequestInit | undefined)?.method === "POST",
      );
      expect(call).toBeDefined();
      expect(JSON.parse(String((call?.[1] as RequestInit).body))).toMatchObject({
        parentId: volume.id,
        ordinal: 0,
        expectedUpdatedAt: movableChapter.updatedAt,
      });
    });
  });

  it("submits selected nodes as one guarded batch move", async () => {
    const volume = {
      ...root,
      id: "volume-batch",
      parentId: root.id,
      kind: "volume",
      path: "root-1/volume-batch",
      title: "第一卷",
      updatedAt: "2026-08-01T00:01:00.000Z",
    } as const;
    const first = { ...chapter, id: "batch-one", path: "root-1/batch-one", title: "批量第一章", ordinal: 1, updatedAt: "2026-08-01T00:02:00.000Z" } as const;
    const second = { ...chapterTwo, id: "batch-two", path: "root-1/batch-two", title: "批量第二章", ordinal: 2, updatedAt: "2026-08-01T00:03:00.000Z" } as const;
    const story = {
      project: { id: "p-1", title: "潮汐灯塔" },
      outline: [root, volume, first, second],
      entities: [], facts: [], relationships: [], timeline: [], foreshadows: [], documents: [],
    };
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/projects/p-1/story-bible") return json(story);
      if (url === "/api/projects/p-1/outline/batch-move" && init?.method === "POST") {
        return json({ operation: { id: "operation-batch", projectId: "p-1", operation: "batch_move", before: [], after: [], createdAt: "2026-08-01T00:04:00.000Z", undoneAt: null }, nodes: story.outline });
      }
      throw new Error(`unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/books/p-1/outline"]}>
          <Routes><Route path="/books/:projectId/outline" element={<OutlinePage />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await screen.findByRole("heading", { name: "大纲" });
    fireEvent.click(screen.getByRole("checkbox", { name: "选择节点：批量第一章" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "选择节点：批量第二章" }));
    fireEvent.change(screen.getByRole("combobox", { name: "批量移动目标" }), { target: { value: volume.id } });
    fireEvent.click(screen.getByRole("button", { name: "批量移动" }));
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url, request]) => String(url) === "/api/projects/p-1/outline/batch-move" && (request as RequestInit | undefined)?.method === "POST");
      expect(call).toBeDefined();
      expect(JSON.parse(String((call?.[1] as RequestInit).body))).toEqual({
        parentId: volume.id,
        ordinal: 0,
        items: [
          { nodeId: first.id, expectedUpdatedAt: first.updatedAt },
          { nodeId: second.id, expectedUpdatedAt: second.updatedAt },
        ],
      });
    });
    expect(await screen.findByRole("status")).toHaveTextContent("已完成批量移动");
  });
});
