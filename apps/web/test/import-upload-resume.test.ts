// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { afterEach, describe, expect, it, vi } from "vitest";

import { sha256 } from "../src/shared/api/client";
import { uploadStoryFile } from "../src/shared/api/delivery";

function json(value: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(value), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
}

describe("chunked import recovery", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it("reuses a matching unfinished upload session after a browser restart", async () => {
    const bytes = new Uint8Array(2 * 1024 * 1024 + 1);
    bytes.fill(65);
    const file = new File([bytes], "resume.md", { type: "text/markdown" });
    const fileHash = await sha256(bytes);
    window.localStorage.setItem(`chapterflow:import:upload:${fileHash}`, "upload-1");
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/import-uploads/upload-1" && !init?.method) {
        return json({
          id: "upload-1",
          batchId: null,
          targetProjectId: null,
          filename: "resume.md",
          format: "markdown",
          totalBytes: bytes.length,
          chunkSize: 2 * 1024 * 1024,
          expectedHash: fileHash,
          receivedBytes: 2 * 1024 * 1024,
          receivedChunks: 1,
          status: "uploading",
          expiresAt: "2099-01-01T00:00:00.000Z",
          createdAt: "2026-09-09T00:00:00.000Z",
          updatedAt: "2026-09-09T00:00:00.000Z",
        });
      }
      if (url.startsWith("/api/import-uploads/upload-1/chunks/") && init?.method === "PUT") {
        return json({});
      }
      if (url === "/api/import-uploads/upload-1/complete" && init?.method === "POST") {
        return json({
          session: { id: "upload-1", status: "completed" },
          detail: { batch: { id: "batch-1" }, candidates: [] },
        }, 201);
      }
      throw new Error(`unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const detail = await uploadStoryFile(file, null, "markdown");

    expect(detail.batch.id).toBe("batch-1");
    expect(fetchMock.mock.calls.some(([url, request]) => String(url) === "/api/import-uploads" && (request as RequestInit | undefined)?.method === "POST")).toBe(false);
    expect(fetchMock.mock.calls.filter(([url, request]) => String(url).includes("/chunks/") && (request as RequestInit | undefined)?.method === "PUT")).toHaveLength(2);
    expect(window.localStorage.getItem(`chapterflow:import:upload:${fileHash}`)).toBeNull();
  });

  it("stops between chunks and clears the resumable key on explicit cancellation", async () => {
    const bytes = new Uint8Array(2 * 1024 * 1024 + 1);
    bytes.fill(66);
    const file = new File([bytes], "cancel.md", { type: "text/markdown" });
    const controller = new AbortController();
    const fileHash = await sha256(bytes);
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/import-uploads" && init?.method === "POST") {
        return json({
          id: "upload-cancel",
          batchId: null,
          targetProjectId: null,
          filename: file.name,
          format: "markdown",
          totalBytes: bytes.length,
          chunkSize: 2 * 1024 * 1024,
          expectedHash: fileHash,
          receivedBytes: 0,
          receivedChunks: 0,
          status: "uploading",
          expiresAt: "2099-01-01T00:00:00.000Z",
          createdAt: "2026-09-09T00:00:00.000Z",
          updatedAt: "2026-09-09T00:00:00.000Z",
        });
      }
      if (url === "/api/import-uploads/upload-cancel/chunks/0" && init?.method === "PUT") {
        controller.abort();
        return json({});
      }
      throw new Error(`unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      uploadStoryFile(file, null, "markdown", undefined, controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(window.localStorage.getItem(`chapterflow:import:upload:${fileHash}`)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/import-uploads/upload-cancel/complete",
      expect.anything(),
    );
  });
});
