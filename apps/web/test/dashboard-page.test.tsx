// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DashboardPage } from "../src/pages/dashboard/dashboard-page";

function json(value: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(value), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
}

describe("native dashboard next actions", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("routes pending review work to the native chapter review surface", async () => {
    const overview = {
      project: {
        id: "p-1",
        title: "潮汐灯塔",
        subtitle: null,
        premise: "港口每年都会遗忘一个人。",
        language: "zh-CN",
        phase: "writing",
        archivedAt: null,
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-09T00:00:00.000Z",
      },
      progress: {
        lastWritingAt: "2026-09-09T00:00:00.000Z",
        wordCount: 1200,
        committedChapters: 1,
        totalChapters: 2,
      },
      currentChapter: null,
      activeTask: null,
      pending: {
        foundationCandidates: 0,
        reviewIssues: 2,
        revisionProposals: 1,
        canonChangeSets: 1,
        reviewDocumentId: "doc-1",
      },
      nextAction: { kind: "review_writing", targetId: "report-1" },
    };
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/projects/p-1/overview") return json(overview);
      if (url === "/api/projects/p-1/studio/documents") return json([]);
      if (url === "/api/projects/p-1/story-bible") return json({ foreshadows: [] });
      if (url === "/api/projects/p-1/foundation/candidates") return json([]);
      throw new Error(`unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/books/p-1/dashboard"]}>
          <Routes>
            <Route path="/books/:projectId/dashboard" element={<DashboardPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await screen.findByRole("heading", { name: "创作首页" });
    expect(screen.getByRole("heading", { name: "处理章节检查" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /打开检查/ })).toHaveAttribute(
      "href",
      "/books/p-1/write/doc-1?tab=review",
    );
    expect(screen.getByRole("link", { name: /章节检查/ })).toHaveAttribute(
      "href",
      "/books/p-1/write/doc-1?tab=review",
    );
    expect(screen.getByRole("link", { name: /AI 改写建议/ })).toHaveAttribute(
      "href",
      "/books/p-1/write/doc-1?tab=review",
    );
    expect(screen.getByRole("link", { name: /设定变化/ })).toHaveAttribute(
      "href",
      "/books/p-1/write?tab=canon",
    );
    expect(screen.getByRole("link", { name: /先建章纲/ })).toHaveAttribute(
      "href",
      "/books/p-1/outline",
    );
    expect(screen.getByRole("link", { name: "继续写作", exact: true })).toHaveAttribute(
      "href",
      "/books/p-1/write",
    );
    expect(screen.getByRole("link", { name: /创建第一章章纲/ })).toHaveAttribute(
      "href",
      "/books/p-1/outline",
    );
  });
});
