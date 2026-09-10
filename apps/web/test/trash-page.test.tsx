// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TrashPage } from "../src/pages/library/trash-page";

function json(value: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(value), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
}

const recycled = {
  id: "p-trash",
  title: "潮汐灯塔",
  subtitle: null,
  premise: "灯灭时港口遗忘一个人。",
  language: "zh-CN",
  phase: "idea",
  archivedAt: "2026-09-01T00:00:00.000Z",
  deletedAt: "2026-09-02T00:00:00.000Z",
  deletionToken: "delete-token",
  deleteAfter: "2026-10-02T00:00:00.000Z",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-09-02T00:00:00.000Z",
};

function renderTrash(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetchMock);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/books/trash"]}>
        <Routes>
          <Route path="/books/trash" element={<TrashPage />} />
          <Route path="/books/:projectId/dashboard" element={<p>作品首页</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("native recycle bin", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("restores a project and returns to its native dashboard", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/projects/recycle-bin") return json([recycled]);
      if (url === "/api/projects/p-trash/restore" && init?.method === "POST") {
        return json({ ...recycled, deletedAt: null, deletionToken: null, deleteAfter: null });
      }
      if (url === "/api/projects") return json([]);
      throw new Error(`unexpected request ${url}`);
    });
    renderTrash(fetchMock);

    fireEvent.click(await screen.findByRole("button", { name: "恢复作品" }));
    expect(await screen.findByText("作品首页")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/p-trash/restore",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("requires the exact title before permanent deletion", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/projects/recycle-bin") return json([recycled]);
      if (url === "/api/projects/p-trash/purge" && init?.method === "DELETE") {
        return new Response(null, { status: 204 });
      }
      throw new Error(`unexpected request ${url}`);
    });
    renderTrash(fetchMock);

    fireEvent.click(await screen.findByRole("button", { name: "彻底删除" }));
    const dialog = await screen.findByRole("alertdialog");
    const button = within(dialog).getByRole("button", { name: "彻底删除" });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText("永久删除作品名确认"), {
      target: { value: recycled.title },
    });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/p-trash/purge",
        expect.objectContaining({ method: "DELETE" }),
      );
    });
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
  });

  it("offers a refresh when another page invalidates the recycle-bin token", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/projects/recycle-bin") return json([recycled]);
      if (url === "/api/projects/p-trash/purge" && init?.method === "DELETE") {
        return json(
          { error: { code: "project.purge.token_mismatch", message: "stale" } },
          409,
        );
      }
      throw new Error(`unexpected request ${url}`);
    });
    renderTrash(fetchMock);

    fireEvent.click(await screen.findByRole("button", { name: "彻底删除" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.change(within(dialog).getByLabelText("永久删除作品名确认"), {
      target: { value: recycled.title },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "彻底删除" }));

    expect(await screen.findByText("回收站内容已在其他页面变化")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重新读取回收站" }));
    await waitFor(() => {
      expect(fetchMock.mock.calls.filter(([url]) => String(url) === "/api/projects/recycle-bin")).toHaveLength(2);
    });
  });
});
