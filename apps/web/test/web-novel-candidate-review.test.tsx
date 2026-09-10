// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WebNovelCandidateReview } from "../src/features/web-novel/web-novel-candidate-review";

function json(value: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(value), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
}

describe("native web-novel candidate review", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows evidence and sends an explicit apply decision", async () => {
    const candidate = {
      id: "set-1",
      projectId: "p-1",
      runId: "run-1",
      stepId: "step-1",
      kind: "profile",
      outlineNodeId: null,
      instruction: "强化承诺",
      summary: "让读者第一章就知道要追什么",
      sourceProfileVersion: 1,
      sourceBriefVersion: null,
      sourceDocumentId: null,
      sourceDocumentVersionId: null,
      sourceOutlineUpdatedAt: null,
      baseFingerprint: "base",
      currentFingerprint: "base",
      stale: false,
      status: "candidate",
      createdAt: "2026-09-09T10:00:00.000Z",
      decidedAt: null,
      items: [
        {
          id: "item-1",
          operation: "update",
          title: "明确核心承诺",
          rationale: "让前三章体检可以核对承诺是否兑现。",
          impact: ["检查报告会引用新的承诺"],
          before: { promise: null },
          after: { promise: "每章揭开一层谜团" },
          evidence: [
            {
              sourceType: "profile",
              sourceId: "p-1",
              label: "当前作品档案",
              quote: "当前档案尚未填写核心承诺。",
              versionId: null,
            },
          ],
          requiresLockedConfirmation: false,
          decision: null,
        },
      ],
    };
    const calls: { url: string; method: string | undefined; body?: string }[] = [];
    let list = [candidate];
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, method: init?.method, body: init?.body?.toString() });
      if (url === "/api/projects/p-1/web-novel/candidates?kind=profile") return json(list);
      if (url.endsWith("/decisions") && init?.method === "POST") {
        list = [
          {
            ...candidate,
            status: "applied",
            decidedAt: "2026-09-09T10:01:00.000Z",
            items: [{ ...candidate.items[0], decision: { action: "apply", result: null, decidedAt: "2026-09-09T10:01:00.000Z" } }],
          },
        ];
        return json({ candidateSet: list[0], item: list[0].items[0] });
      }
      throw new Error(`unexpected request ${url}`);
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    render(
      <QueryClientProvider client={client}>
        <WebNovelCandidateReview
          projectId="p-1"
          kind="profile"
          title="AI 档案候选"
          description="先审阅，再写入作品档案。"
          defaultInstruction="强化作品承诺"
        />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("明确核心承诺")).toBeInTheDocument();
    expect(screen.getByText("当前档案尚未填写核心承诺。")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "采纳" }));
    await waitFor(() => {
      expect(
        calls.some(
          (call) =>
            call.method === "POST" &&
            call.url.endsWith("/api/projects/p-1/web-novel/candidates/set-1/items/item-1/decisions") &&
            JSON.parse(call.body ?? "{}").action === "apply",
        ),
      ).toBe(true);
    });
  });

  it("explains a stale candidate conflict and offers a safe refresh", async () => {
    const candidate = {
      id: "set-stale",
      projectId: "p-1",
      runId: "run-stale",
      stepId: "step-stale",
      kind: "profile",
      outlineNodeId: null,
      instruction: "冲突测试",
      summary: "旧基线候选",
      sourceProfileVersion: 1,
      sourceBriefVersion: null,
      sourceDocumentId: null,
      sourceDocumentVersionId: null,
      sourceOutlineUpdatedAt: null,
      baseFingerprint: "old",
      currentFingerprint: "new",
      stale: false,
      status: "candidate",
      createdAt: "2026-09-09T10:00:00.000Z",
      decidedAt: null,
      items: [{
        id: "item-stale",
        operation: "update",
        title: "更新承诺",
        rationale: "测试并发保护",
        impact: [],
        before: { promise: "旧" },
        after: { promise: "新" },
        evidence: [],
        requiresLockedConfirmation: false,
        decision: null,
      }],
    };
    const list: typeof candidate[] = [candidate];
    const calls: string[] = [];
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url === "/api/projects/p-1/web-novel/candidates?kind=profile") return json(list);
      if (url.endsWith("/decisions") && init?.method === "POST") {
        return json({ error: { code: "web_novel_candidate.source.stale", message: "stale" } }, 409);
      }
      throw new Error(`unexpected request ${url}`);
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <WebNovelCandidateReview
          projectId="p-1"
          kind="profile"
          title="AI 档案候选"
          description="先审阅，再写入作品档案。"
          defaultInstruction="冲突测试"
        />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("更新承诺")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "采纳" }));
    expect(await screen.findByText("候选基线已变化，未写入当前档案或简报。")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重新读取并检查" }));
    await waitFor(() => expect(calls.filter((call) => call.startsWith("GET ")).length).toBeGreaterThan(1));
  });
});
