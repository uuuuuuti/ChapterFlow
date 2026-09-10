// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLocale } from "../src/i18n";
import { WebNovelPage } from "../src/pages/web-novel/web-novel-page";

function json(value: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(value), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
}

const story = {
  project: {
    id: "p-1",
    title: "潮汐灯塔",
    subtitle: null,
    premise: "灯灭时，港口会遗忘一个人。",
    language: "zh-CN",
    phase: "outlining",
    archivedAt: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  },
  intent: null,
  outline: [],
  entities: [],
  facts: [],
  relationships: [],
  timeline: [],
  foreshadows: [],
  occupiedOutlineNodeIds: [],
  documents: [],
};

function report(status: "open" | "ignored" | "resolved") {
  return {
    id: `report-${status}`,
    projectId: "p-1",
    scope: "opening-three",
    chapterIds: [],
    generatedAt: "2026-09-09T10:00:00.000Z",
    sourceVersions: [],
    score: status === "open" ? 40 : 100,
    metrics: {
      availableChapters: 0,
      checkedChapters: 0,
      manuscriptCharacters: 0,
      averageChapterCharacters: 0,
      briefsCompleted: 0,
      chaptersWithHook: 0,
      chaptersWithConflict: 0,
      chaptersWithPayoff: 0,
      chaptersMeetingTarget: 0,
      targetWordsPerChapter: null,
      targetCompletionRate: null,
    },
    issues: [
      {
        id: "opening-missing",
        code: "opening.three_chapters_missing",
        severity: "error",
        title: "前三章样本不足",
        message: "当前只有 0 个章节节点。",
        evidence: "当前只有 0 个章节节点，无法完成完整的前三章体检。",
        suggestion: "先在大纲中补齐前三章，再重新运行体检。",
        targetChapterId: "chapter-1",
        targetDocumentId: "doc-1",
        status,
        note: null,
        updatedAt: status === "open" ? null : "2026-09-09T10:01:00.000Z",
      },
    ],
  };
}

describe("native web-novel opening check", () => {
  beforeEach(() => setLocale("zh-CN"));
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("persists the issue through ignore, reopen and resolved actions", async () => {
    const reports = [report("open"), report("ignored"), report("open"), report("resolved")];
    let lastNote: string | null = null;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/projects/p-1/story-bible") return json(story);
      if (url === "/api/projects/p-1/book-profile") return json(null);
      if (url === "/api/projects/p-1/book-profile/history") return json([]);
      if (url === "/api/creative-presets?projectId=p-1") return json([]);
      if (url === "/api/projects/p-1/web-novel/checks/opening-three/history") return json([report("open")]);
      if (url === "/api/projects/p-1/web-novel/checks/opening-three/audit") {
        return json([
          {
            id: "audit-1",
            projectId: "p-1",
            reportId: "report-open",
            issueId: "opening-missing",
            proposalId: null,
            runId: null,
            eventType: "report_generated",
            action: "recheck",
            before: { score: 40 },
            after: { score: 60 },
            createdAt: "2026-09-09T10:02:00.000Z",
          },
        ]);
      }
      if (url === "/api/projects/p-1/web-novel/checks/opening-three" && init?.method === "POST") {
        const next = reports.shift() ?? report("open");
        return json({ ...next, issues: next.issues.map((item) => ({ ...item, note: lastNote })) });
      }
      if (url.endsWith("/web-novel/checks/opening-three/issues/opening-missing") && init?.method === "PUT") {
        const body = JSON.parse(String(init.body));
        lastNote = body.note;
        return json({
          projectId: "p-1",
          issueId: "opening-missing",
          status: body.status,
          note: lastNote,
          updatedAt: "2026-09-09T10:01:00.000Z",
        });
      }
      throw new Error(`unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/books/p-1/advanced?tool=web-novel"]}>
          <Routes>
            <Route path="/books/:projectId/advanced" element={<WebNovelPage projectId="p-1" />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await screen.findByRole("heading", { name: "前三章体检" });
    fireEvent.click(screen.getByRole("button", { name: "运行前三章体检" }));
    const issue = await screen.findByRole("article");
    expect(within(issue).getByText("阻塞")).toBeInTheDocument();
    expect(
      within(issue).getByRole("link", { name: "生成修改建议" }),
    ).toHaveAttribute("href", expect.stringContaining("/books/p-1/write/doc-1?tab=ai"));
    fireEvent.click(screen.getByRole("button", { name: "查看检查记录" }));
    expect(await screen.findByText(/report-o/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "查看处理审计" }));
    expect(await screen.findByText("复检完成")).toBeInTheDocument();

    fireEvent.change(within(issue).getByLabelText("处理备注"), { target: { value: "已补写正文" } });
    fireEvent.click(within(issue).getByRole("button", { name: "忽略" }));
    await waitFor(() => expect(within(issue).getByText("已忽略")).toBeInTheDocument());
    const ignoreCall = fetchMock.mock.calls.find(
      ([url, request]) => String(url).endsWith("/issues/opening-missing") && (request as RequestInit | undefined)?.method === "PUT",
    );
    expect(JSON.parse(String((ignoreCall?.[1] as RequestInit).body))).toMatchObject({
      status: "ignored",
      expectedStatus: "open",
      note: "已补写正文",
    });

    fireEvent.click(within(issue).getByRole("button", { name: "重新打开" }));
    await waitFor(() => expect(within(issue).getByText("阻塞")).toBeInTheDocument());
    fireEvent.click(within(issue).getByRole("button", { name: "标记已处理" }));
    await waitFor(() => expect(within(issue).getByText("已处理")).toBeInTheDocument());

    const putCalls = fetchMock.mock.calls.filter(
      ([url, request]) => String(url).endsWith("/issues/opening-missing") && (request as RequestInit | undefined)?.method === "PUT",
    );
    expect(putCalls).toHaveLength(3);
    expect(JSON.parse(String((putCalls[1]?.[1] as RequestInit).body))).toMatchObject({
      status: "open",
      expectedStatus: "ignored",
    });
    expect(JSON.parse(String((putCalls[2]?.[1] as RequestInit).body))).toMatchObject({
      status: "resolved",
      expectedStatus: "open",
    });
  });

  it("writes an accepted issue back as resolved after an automatic recheck", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/projects/p-1/story-bible") return json(story);
      if (url === "/api/projects/p-1/book-profile") return json(null);
      if (url === "/api/projects/p-1/book-profile/history") return json([]);
      if (url === "/api/creative-presets?projectId=p-1") return json([]);
      if (url === "/api/projects/p-1/web-novel/checks/opening-three" && init?.method === "POST") {
        return json({ ...report("open"), issues: [] });
      }
      if (url.endsWith("/web-novel/checks/opening-three/issues/opening-missing") && init?.method === "PUT") {
        return json({
          projectId: "p-1",
          issueId: "opening-missing",
          status: "resolved",
          note: "复检后问题消失",
          updatedAt: "2026-09-09T10:03:00.000Z",
        });
      }
      throw new Error("unexpected request " + url);
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/books/p-1/advanced?tool=web-novel&check=1&checkIssue=opening-missing"]}>
          <Routes>
            <Route path="/books/:projectId/advanced" element={<WebNovelPage projectId="p-1" />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await screen.findByRole("heading", { name: "前三章体检" });
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([url, request]) =>
          String(url).endsWith("/issues/opening-missing") &&
          (request as RequestInit | undefined)?.method === "PUT",
      );
      expect(call).toBeDefined();
      expect(JSON.parse(String((call?.[1] as RequestInit).body))).toMatchObject({
        status: "resolved",
        expectedStatus: "open",
        reportId: "report-open",
      });
    });
  });

  it("compares a previous report and shows per-issue evidence changes", async () => {
    const previous = report("open");
    const current = {
      ...report("resolved"),
      id: "report-current",
      generatedAt: "2026-09-09T11:00:00.000Z",
      issues: [],
    };
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/projects/p-1/story-bible") return json(story);
      if (url === "/api/projects/p-1/book-profile") return json(null);
      if (url === "/api/projects/p-1/book-profile/history") return json([]);
      if (url === "/api/creative-presets?projectId=p-1") return json([]);
      if (url === "/api/projects/p-1/web-novel/checks/opening-three/history") return json([previous]);
      if (url === "/api/projects/p-1/web-novel/checks/opening-three" && init?.method === "POST") return json(current);
      throw new Error("unexpected request " + url);
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/books/p-1/advanced?tool=web-novel"]}>
          <Routes>
            <Route path="/books/:projectId/advanced" element={<WebNovelPage projectId="p-1" />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByRole("heading", { name: "前三章体检" });
    fireEvent.click(screen.getByRole("button", { name: "运行前三章体检" }));
    await screen.findByText("当前没有发现需要处理的问题。");
    fireEvent.click(screen.getByRole("button", { name: "查看检查记录" }));
    fireEvent.click(await screen.findByRole("button", { name: "与当前比较" }));
    expect(await screen.findByRole("heading", { name: "报告比较" })).toBeInTheDocument();
    expect(screen.getByText("不再出现")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });
});

describe("native web-novel profile conflict recovery", () => {
  beforeEach(() => setLocale("zh-CN"));
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("keeps local edits and can explicitly read the remote profile after a conflict", async () => {
    const remoteProfile = {
      projectId: "p-1",
      presetId: null,
      genre: "都市悬疑·远端",
      audience: "追更读者",
      promise: "每章都有新的线索",
      tone: "克制",
      endingDirection: "真相落地",
      pov: "第三人称",
      updateCadence: "日更",
      targetWordsPerChapter: 3000,
      boundaries: ["不靠巧合收尾"],
      worldRules: ["线索必须可回溯"],
      arcNotes: ["第一卷完成闭环"],
      version: 2,
      updatedAt: "2026-09-09T10:02:00.000Z",
    };
    let profile = { ...remoteProfile, genre: "都市悬疑", version: 1 };
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/projects/p-1/story-bible") return json(story);
      if (url === "/api/projects/p-1/book-profile" && !init?.method) return json(profile);
      if (url === "/api/projects/p-1/book-profile/history") return json([]);
      if (url === "/api/creative-presets?projectId=p-1") return json([]);
      if (url === "/api/projects/p-1/book-profile" && init?.method === "PUT") {
        profile = remoteProfile;
        return json(
          {
            error: {
              code: "book_profile.version_conflict",
              message: "The book profile was updated elsewhere; refresh and try again",
              details: { expectedVersion: 1, currentProfile: remoteProfile },
            },
          },
          409,
        );
      }
      throw new Error(`unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/books/p-1/advanced?tool=web-novel"]}>
          <Routes>
            <Route path="/books/:projectId/advanced" element={<WebNovelPage projectId="p-1" />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const genre = await screen.findByDisplayValue("都市悬疑");
    fireEvent.change(genre, { target: { value: "都市悬疑·本地修改" } });
    fireEvent.click(screen.getByRole("button", { name: "保存作品档案" }));

    const recovery = await screen.findByRole("alert", { name: "作品档案冲突恢复" });
    expect(within(recovery).getByText("作品档案已在其他页面更新")).toBeInTheDocument();
    expect(screen.getByDisplayValue("都市悬疑·本地修改")).toBeInTheDocument();

    fireEvent.change(within(recovery).getByRole("combobox", { name: "题材冲突处理" }), {
      target: { value: "local" },
    });
    fireEvent.click(within(recovery).getByRole("button", { name: "合并选中字段" }));
    expect(screen.queryByRole("alert", { name: "作品档案冲突恢复" })).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("都市悬疑·本地修改")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "保存作品档案" }));
    const secondRecovery = await screen.findByRole("alert", { name: "作品档案冲突恢复" });
    fireEvent.click(within(secondRecovery).getByRole("button", { name: "读取最新档案" }));
    await waitFor(() => expect(screen.getByDisplayValue("都市悬疑·远端")).toBeInTheDocument());
    expect(screen.queryByRole("alert", { name: "作品档案冲突恢复" })).not.toBeInTheDocument();
  });
});

describe("native web-novel brief conflict recovery", () => {
  beforeEach(() => setLocale("zh-CN"));
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("keeps a local chapter brief draft and retries against the remote version", async () => {
    const chapterStory = {
      ...story,
      outline: [{ id: "chapter-1", kind: "chapter", title: "第一章 灯灭" }],
    };
    const initialBrief = {
      id: "brief-1",
      projectId: "p-1",
      outlineNodeId: "chapter-1",
      goal: "发现线索",
      conflict: "证人拒绝开口",
      payoff: "拿到船票",
      hook: "日期尚未到来",
      characterIds: [],
      foreshadowIds: [],
      timelineIds: [],
      targetWords: 3000,
      pacing: "steady",
      version: 0,
      createdAt: "2026-09-09T10:00:00.000Z",
      updatedAt: "2026-09-09T10:00:00.000Z",
    };
    const remoteBrief = {
      ...initialBrief,
      goal: "发现新的线索",
      version: 1,
      updatedAt: "2026-09-09T10:01:00.000Z",
    };
    let putCount = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/projects/p-1/story-bible") return json(chapterStory);
      if (url === "/api/projects/p-1/book-profile") return json(null);
      if (url === "/api/projects/p-1/book-profile/history") return json([]);
      if (url === "/api/creative-presets?projectId=p-1") return json([]);
      if (url === "/api/projects/p-1/chapter-briefs/chapter-1" && !init?.method) return json(initialBrief);
      if (url === "/api/projects/p-1/chapter-briefs/chapter-1" && init?.method === "PUT") {
        putCount += 1;
        if (putCount === 1) {
          return json({ error: { code: "chapter_brief.version_conflict", message: "brief changed", details: { currentBrief: remoteBrief } } }, 409);
        }
        return json({ ...remoteBrief, goal: "本地确认后的目标", version: 2 });
      }
      throw new Error(`unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/books/p-1/advanced?tool=web-novel&chapter=chapter-1"]}>
          <Routes>
            <Route path="/books/:projectId/advanced" element={<WebNovelPage projectId="p-1" />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const goal = await screen.findByDisplayValue("发现线索");
    fireEvent.change(goal, { target: { value: "本地修改目标" } });
    fireEvent.click(screen.getByRole("button", { name: "保存章节简报" }));
    const recovery = await screen.findByRole("alert", { name: "章节简报冲突恢复" });
    expect(screen.getByDisplayValue("本地修改目标")).toBeInTheDocument();
    fireEvent.change(within(recovery).getByRole("combobox", { name: "本章目标冲突处理" }), { target: { value: "local" } });
    fireEvent.click(within(recovery).getByRole("button", { name: "合并选中字段" }));
    expect(screen.getByDisplayValue("本地修改目标")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "保存章节简报" }));
    await waitFor(() => expect(putCount).toBe(2));
    const secondBody = JSON.parse(String((fetchMock.mock.calls[fetchMock.mock.calls.length - 1]?.[1] as RequestInit).body));
    expect(secondBody).toMatchObject({ expectedVersion: 1, goal: "本地修改目标" });
  });
});

describe("native web-novel brief version binding", () => {
  beforeEach(() => setLocale("zh-CN"));
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows that a brief is stale when the chapter has a newer saved version", async () => {
    const chapterStory = {
      ...story,
      outline: [{ id: "chapter-1", kind: "chapter", title: "第一章 灯灭" }],
      documents: [{
        id: "doc-1",
        projectId: "p-1",
        kind: "chapter",
        title: "第一章 灯灭",
        outlineNodeId: "chapter-1",
        currentVersionId: "version-2",
        archivedAt: null,
        createdAt: "2026-09-09T10:00:00.000Z",
        updatedAt: "2026-09-09T10:02:00.000Z",
      }],
    };
    const brief = {
      id: "brief-1",
      projectId: "p-1",
      outlineNodeId: "chapter-1",
      documentVersionId: "version-1",
      goal: "发现线索",
      conflict: "证人拒绝开口",
      payoff: "拿到船票",
      hook: "日期尚未到来",
      characterIds: [],
      foreshadowIds: [],
      timelineIds: [],
      targetWords: 3000,
      pacing: "steady",
      version: 0,
      createdAt: "2026-09-09T10:00:00.000Z",
      updatedAt: "2026-09-09T10:00:00.000Z",
    };
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/projects/p-1/story-bible") return json(chapterStory);
      if (url === "/api/projects/p-1/book-profile") return json(null);
      if (url === "/api/projects/p-1/book-profile/history") return json([]);
      if (url === "/api/creative-presets?projectId=p-1") return json([]);
      if (url === "/api/projects/p-1/chapter-briefs/chapter-1") return json(brief);
      throw new Error(`unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/books/p-1/advanced?tool=web-novel&chapter=chapter-1"]}>
          <Routes>
            <Route path="/books/:projectId/advanced" element={<WebNovelPage projectId="p-1" />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("正文已经更新，这份章节简报仍基于旧正文。保存简报后，检查和 AI 才会使用最新依据。" )).toBeInTheDocument();
  });
});

describe("native web-novel preset conflict recovery", () => {
  beforeEach(() => setLocale("zh-CN"));
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("merges selected local preset fields before the explicit retry", async () => {
    const initialPreset = {
      id: "preset-1",
      projectId: "p-1",
      name: "悬疑预设",
      genre: "都市悬疑",
      audience: "追更读者",
      promise: "每章都有线索",
      pacing: "steady",
      targetWordsPerChapter: 3000,
      updateCadence: "日更",
      boundaries: ["不靠巧合"],
      checkRules: ["章尾有钩子"],
      defaultTemplate: null,
      status: "active",
      version: 0,
      createdAt: "2026-09-09T10:00:00.000Z",
      updatedAt: "2026-09-09T10:00:00.000Z",
    };
    const remotePreset = {
      ...initialPreset,
      genre: "都市悬疑·远端",
      version: 1,
      updatedAt: "2026-09-09T10:01:00.000Z",
    };
    let putCount = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/projects/p-1/story-bible") return json(story);
      if (url === "/api/projects/p-1/book-profile") return json(null);
      if (url === "/api/projects/p-1/book-profile/history") return json([]);
      if (url === "/api/creative-presets?projectId=p-1") return json([initialPreset]);
      if (url === "/api/projects/p-1/chapter-briefs/" && !init?.method) return json(null);
      if (url === "/api/creative-presets/preset-1" && init?.method === "PUT") {
        putCount += 1;
        if (putCount === 1) {
          return json({ error: { code: "creative_preset.version_conflict", message: "preset changed", details: { currentPreset: remotePreset } } }, 409);
        }
        const body = JSON.parse(String(init.body));
        return json({ ...remotePreset, ...body, version: 2 });
      }
      throw new Error(`unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/books/p-1/advanced?tool=web-novel"]}>
          <Routes>
            <Route path="/books/:projectId/advanced" element={<WebNovelPage projectId="p-1" />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "编辑" }));
    fireEvent.change(screen.getByDisplayValue("都市悬疑"), { target: { value: "都市悬疑·本地" } });
    fireEvent.click(screen.getByRole("button", { name: "保存预设修改" }));
    const recovery = await screen.findByRole("alert", { name: "创作预设冲突恢复" });
    fireEvent.change(within(recovery).getByRole("combobox", { name: "题材冲突处理" }), { target: { value: "local" } });
    fireEvent.click(within(recovery).getByRole("button", { name: "合并选中字段" }));
    expect(screen.getByDisplayValue("都市悬疑·本地")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "保存预设修改" }));
    await waitFor(() => expect(putCount).toBe(2));
    const updateCalls = fetchMock.mock.calls.filter(
      ([url, request]) =>
        String(url) === "/api/creative-presets/preset-1" &&
        (request as RequestInit | undefined)?.method === "PUT",
    );
    const secondBody = JSON.parse(String((updateCalls[1]?.[1] as RequestInit).body));
    expect(secondBody).toMatchObject({ expectedVersion: 1, genre: "都市悬疑·本地" });
  });
});
