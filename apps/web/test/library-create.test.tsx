// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BookCreatePage } from "../src/pages/library/library-page";

function json(value: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(value), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

describe("native AI book creation", () => {
  it("restores an unfinished manual profile draft after refresh", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const first = render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/books/new?mode=manual"]}>
          <Routes><Route path="/books/new" element={<BookCreatePage />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.change(screen.getByRole("textbox", { name: "书名" }), { target: { value: "刷新后还在的书" } });
    fireEvent.change(screen.getByRole("textbox", { name: "核心承诺" }), { target: { value: "每章都有回响" } });
    await waitFor(() => expect(window.localStorage.getItem("chapterflow:new-book-draft:manual")).toContain("刷新后还在的书"));
    first.unmount();

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/books/new?mode=manual"]}>
          <Routes><Route path="/books/new" element={<BookCreatePage />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByDisplayValue("刷新后还在的书")).toBeInTheDocument();
    expect(screen.getByDisplayValue("每章都有回响")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("已恢复上次未提交的档案草稿");
  });

  it("saves the complete book profile atomically for manual creation", async () => {
    const project = {
      id: "manual-book-1",
      title: "纸上星河",
      subtitle: null,
      premise: "一名修复师在旧书中发现来自未来的留言。",
      language: "zh-CN",
      phase: "idea",
      archivedAt: null,
      createdAt: "2026-09-09T00:00:00.000Z",
      updatedAt: "2026-09-09T00:00:00.000Z",
    };
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/projects" && init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        expect(body).toMatchObject({
          requestId: expect.any(String),
          title: "纸上星河",
          premise: project.premise,
          bookProfile: {
            genre: "都市悬疑",
            audience: "喜欢慢热推理的读者",
            promise: "每章揭开一层时间谜团",
            tone: "克制、温柔",
            pov: "近距离第三人称",
            endingDirection: "主角选择留下真相",
            updateCadence: "日更一章",
            targetWordsPerChapter: 3200,
            boundaries: ["不靠巧合解决核心谜题"],
            worldRules: ["跨时留言只能传递一次"],
            arcNotes: ["第一卷查明留言来源"],
          },
        });
        return json(project, 201);
      }
      if (url === "/api/projects") return json([]);
      throw new Error(`unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/books/new?mode=manual"]}>
          <Routes>
            <Route path="/books/new" element={<BookCreatePage />} />
            <Route path="/books/:projectId/dashboard" element={<p>dashboard</p>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.change(screen.getByRole("textbox", { name: "书名" }), {
      target: { value: "纸上星河" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "一句话简介" }), {
      target: { value: project.premise },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "题材" }), {
      target: { value: "都市悬疑" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "目标读者" }), {
      target: { value: "喜欢慢热推理的读者" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "核心承诺" }), {
      target: { value: "每章揭开一层时间谜团" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "叙事风格" }), {
      target: { value: "克制、温柔" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "叙事视角" }), {
      target: { value: "近距离第三人称" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "更新节奏" }), {
      target: { value: "日更一章" },
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: "每章目标字数" }), {
      target: { value: "3200" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "结局方向" }), {
      target: { value: "主角选择留下真相" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "创作边界（每行一项）" }), {
      target: { value: "不靠巧合解决核心谜题" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "世界规则（每行一项）" }), {
      target: { value: "跨时留言只能传递一次" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "长线弧光（每行一项）" }), {
      target: { value: "第一卷查明留言来源" },
    });
    fireEvent.click(screen.getByRole("button", { name: "创建作品" }));

    expect(await screen.findByText("dashboard")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("keeps the author on ChapterFlow for candidate review and adoption", async () => {
    const planPayload = (title: string, angle: string) => ({
      key: title,
      title,
      rationale: `${title} 的推进理由`,
      angle,
      riskNotes: ["需要控制信息释放"],
      intent: {
        promise: "每次遗忘都留下代价",
        themes: ["记忆"],
        audience: "悬疑幻想读者",
        tone: "克制",
        boundaries: [],
        endingDirection: "找回名字",
        currentFocus: "建立规则",
      },
      compass: {
        corePromise: "每次遗忘都留下代价",
        endingDirection: "找回名字",
        longLines: [],
        themeQuestions: ["记住是否带来责任？"],
        target: { chapters: 12, wordsPerChapter: 3000, volumes: 1 },
        constraints: [],
      },
      entities: [
        {
          type: "character",
          name: "林昼",
          aliases: [],
          description: "守灯人的女儿",
          attributes: { role: "主角", desire: "找回名字", fear: "被遗忘", secret: null },
        },
      ],
    });
    const candidate = {
      id: "candidate-1",
      setId: "set-1",
      projectId: "p-1",
      kind: "plan",
      label: "方案1 · 规则悬疑",
      payload: planPayload("规则悬疑", "每次找回名字都交换一段记忆"),
      editedPayload: null,
      status: "pending",
      adoptedRefType: null,
      adoptedRefId: null,
      createdAt: "2026-09-09T00:00:00.000Z",
      updatedAt: "2026-09-09T00:00:00.000Z",
    };
    const set = {
      set: {
        id: "set-1",
        projectId: "p-1",
        sourceRunId: "run-foundation",
        title: "AI 开书候选",
        status: "open",
        createdAt: "2026-09-09T00:00:00.000Z",
        updatedAt: "2026-09-09T00:00:00.000Z",
      },
      candidates: [
        candidate,
        { ...candidate, id: "candidate-2", label: "方案2 · 关系驱动", payload: planPayload("关系驱动", "父女隐瞒推动冲突") },
        { ...candidate, id: "candidate-3", label: "方案3 · 群像冒险", payload: planPayload("群像冒险", "港口共同体保护秘密") },
      ],
    };
    let planSelected = false;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/projects") return json([]);
      if (url === "/api/projects/with-foundation" && init?.method === "POST") {
        expect(JSON.parse(String(init.body))).toMatchObject({
          bookProfile: {
            genre: "都市悬疑",
            audience: "悬疑幻想读者",
            promise: "每章揭开一层规则",
            tone: "克制",
            pov: "近距离第三人称",
            endingDirection: "找回真相",
            updateCadence: "日更一章",
            targetWordsPerChapter: 3200,
            boundaries: ["不靠巧合解决核心谜题"],
            worldRules: ["跨时留言只能传递一次"],
            arcNotes: ["第一卷查明留言来源"],
          },
          preferences: { wordsPerChapter: 3200 },
        });
        return json({
          project: {
            id: "p-1",
            title: "潮汐灯塔",
            subtitle: null,
            premise: "灯灭时港口遗忘一个人。",
            language: "zh-CN",
            phase: "idea",
            archivedAt: null,
            createdAt: "2026-09-09T00:00:00.000Z",
            updatedAt: "2026-09-09T00:00:00.000Z",
          },
          task: { run: { id: "run-foundation" } },
          idempotentReplay: false,
        });
      }
      if (url === "/api/projects/p-1/foundation/candidates") {
        return json([planSelected ? {
          ...set,
          set: { ...set.set, status: "adopted" },
          candidates: set.candidates.map((item, index) => ({
            ...item,
            status: index === 0 ? "adopted" : "discarded",
          })),
        } : set]);
      }
      if (url.startsWith("/api/runs/run-foundation?")) {
        return json({ run: { id: "run-foundation", status: "completed" } });
      }
      if (url === "/api/candidates/candidate-1/actions" && init?.method === "POST") {
        expect(JSON.parse(String(init.body))).toMatchObject({
          action: "adopt",
          expectedUpdatedAt: "2026-09-09T00:00:00.000Z",
        });
        planSelected = true;
        return json({ ...candidate, status: "adopted", adoptedRefType: "foundation_plan", adoptedRefId: "candidate-1" });
      }
      throw new Error(`unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/books/new?mode=ai"]}>
          <Routes>
            <Route path="/books/new" element={<BookCreatePage />} />
            <Route path="/books/:projectId/dashboard" element={<p>dashboard</p>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.change(screen.getByRole("textbox", { name: "书名" }), {
      target: { value: "潮汐灯塔" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "一句话简介" }), {
      target: { value: "灯灭时港口遗忘一个人。" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "题材" }), {
      target: { value: "都市悬疑" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "目标读者" }), {
      target: { value: "悬疑幻想读者" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "核心承诺" }), {
      target: { value: "每章揭开一层规则" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "叙事风格" }), {
      target: { value: "克制" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "叙事视角" }), {
      target: { value: "近距离第三人称" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "更新节奏" }), {
      target: { value: "日更一章" },
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: "每章目标字数" }), {
      target: { value: "3200" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "结局方向" }), {
      target: { value: "找回真相" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "创作边界（每行一项）" }), {
      target: { value: "不靠巧合解决核心谜题" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "世界规则（每行一项）" }), {
      target: { value: "跨时留言只能传递一次" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "长线弧光（每行一项）" }), {
      target: { value: "第一卷查明留言来源" },
    });
    fireEvent.click(screen.getByRole("button", { name: "创建作品" }));

    expect(await screen.findByRole("heading", { name: "先确认这份开书方案" })).toBeInTheDocument();
    expect(await screen.findByText("规则悬疑")).toBeInTheDocument();
    expect(await screen.findByText("关系驱动")).toBeInTheDocument();
    expect(await screen.findByText("群像冒险")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "采用整组方案" })).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "采用此方案" })[0]!);
    expect(await screen.findByRole("button", { name: "进入作品首页" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "进入作品首页" }));
    expect(await screen.findByText("dashboard")).toBeInTheDocument();
  });

  it("keeps a new import on the native flow through analysis recovery and apply", async () => {
    const preview = {
      batch: {
        id: "import-1",
        targetProjectId: "p-import",
        filename: "潮汐旧稿.md",
        format: "markdown",
        sourceHash: "source-hash",
        sourceCharacters: 18,
        status: "previewed",
        metadata: { title: "潮汐旧稿" },
        analysisRunId: null,
        appliedProjectId: null,
        createdAt: "2026-09-09T00:00:00.000Z",
        updatedAt: "2026-09-09T00:00:00.000Z",
      },
      candidates: [
        {
          id: "document-1",
          batchId: "import-1",
          kind: "document",
          ordinal: 0,
          title: "第一章",
          payload: { content: "潮声越过空码头。" },
          status: "pending",
          createdAt: "2026-09-09T00:00:00.000Z",
          updatedAt: "2026-09-09T00:00:00.000Z",
        },
      ],
    };
    const ready = {
      ...preview,
      batch: { ...preview.batch, status: "ready", analysisRunId: "run-import" },
      candidates: [
        ...preview.candidates,
        {
          id: "entity-1",
          batchId: "import-1",
          kind: "entity",
          ordinal: 1,
          title: "沈砚",
          payload: { type: "character", name: "沈砚" },
          status: "pending",
          createdAt: "2026-09-09T00:00:00.000Z",
          updatedAt: "2026-09-09T00:00:00.000Z",
        },
      ],
    };
    let imported = false;
    let analysisSubmitted = false;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/projects") {
        if (init?.method === "POST") {
          expect(JSON.parse(String(init.body))).toMatchObject({ title: "潮汐旧稿" });
          return json({
            id: "p-import",
            title: "潮汐旧稿",
            subtitle: null,
            premise: null,
            language: "zh-CN",
            phase: "idea",
            archivedAt: null,
            createdAt: "2026-09-09T00:00:00.000Z",
            updatedAt: "2026-09-09T00:00:00.000Z",
          }, 201);
        }
        return json([]);
      }
      if (url === "/api/imports/preview" && init?.method === "POST") return json(preview, 201);
      if (url === "/api/imports/import-1/analyze" && init?.method === "POST") {
        analysisSubmitted = true;
        return json({ run: { id: "run-import", status: "pending" }, steps: [], events: [], latestCheckpoint: null }, 202);
      }
      if (url === "/api/runs/run-import?projectId=p-import") return json({ run: { id: "run-import", status: "completed" }, steps: [], events: [], latestCheckpoint: null });
      if (url === "/api/imports/import-1") return json(analysisSubmitted ? ready : preview);
      if (url === "/api/imports/import-1/actions" && init?.method === "POST") {
        imported = true;
        return json({ projectId: "p-import", detail: { ...ready, batch: { ...ready.batch, status: "applied", appliedProjectId: "p-import" } } });
      }
      throw new Error(`unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/books/new?mode=import"]}>
          <Routes>
            <Route path="/books/new" element={<BookCreatePage />} />
            <Route path="/books/:projectId/dashboard" element={<p>dashboard</p>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.change(screen.getByRole("textbox", { name: "导入作品名称" }), { target: { value: "潮汐旧稿" } });
    fireEvent.change(screen.getByLabelText("选择作品文件"), { target: { files: [new File(["# 第一章\n潮声越过空码头。"], "潮汐旧稿.md")] } });
    expect(await screen.findByText("待分析")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "开始 AI 分析" }));
    expect(await screen.findByText("待确认")).toBeInTheDocument();
    expect(screen.getByText("沈砚")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /确认导入/ }));
    expect(await screen.findByText("dashboard")).toBeInTheDocument();
    expect(imported).toBe(true);
  });

  it("archives and recycles the temporary native project when preview fails", async () => {
    const project = {
      id: "p-import-failed",
      title: "坏文件",
      subtitle: null,
      premise: null,
      language: "zh-CN",
      phase: "idea",
      archivedAt: null,
      createdAt: "2026-09-09T00:00:00.000Z",
      updatedAt: "2026-09-09T00:00:00.000Z",
    };
    const archived = { ...project, archivedAt: "2026-09-09T00:00:01.000Z", updatedAt: "2026-09-09T00:00:01.000Z" };
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/projects" && init?.method === "POST") return json(project, 201);
      if (url === "/api/imports/preview") return Promise.reject(new Error("模拟解析失败"));
      if (url === "/api/projects/p-import-failed" && init?.method === "PUT") {
        expect(JSON.parse(String(init.body))).toMatchObject({ archived: true, expectedUpdatedAt: project.updatedAt });
        return json(archived);
      }
      if (url === "/api/projects/p-import-failed" && init?.method === "DELETE") {
        expect(JSON.parse(String(init.body))).toMatchObject({ confirmationTitle: project.title, expectedUpdatedAt: archived.updatedAt });
        return json({ id: project.id, title: project.title });
      }
      if (url === "/api/projects/p-import-failed/purge" && init?.method === "DELETE") {
        expect(JSON.parse(String(init.body))).toMatchObject({ confirmationTitle: project.title });
        return new Response(null, { status: 204 });
      }
      throw new Error(`unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/books/new?mode=import"]}>
          <Routes>
            <Route path="/books/new" element={<BookCreatePage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.change(screen.getByLabelText("选择作品文件"), {
      target: { files: [new File(["坏文件"], "坏文件.md")] },
    });
    expect(await screen.findByText("模拟解析失败")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/p-import-failed",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/p-import-failed/purge",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
