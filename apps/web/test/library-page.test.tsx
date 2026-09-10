// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LibraryPage } from "../src/pages/library/library-page";

const PROJECTS = [
  {
    id: "book-tide",
    title: "潮汐灯塔",
    subtitle: null,
    premise: "港口每年都会遗忘一个人。",
    language: "zh-CN",
    phase: "writing",
    archivedAt: null,
    createdAt: "2026-08-01T10:00:00.000Z",
    updatedAt: "2026-08-10T10:00:00.000Z",
    committedChapters: 2,
    totalChapters: 5,
    wordCount: 2400,
    cover: null,
  },
  {
    id: "book-mountain",
    title: "山中回信",
    subtitle: null,
    premise: "一封迟到十年的回信。",
    language: "zh-CN",
    phase: "idea",
    archivedAt: null,
    createdAt: "2026-08-02T10:00:00.000Z",
    updatedAt: "2026-08-09T10:00:00.000Z",
    committedChapters: 0,
    totalChapters: 0,
    wordCount: 0,
    cover: null,
  },
];

function renderLibrary(entry = "/books") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/books" element={<LibraryPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("native library", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("searches native book cards and keeps the query in the URL", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(
        new Response(JSON.stringify(PROJECTS), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    renderLibrary();
    expect((await screen.findAllByText("潮汐灯塔")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("山中回信").length).toBeGreaterThan(0);

    fireEvent.change(screen.getByRole("textbox", { name: "搜索作品" }), {
      target: { value: "山中" },
    });
    expect(screen.queryAllByText("潮汐灯塔")).toHaveLength(0);
    expect(screen.getAllByText("山中回信").length).toBeGreaterThan(0);
    expect(screen.getByRole("textbox", { name: "搜索作品" })).toHaveValue("山中");
  });

  it("restores a deep-linked search after refresh", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(
        new Response(JSON.stringify(PROJECTS), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    renderLibrary("/books?q=灯塔");
    expect((await screen.findAllByText("潮汐灯塔")).length).toBeGreaterThan(0);
    expect(screen.queryAllByText("山中回信")).toHaveLength(0);
  });

  it("edits native book metadata without leaving the ChapterFlow library", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/projects" && !init?.method) return json(PROJECTS);
      if (url === "/api/projects/book-tide" && init?.method === "PUT") {
        return json({ ...PROJECTS[0], subtitle: "潮声之后", language: "en" });
      }
      throw new Error(`unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderLibrary();
    await screen.findAllByText("潮汐灯塔");

    fireEvent.click(screen.getAllByLabelText("更多：潮汐灯塔")[0]!);
    fireEvent.click(screen.getAllByRole("button", { name: "作品设置" })[0]!);
    fireEvent.change(screen.getByLabelText("副题"), { target: { value: "潮声之后" } });
    fireEvent.change(screen.getByLabelText("创作语言"), { target: { value: "en" } });
    fireEvent.click(screen.getByRole("button", { name: "保存作品设置" }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([url, request]) => String(url) === "/api/projects/book-tide" && request?.method === "PUT",
      );
      expect(call).toBeDefined();
      expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({
        title: "潮汐灯塔",
        subtitle: "潮声之后",
        language: "en",
        expectedUpdatedAt: PROJECTS[0].updatedAt,
      });
    });
  });
});

function json(value: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(value), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
}
