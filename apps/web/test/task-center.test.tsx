// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TaskCenter, TaskResult } from "../src/features/task-progress/task-center";

function json(value: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(value), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
}

function run(id: string, status: string) {
  return {
    id,
    projectId: "p-1",
    recipe: "chapter-production",
    recipeVersion: 1,
    mode: "chapter-gate",
    status,
    targetOutlineNodeId: null,
    policy: {},
    budgetUsage: {
      inputTokens: 0,
      outputTokens: 0,
      calls: 0,
      costUsd: 0,
      wallTimeMs: 0,
    },
    revisionCycle: 0,
    pauseRequested: false,
    cancelRequested: false,
    currentStepId: null,
    startedAt: null,
    finishedAt: null,
    createdAt: "2026-09-09T00:00:00.000Z",
    updatedAt: "2026-09-09T00:00:00.000Z",
    version: 0,
  };
}

function detail(current: ReturnType<typeof run>) {
  return {
    run: current,
    steps: [],
    events: [],
    latestCheckpoint: null,
    origin: null,
    parentTask: null,
    result: {
      planCandidate: null,
      manuscriptCandidate: null,
      reviewSummary: null,
      settlementCandidate: null,
      canonChangeSetId: null,
      foundationCandidateSetId: null,
      canonCandidateSetId: null,
      editProposalId: null,
      cocreateTurnId: null,
      cocreateSwipeId: null,
      sceneAdoptionId: null,
      documentId: null,
      documentVersionId: null,
      importBatchId: null,
      partialRecovery: null,
    },
    availableActions: [],
    llmCalls: [],
    contextReceipts: [],
    modelSnapshots: [],
    reviews: [],
    streams: [],
    effectivePolicy: null,
  };
}

function taskDetail(current: ReturnType<typeof run>) {
  return {
    ...detail(current),
    result: {
      ...detail(current).result,
      documentId: "doc-1",
      manuscriptCandidate: { content: "候选正文" },
    },
    availableActions: ["accept_manuscript"],
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ChapterFlow 原生任务中心", () => {
  it("按作者动作分组并对未知状态停止自动推进", async () => {
    const runs = [
      run("attention", "awaiting_user"),
      run("active", "running"),
      run("recover", "failed_recoverable"),
      run("done", "completed"),
      run("unknown", "future_status"),
    ];
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/projects/p-1/runs/page?limit=50") return json({ items: runs, nextCursor: null });
      if (url === "/api/projects/p-1/autopilot/sessions") return json([]);
      const match = /\/api\/runs\/([^?]+)/.exec(url);
      if (match) {
        const current = runs.find((item) => item.id === match[1]);
        return json(detail(current!));
      }
      throw new Error(`unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <TaskCenter projectId="p-1" />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("等待你的决定")).toBeInTheDocument();
    expect(screen.getByText("正在进行")).toBeInTheDocument();
    expect(screen.getByText("失败待恢复")).toBeInTheDocument();
    expect(screen.getByText("最近完成")).toBeInTheDocument();
    expect(screen.getByText("状态异常")).toBeInTheDocument();
    expect(await screen.findByText("任务状态无法识别")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重新读取状态" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "复制诊断" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "下载日志" })).toBeInTheDocument();
    expect(
      screen
        .getAllByRole("link", { name: "查看详情 →" })
        .map((link) => link.getAttribute("href")),
    ).toContain("/books/p-1/tasks/unknown");
  });

  it("展示连续创作批次的进度、停靠原因和返回入口", async () => {
    const sessions = [
      {
        id: "session-12345678",
        projectId: "p-1",
        mode: "autopilot",
        approvalMode: "per_chapter",
        scope: { startOutlineNodeId: null, endOutlineNodeId: null },
        origin: null,
        status: "failed",
        targetChapters: 5,
        windowSize: 2,
        maxRevisionCycles: 2,
        chapterPolicy: {},
        currentRunId: null,
        currentOutlineNodeId: null,
        completedChapters: 2,
        skippedChapters: 1,
        pauseRequested: false,
        cancelRequested: false,
        replanRequested: false,
        activeNotes: [],
        lastError: { message: "第 4 章需要重新规划" },
        createdAt: "2026-09-09T00:00:00.000Z",
        updatedAt: "2026-09-09T01:00:00.000Z",
        finishedAt: null,
        version: 1,
      },
    ];
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/projects/p-1/runs/page?limit=50") return json({ items: [], nextCursor: null });
      if (url === "/api/projects/p-1/autopilot/sessions") return json(sessions);
      throw new Error(`unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <TaskCenter projectId="p-1" />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("region", { name: "连续创作批次" })).toBeInTheDocument();
    expect(screen.getByText("3 / 5 章 · 逐章确认")).toBeInTheDocument();
    expect(screen.getByText("上次停靠：第 4 章需要重新规划")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "打开批次 →" })).toHaveAttribute(
      "href",
      "/books/p-1/quick-create?session=session-12345678",
    );
  });

  it("按游标继续加载更早任务，而不重复读取首屏", async () => {
    const newest = run("newest", "completed");
    const older = run("older", "failed");
    let pageReads = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/projects/p-1/autopilot/sessions") return json([]);
      if (url === "/api/projects/p-1/runs/page?limit=50") {
        pageReads += 1;
        return json({ items: [newest], nextCursor: "cursor-1" });
      }
      if (url === "/api/projects/p-1/runs/page?limit=50&cursor=cursor-1") {
        pageReads += 1;
        return json({ items: [older], nextCursor: null });
      }
      const match = /\/api\/runs\/([^?]+)/.exec(url);
      if (match) return json(detail(match[1] === newest.id ? newest : older));
      throw new Error(`unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <TaskCenter projectId="p-1" />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("最近完成")).toBeInTheDocument();
    const loadMore = await screen.findByRole("button", { name: /加载更早任务/ });
    expect(pageReads).toBe(1);
    loadMore.click();
    await screen.findByText("处理失败");
    expect(pageReads).toBe(2);
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes("cursor=cursor-1"))).toHaveLength(1);
  });

  it("接受任务正文遇到并发冲突时进入统一恢复路径", async () => {
    const current = run("conflict-run", "awaiting_user");
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/runs/conflict-run?")) return json(taskDetail(current));
      if (url === "/api/projects/p-1/studio/documents/doc-1") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              error: {
                code: "draft.conflict",
                message: "正文已在其他页面更新",
              },
            }),
            { status: 409, headers: { "content-type": "application/json" } },
          ),
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
        <MemoryRouter>
          <TaskResult projectId="p-1" runId="conflict-run" />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("button", { name: "接受正文" })).toBeInTheDocument();
    screen.getByRole("button", { name: "接受正文" }).click();
    expect(await screen.findByRole("alert", { name: "正文冲突恢复" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保留本地稿" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "刷新远端并放弃本地稿" })).toBeInTheDocument();
  });

  it("展示服务端返回的不可用动作原因", async () => {
    const current = run("reason-run", "awaiting_user");
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/runs/reason-run?")) {
        return json({
          ...detail(current),
          actionAvailability: [
            { action: "accept_plan", available: true, reasonCode: null },
            {
              action: "pause",
              available: false,
              reasonCode: "run.await_reason.mismatch",
            },
          ],
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
        <MemoryRouter>
          <TaskResult projectId="p-1" runId="reason-run" />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("其他操作为何不可用")).toBeInTheDocument();
    screen.getByText("其他操作为何不可用").click();
    expect(screen.getByText("当前停靠原因不需要这项操作。")).toBeInTheDocument();
  });
});
