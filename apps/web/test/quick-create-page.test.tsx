// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { setLocale } from "../src/i18n";
import { QuickCreatePage } from "../src/pages/quick-create/quick-create-page";

function json(value: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(value), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
}

const project = {
  id: "p-1",
  title: "潮汐灯塔",
  subtitle: null,
  premise: "灯灭时，港口会遗忘一个人。",
  language: "zh-CN",
  phase: "writing",
  archivedAt: null,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

const chapters = ["第一章 灯灭", "第二章 船票"].map((title, index) => ({
  id: `chapter-${index + 1}`,
  projectId: "p-1",
  parentId: "book-1",
  kind: "chapter",
  path: `1.${index + 1}`,
  depth: 1,
  ordinal: index,
  title,
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
}));

const session = {
  id: "session-1",
  projectId: "p-1",
  mode: "autopilot",
  approvalMode: "per_chapter",
  scope: { startOutlineNodeId: "chapter-1", endOutlineNodeId: "chapter-2" },
  origin: { surface: "quick-create" },
  status: "completed",
  targetChapters: 2,
  windowSize: 2,
  maxRevisionCycles: 1,
  chapterPolicy: {},
  currentRunId: null,
  currentOutlineNodeId: null,
  completedChapters: 1,
  skippedChapters: 1,
  pauseRequested: false,
  cancelRequested: false,
  replanRequested: false,
  activeNotes: [],
  lastError: null,
  createdAt: "2026-09-09T10:00:00.000Z",
  updatedAt: "2026-09-09T10:20:00.000Z",
  finishedAt: "2026-09-09T10:20:00.000Z",
  version: 3,
};

const detail = {
  session,
  links: [
    {
      sessionId: "session-1",
      runId: "run-1",
      role: "chapter",
      outlineNodeId: "chapter-1",
      sequence: 0,
      createdAt: "2026-09-09T10:01:00.000Z",
      processedAt: "2026-09-09T10:10:00.000Z",
      outcome: "completed",
    },
    {
      sessionId: "session-1",
      runId: "run-2",
      role: "chapter",
      outlineNodeId: "chapter-2",
      sequence: 1,
      createdAt: "2026-09-09T10:11:00.000Z",
      processedAt: "2026-09-09T10:12:00.000Z",
      outcome: "skipped",
    },
  ],
  chapterResults: [
    {
      runId: "run-1",
      outlineNodeId: "chapter-1",
      sequence: 0,
      status: "completed",
      targetWords: 3000,
      actualWords: 2600,
      checkScore: 85,
      qualityVerdict: "pass",
      retryCount: 1,
      error: null,
    },
    {
      runId: "run-2",
      outlineNodeId: "chapter-2",
      sequence: 1,
      status: "skipped",
      targetWords: 3000,
      actualWords: null,
      checkScore: null,
      qualityVerdict: null,
      retryCount: 0,
      error: null,
    },
  ],
  runs: [
    {
      id: "run-1",
      projectId: "p-1",
      recipe: "chapter",
      recipeVersion: 1,
      mode: "autopilot",
      status: "completed",
      targetOutlineNodeId: "chapter-1",
      policy: {},
      budgetUsage: { inputTokens: 0, outputTokens: 0, calls: 0, costUsd: 0, wallTimeMs: 0 },
      revisionCycle: 0,
      pauseRequested: false,
      cancelRequested: false,
      currentStepId: null,
      startedAt: "2026-09-09T10:01:00.000Z",
      finishedAt: "2026-09-09T10:10:00.000Z",
      createdAt: "2026-09-09T10:01:00.000Z",
      updatedAt: "2026-09-09T10:10:00.000Z",
      version: 1,
    },
  ],
  steers: [],
  reviews: [],
  origin: { surface: "quick-create" },
  approvalMode: "per_chapter",
  currentChapter: null,
  stopReason: "completed",
  availableActions: [],
  blockingReview: null,
};

describe("native quick-create batch results", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows result counts and links each chapter back to its task and writing surface", async () => {
    setLocale("zh-CN");
    const story = {
      project,
      intent: null,
      outline: chapters,
      entities: [],
      facts: [],
      relationships: [],
      timeline: [],
      foreshadows: [],
      occupiedOutlineNodeIds: [],
      documents: [],
    };
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/projects/p-1/story-bible") return json(story);
      if (url === "/api/projects/p-1/compass") {
        return json({
          projectId: "p-1",
          corePromise: "每章留下一个新问题。",
          endingDirection: null,
          longLines: [],
          themeQuestions: [],
          target: { chapters: 2, wordsPerChapter: 3000, volumes: 1 },
          constraints: [],
          version: 1,
          updatedAt: "2026-09-09T10:00:00.000Z",
        });
      }
      if (url === "/api/projects/p-1/autopilot/sessions") return json([session]);
      if (url === "/api/autopilot/sessions/session-1") return json(detail);
      throw new Error(`unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/books/p-1/quick-create?session=session-1"]}>
          <Routes>
            <Route path="/books/:projectId/quick-create" element={<QuickCreatePage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const results = await screen.findByRole("region", { name: "逐章结果" });
    expect(results).toHaveTextContent("已完成");
    expect(results).toHaveTextContent("已跳过");
    expect(results).toHaveTextContent("第一章 灯灭");
    expect(results).toHaveTextContent("第二章 船票");
    expect(results).toHaveTextContent("实际 2,600 字");
    expect(results).toHaveTextContent("检查 85 分");
    expect(results).toHaveTextContent("平均检查分");
    expect(within(results).getByRole("button", { name: "导出批次报告 CSV" })).toBeInTheDocument();
    expect(within(results).getAllByRole("link", { name: "打开写作台" })[0]).toHaveAttribute(
      "href",
      "/books/p-1/write?outline=chapter-1",
    );
    expect(within(results).getAllByRole("link", { name: "打开任务" })[0]).toHaveAttribute(
      "href",
      "/books/p-1/tasks/run-1?returnTo=%2Fbooks%2Fp-1%2Fquick-create%3Fsession%3Dsession-1",
    );
  });

  it("paginates long batch result lists without dropping the aggregate summary", async () => {
    setLocale("zh-CN");
    const story = {
      project,
      intent: null,
      outline: chapters,
      entities: [],
      facts: [],
      relationships: [],
      timeline: [],
      foreshadows: [],
      occupiedOutlineNodeIds: [],
      documents: [],
    };
    const chapterResults = Array.from({ length: 13 }, (_, index) => ({
      ...detail.chapterResults[0]!,
      runId: `run-${index + 1}`,
      sequence: index,
      outlineNodeId: index % 2 === 0 ? "chapter-1" : "chapter-2",
    }));
    const pagedDetail = {
      ...detail,
      chapterResults,
      links: chapterResults.map((result) => ({
        ...detail.links[0]!,
        runId: result.runId,
        outlineNodeId: result.outlineNodeId,
        sequence: result.sequence,
      })),
    };
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/projects/p-1/story-bible") return json(story);
      if (url === "/api/projects/p-1/compass") return json(null, 404);
      if (url === "/api/projects/p-1/autopilot/sessions") return json([session]);
      if (url === "/api/autopilot/sessions/session-1") return json(pagedDetail);
      throw new Error(`unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/books/p-1/quick-create?session=session-1"]}>
          <Routes>
            <Route path="/books/:projectId/quick-create" element={<QuickCreatePage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const results = await screen.findByRole("region", { name: "逐章结果" });
    expect(screen.getByText("已生成结果")).toBeInTheDocument();
    expect(results).toHaveTextContent("共 13 章");
    expect(within(results).getByText("第 1 / 2 页 · 共 13 章")).toBeInTheDocument();
    expect(within(results).getAllByRole("link", { name: "打开任务" })).toHaveLength(12);

    fireEvent.click(within(results).getByRole("button", { name: "下一页" }));
    expect(within(results).getByText("第 2 / 2 页 · 共 13 章")).toBeInTheDocument();
    expect(within(results).getAllByRole("link", { name: "打开任务" })).toHaveLength(1);
    expect(within(results).getByRole("button", { name: "下一页" })).toBeDisabled();
  });
});
