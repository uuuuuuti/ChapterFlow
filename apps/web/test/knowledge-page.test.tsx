// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLocale } from "../src/i18n";
import { buildRelationshipOverview, KnowledgePage } from "../src/pages/knowledge/knowledge-page";

const story = {
  project: { id: "p-1", title: "潮汐灯塔" },
  intent: null,
  outline: [{ id: "chapter-1", projectId: "p-1", parentId: null, kind: "chapter", path: "chapter-1", depth: 0, ordinal: 0, title: "第一章", summary: null, goal: null, conflict: null, outcome: null, povEntityId: null, storyTime: null, status: "committed", metadata: {}, createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" }],
  entities: [
    {
      id: "e-1",
      projectId: "p-1",
      type: "character",
      name: "沈砚",
      aliases: [],
      description: null,
      attributes: {},
      status: "active",
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
    },
    {
      id: "e-2",
      projectId: "p-1",
      type: "location",
      name: "灯塔",
      aliases: [],
      description: null,
      attributes: {},
      status: "active",
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
    },
  ],
  facts: [
    {
      id: "f-1",
      projectId: "p-1",
      subjectId: "e-1",
      predicate: "职业",
      objectEntityId: null,
      value: "守塔人",
      validFromNodeId: "chapter-1",
      validToNodeId: null,
      knowledgeScope: "omniscient",
      knowledgeSubjectId: null,
      authority: "confirmed",
      confidence: 1,
      sourceType: "chapter",
      sourceId: "doc-1",
      supersedesFactId: null,
      createdAt: "2026-08-01T00:00:00.000Z",
    },
  ],
  relationships: [{ id: "rel-1", projectId: "p-1", fromEntityId: "e-1", toEntityId: "e-2", relation: "守护", intensity: null, state: {}, outlineNodeId: null, storyTime: null, sourceId: null, supersedesEventId: null, createdAt: "2026-08-01T00:00:00.000Z" }],
  timeline: [],
  foreshadows: [],
  documents: [],
};

let evidenceResponse: unknown[] = [];
let storyIntent: unknown = null;

describe("native knowledge facts", () => {
  beforeEach(() => {
    setLocale("zh-CN");
    evidenceResponse = [];
    storyIntent = null;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "/api/projects/p-1/story-bible") {
          return Promise.resolve(new Response(JSON.stringify({ ...story, intent: storyIntent }), { status: 200, headers: { "content-type": "application/json" } }));
        }
        if (url === "/api/projects/p-1/entities?includeRetired=true") {
          return Promise.resolve(new Response(JSON.stringify(story.entities), { status: 200, headers: { "content-type": "application/json" } }));
        }
        if (url === "/api/projects/p-1/facts?includeCandidates=true") {
          return Promise.resolve(new Response(JSON.stringify(story.facts), { status: 200, headers: { "content-type": "application/json" } }));
        }
        if (url === "/api/projects/p-1/relationships") {
          return Promise.resolve(new Response(JSON.stringify(story.relationships), { status: 200, headers: { "content-type": "application/json" } }));
        }
        if (url === "/api/projects/p-1/relationships/history") {
          return Promise.resolve(new Response(JSON.stringify(story.relationships), { status: 200, headers: { "content-type": "application/json" } }));
        }
        if (url === "/api/projects/p-1/story-evidence") {
          return Promise.resolve(new Response(JSON.stringify(evidenceResponse), { status: 200, headers: { "content-type": "application/json" } }));
        }
        if (init?.method === "PUT" && url === "/api/projects/p-1/facts/f-1") {
          return Promise.resolve(new Response(JSON.stringify({ fact: story.facts[0], conflicts: [] }), { status: 200, headers: { "content-type": "application/json" } }));
        }
        if (init?.method === "PUT" && url === "/api/projects/p-1/intent") {
          return Promise.resolve(new Response(JSON.stringify({ ...storyIntent, updatedAt: "2026-08-03T00:00:00.000Z" }), { status: 200, headers: { "content-type": "application/json" } }));
        }
        if (init?.method === "POST" && url === "/api/projects/p-1/relationships") {
          const body = JSON.parse(String(init.body)) as Record<string, unknown>;
          return Promise.resolve(new Response(JSON.stringify({ ...story.relationships[0], ...body, id: "rel-2", createdAt: "2026-08-02T00:00:00.000Z" }), { status: 201, headers: { "content-type": "application/json" } }));
        }
        throw new Error(`unexpected request ${url}`);
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("edits a fact through the native page and sends the revision contract", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/books/p-1/knowledge/facts"]}>
          <Routes>
            <Route path="/books/:projectId/knowledge/*" element={<KnowledgePage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await screen.findByRole("heading", { name: "事实与锁定" });
    fireEvent.click(screen.getByRole("button", { name: "编辑" }));
    fireEvent.change(screen.getByLabelText("内容"), { target: { value: "巡海员" } });
    fireEvent.click(screen.getByRole("button", { name: "保存修订" }));

    await waitFor(() => {
      const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls.some(([, init]) => {
        if ((init as RequestInit | undefined)?.method !== "PUT") return false;
        const body = JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>;
        return body.predicate === "职业" && body.value === "巡海员" && body.confirmLockedRevision === false;
      })).toBe(true);
    });
  });

  it("locks author intent fields and sends the lock set with the update", async () => {
    storyIntent = {
      projectId: "p-1",
      promise: "港口每年遗忘一个人",
      themes: ["记忆与归来"],
      audience: "悬疑读者",
      tone: "克制",
      boundaries: ["不靠巧合解谜"],
      endingDirection: "主角找回名字",
      currentFocus: "追查旧航海日志",
      lockedFields: ["promise"],
      updatedAt: "2026-08-02T00:00:00.000Z",
    };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/books/p-1/knowledge/intent"]}>
          <Routes><Route path="/books/:projectId/knowledge/*" element={<KnowledgePage />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await screen.findByRole("heading", { name: "作品定位" });
    expect(screen.getByRole("textbox", { name: "一句话卖点" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "已锁定" }));
    fireEvent.change(screen.getByRole("textbox", { name: "一句话卖点" }), { target: { value: "港口会归还被遗忘的人" } });
    fireEvent.click(screen.getAllByRole("checkbox", { name: "锁定" })[1]!);
    fireEvent.click(screen.getByRole("button", { name: "保存作品定位" }));

    await waitFor(() => {
      const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
        ([url, init]) => String(url) === "/api/projects/p-1/intent" && (init as RequestInit | undefined)?.method === "PUT",
      );
      expect(call).toBeDefined();
      const body = JSON.parse(String((call?.[1] as RequestInit).body)) as Record<string, unknown>;
      expect(body.promise).toBe("港口会归还被遗忘的人");
      expect(body.lockedFields).toEqual(["audience"]);
    });
  });

  it("edits a relationship as a superseding event instead of rewriting history", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/books/p-1/knowledge/relations"]}>
          <Routes><Route path="/books/:projectId/knowledge/*" element={<KnowledgePage />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByRole("heading", { name: "人物与势力关系" });
    fireEvent.click(screen.getByRole("button", { name: "编辑" }));
    fireEvent.change(screen.getByLabelText("关系"), { target: { value: "盟友" } });
    fireEvent.click(screen.getByRole("button", { name: "保存关系" }));
    await waitFor(() => {
      const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
      const call = calls.find(([url, init]) => String(url) === "/api/projects/p-1/relationships" && (init as RequestInit | undefined)?.method === "POST");
      expect(call).toBeDefined();
      const body = JSON.parse(String((call?.[1] as RequestInit).body)) as Record<string, unknown>;
      expect(body).toMatchObject({ relation: "盟友", supersedesEventId: "rel-1" });
    });
  });

  it("links canon evidence back to the native writing and outline surfaces", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/books/p-1/knowledge/facts"]}>
          <Routes>
            <Route path="/books/:projectId/knowledge/*" element={<KnowledgePage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await screen.findByRole("heading", { name: "事实与锁定" });
    expect(screen.getByRole("link", { name: "打开来源正文" })).toHaveAttribute(
      "href",
      "/books/p-1/write/doc-1",
    );
    expect(screen.getByRole("link", { name: "回到章节大纲" })).toHaveAttribute(
      "href",
      "/books/p-1/outline?node=chapter-1",
    );
  });

  it("shows the indexed manuscript version and excerpt beside canon evidence", async () => {
    evidenceResponse = [
      {
        sourceType: "document",
        sourceId: "doc-1",
        documentId: "doc-1",
        outlineNodeId: "chapter-1",
        title: "第一章",
        versionId: "version-7",
        versionCreatedAt: "2026-08-02T00:00:00.000Z",
        source: "manual",
        excerpt: "雾港的钟声在凌晨响起。",
        wordCount: 12,
        updatedAt: "2026-08-02T00:00:00.000Z",
      },
      {
        sourceType: "outline_node",
        sourceId: "chapter-1",
        documentId: "doc-1",
        outlineNodeId: "chapter-1",
        title: "第一章",
        versionId: "version-7",
        versionCreatedAt: "2026-08-02T00:00:00.000Z",
        source: "manual",
        excerpt: "雾港的钟声在凌晨响起。",
        wordCount: 12,
        updatedAt: "2026-08-02T00:00:00.000Z",
      },
    ];
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/books/p-1/knowledge/facts"]}>
          <Routes>
            <Route path="/books/:projectId/knowledge/*" element={<KnowledgePage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await screen.findByText(/版本 version-/);
    expect(screen.getByRole("link", { name: "打开来源正文" })).toHaveAttribute(
      "href",
      "/books/p-1/write/doc-1?version=version-7",
    );
    expect(screen.getAllByText("“雾港的钟声在凌晨响起。”")).toHaveLength(2);
  });

  it("groups relationship history into a bidirectional overview", () => {
    const overview = buildRelationshipOverview(story.relationships, new Map(story.entities.map((entity) => [entity.id, entity.name])));
    expect(overview).toEqual([
      {
        key: "e-1\u0000e-2",
        leftName: "沈砚",
        rightName: "灯塔",
        events: [{ id: "rel-1", fromName: "沈砚", toName: "灯塔", relation: "守护", storyTime: null }],
      },
    ]);
  });

  it("summarizes native chapter appearances on character cards", async () => {
    evidenceResponse = [
      {
        sourceType: "document",
        sourceId: "doc-1",
        documentId: "doc-1",
        outlineNodeId: "chapter-1",
        title: "第一章",
        versionId: "version-7",
        versionCreatedAt: "2026-08-02T00:00:00.000Z",
        source: "manual",
        excerpt: "沈砚在雾港醒来。",
        entityIds: ["e-1"],
        wordCount: 10,
        updatedAt: "2026-08-02T00:00:00.000Z",
      },
    ];
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/books/p-1/knowledge/characters"]}>
          <Routes>
            <Route path="/books/:projectId/knowledge/*" element={<KnowledgePage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await screen.findByRole("heading", { name: "人物" });
    expect(screen.getByText("出场证据 · 1 个正文/大纲版本")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "第一章 · 正文" })).toHaveAttribute(
      "href",
      "/books/p-1/write/doc-1?version=version-7",
    );
  });
});
