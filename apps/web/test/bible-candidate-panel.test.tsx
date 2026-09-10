// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLocale } from "../src/i18n";
import { CanonCandidatePanel } from "../src/features/canon/canon-candidate-panel";

/* Canon 候选桌：指示文本与 startedRunId 绑定 Spread 身份，切页重挂载。 */

function json(value: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(value), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
}

function renderPanel(spread: "intent" | "outline") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CanonCandidatePanel projectId="p-1" spread={spread} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  setLocale("zh-CN");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Canon 候选桌", () => {
  it("所有未裁定候选始终可见，终态历史只补最近三组", async () => {
    const candidate = (index: number, status: "candidate" | "applied") => ({
      id: `set-${index}`,
      projectId: "p-1",
      runId: `run-${index}`,
      stepId: `step-${index}`,
      spread: "intent",
      instruction: `指示 ${index}`,
      summary: `候选组 ${index}`,
      baseFingerprint: `base-${index}`,
      currentFingerprint: `current-${index}`,
      stale: false,
      status,
      items: [],
      createdAt: `2026-08-${String(10 - index).padStart(2, "0")}T00:00:00.000Z`,
      decidedAt: status === "applied" ? "2026-08-11T00:00:00.000Z" : null,
    });
    const sets = [
      candidate(1, "applied"),
      candidate(2, "applied"),
      candidate(3, "applied"),
      candidate(4, "applied"),
      candidate(5, "candidate"),
      candidate(6, "candidate"),
      candidate(7, "candidate"),
      candidate(8, "candidate"),
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/projects/p-1/canon-spreads/intent/candidates")
          return json(sets);
        if (url === "/api/projects/p-1/runs") return json([]);
        throw new Error(`unexpected request ${url}`);
      }),
    );
    renderPanel("intent");

    for (const index of [5, 6, 7, 8]) {
      expect(await screen.findByText(`候选组 ${index}`)).toBeInTheDocument();
    }
    expect(screen.getByText("候选组 1")).toBeInTheDocument();
    expect(screen.getByText("候选组 3")).toBeInTheDocument();
    expect(screen.queryByText("候选组 4")).not.toBeInTheDocument();
  });

  it("显示候选的来源正文版本并提供回到正文的入口", async () => {
    const candidate = {
      id: "set-source",
      projectId: "p-1",
      runId: "run-source",
      stepId: "step-source",
      sourceDocumentId: "document-source",
      sourceDocumentVersionId: "version-source-1234567890",
      spread: "intent",
      instruction: "保持承诺一致",
      summary: "来源版本候选",
      baseFingerprint: "base",
      currentFingerprint: "current",
      stale: false,
      status: "candidate",
      items: [],
      createdAt: "2026-08-10T00:00:00.000Z",
      decidedAt: null,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/projects/p-1/canon-spreads/intent/candidates")
          return json([candidate]);
        if (url === "/api/projects/p-1/runs") return json([]);
        throw new Error(`unexpected request ${url}`);
      }),
    );
    renderPanel("intent");

    expect(await screen.findByText(/基于正文版本 version-/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "打开正文" })).toHaveAttribute(
      "href",
      "/books/p-1/write/document-source?returnTo=%2Fbooks%2Fp-1%2Foutline",
    );
  });

  it("在章纲页把最多三组候选汇总为横向比较卡", async () => {
    const makeSet = (index: number) => ({
      id: `outline-set-${index}`,
      projectId: "p-1",
      runId: `outline-run-${index}`,
      stepId: `outline-step-${index}`,
      sourceOutlineNodeId: "outline-node-1",
      sourceOutlineUpdatedAt: "2026-08-10T00:00:00.000Z",
      spread: "outline",
      instruction: `方案 ${index}`,
      summary: `章纲方案 ${index}`,
      baseFingerprint: `base-${index}`,
      currentFingerprint: `current-${index}`,
      stale: false,
      status: "candidate",
      items: [
        {
          id: `item-${index}`,
          operation: index === 1 ? "create" : "update",
          targetId: index === 1 ? null : "outline-node-1",
          title: "第一章冲突",
          rationale: "让开篇尽快出现可验证的冲突。",
          impact: [`方案 ${index} 的冲突强度`],
          before: null,
          after: null,
          diff: [],
          evidence: [],
          requiresLockedConfirmation: false,
          decision: null,
        },
      ],
      createdAt: `2026-08-${String(10 + index).padStart(2, "0")}T00:00:00.000Z`,
      decidedAt: null,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/projects/p-1/canon-spreads/outline/candidates")
          return json([makeSet(1), makeSet(2)]);
        if (url === "/api/projects/p-1/runs") return json([]);
        throw new Error(`unexpected request ${url}`);
      }),
    );
    renderPanel("outline");

    expect(await screen.findByRole("heading", { name: "最多三组章纲候选" })).toBeInTheDocument();
    expect(screen.getAllByText("章纲方案 1").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("章纲方案 2").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/方案 1 的冲突强度/).length).toBeGreaterThanOrEqual(2);
  });

  it("可恢复失败仍显示活动任务和自动重试状态", async () => {
    const recoverableRun = {
      id: "run-recoverable",
      projectId: "p-1",
      recipe: "canon-spread-candidate",
      recipeVersion: 1,
      mode: "manual",
      status: "failed_recoverable",
      targetOutlineNodeId: null,
      policy: { canonSpread: "intent" },
      budgetLimit: {
        maxInputTokens: 100_000,
        maxOutputTokens: 24_000,
        maxCalls: 6,
        maxCostUsd: null,
        maxWallTimeMs: 600_000,
      },
      budgetUsage: {
        inputTokens: 0,
        outputTokens: 0,
        calls: 1,
        costUsd: 0,
        wallTimeMs: 45_000,
      },
      revisionCycle: 0,
      pauseRequested: false,
      cancelRequested: false,
      currentStepId: null,
      startedAt: "2026-08-10T10:00:00.000Z",
      finishedAt: null,
      createdAt: "2026-08-10T10:00:00.000Z",
      updatedAt: "2026-08-10T10:00:45.000Z",
      version: 2,
    };
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/projects/p-1/canon-spreads/intent/candidates")
        return json([]);
      if (url === "/api/projects/p-1/runs") return json([recoverableRun]);
      if (url === "/api/runs/run-recoverable?projectId=p-1")
        return json({
          run: recoverableRun,
          steps: [],
          events: [],
          latestCheckpoint: null,
        });
      throw new Error(`unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPanel("intent");

    await screen.findByText("AI 正在整理这一页的候选");
    expect(
      screen.getByText("本次响应超时，系统正在等待自动重试；可以离开此页。"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "生成候选修改" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("候选没有生成")).not.toBeInTheDocument();
  });

  it("失败后重试同一指示时复用 requestId，修改指示后换新键", async () => {
    const requestBodies: Array<Record<string, unknown>> = [];
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (
        url === "/api/projects/p-1/canon-spreads/intent/candidates" &&
        init?.method === "POST"
      ) {
        requestBodies.push(
          JSON.parse(String(init.body)) as Record<string, unknown>,
        );
        return Promise.reject(new Error("response lost"));
      }
      if (url === "/api/projects/p-1/canon-spreads/intent/candidates") {
        return json([]);
      }
      if (url === "/api/projects/p-1/runs") return json([]);
      throw new Error(`unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPanel("intent");

    const input = await screen.findByLabelText("设定修改说明");
    fireEvent.change(input, { target: { value: "强化结局代价" } });
    fireEvent.click(screen.getByRole("button", { name: "生成候选修改" }));
    await waitFor(() => expect(requestBodies).toHaveLength(1));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "生成候选修改" }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "生成候选修改" }));
    await waitFor(() => expect(requestBodies).toHaveLength(2));
    expect(requestBodies[1]?.requestId).toBe(requestBodies[0]?.requestId);

    fireEvent.change(input, { target: { value: "强化结局的记忆代价" } });
    fireEvent.click(screen.getByRole("button", { name: "生成候选修改" }));
    await waitFor(() => expect(requestBodies).toHaveLength(3));
    expect(requestBodies[2]?.requestId).not.toBe(requestBodies[0]?.requestId);
  });

  it("切换 Spread 后未提交的指示与进行中的任务提示都被重置", async () => {
    const runs = [
      {
        id: "run-intent",
        projectId: "p-1",
        recipe: "canon-spread-candidate",
        recipeVersion: 1,
        mode: "manual",
        status: "running",
        targetOutlineNodeId: null,
        policy: { canonSpread: "intent" },
        budgetLimit: { maxInputTokens: 100_000, maxOutputTokens: 24_000, maxCalls: 6, maxCostUsd: null, maxWallTimeMs: 600_000 },
        budgetUsage: { inputTokens: 0, outputTokens: 0, calls: 1, costUsd: 0, wallTimeMs: 45_000 },
        revisionCycle: 0,
        pauseRequested: false,
        cancelRequested: false,
        currentStepId: null,
        startedAt: "2026-08-10T10:00:00.000Z",
        finishedAt: null,
        createdAt: "2026-08-10T10:00:00.000Z",
        updatedAt: "2026-08-10T10:00:45.000Z",
        version: 2,
      },
    ];
    const runDetail = {
      run: runs[0],
      steps: [],
      events: [],
      latestCheckpoint: null,
    };
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/projects/p-1/canon-spreads/intent/candidates") return json([]);
      if (url === "/api/projects/p-1/canon-spreads/outline/candidates") return json([]);
      if (url === "/api/projects/p-1/runs") return json(runs);
      if (url === "/api/runs/run-intent?projectId=p-1") return json(runDetail);
      throw new Error(`unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const view = renderPanel("intent");

    /* intent 页：输入指示，同时存在进行中的 intent Run */
    fireEvent.change(screen.getByLabelText("设定修改说明"), {
      target: { value: "写给意图页的指示" },
    });
    expect(screen.getByLabelText("设定修改说明")).toHaveValue("写给意图页的指示");
    await screen.findByText("AI 正在整理这一页的候选");

    /* 切到 outline 页：输入框与 Run 提示都不应从 intent 页串过来 */
    view.rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
        <MemoryRouter>
          <CanonCandidatePanel projectId="p-1" spread="outline" />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByLabelText("设定修改说明");
    expect(screen.getByLabelText("设定修改说明")).toHaveValue("");
    expect(screen.queryByText("AI 正在整理这一页的候选")).not.toBeInTheDocument();
  });
});
