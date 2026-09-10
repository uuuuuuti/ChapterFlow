import { describe, expect, it } from "vitest";

import {
  findDuplicateImportBatch,
  productionAssetRoute,
} from "../src/features/production-tools/production-tools";

describe("productionAssetRoute", () => {
  it("keeps failed asset runs inside the native task center", () => {
    expect(productionAssetRoute("book-1", "run", "run-1", true)).toBe(
      "/books/book-1/tasks/run-1?returnTo=%2Fbooks%2Fbook-1%2Fadvanced%3Ftool%3Dassets",
    );
  });

  it("returns to native knowledge for applied imports", () => {
    expect(productionAssetRoute("book-1", "bible", null, true)).toBe(
      "/books/book-1/knowledge",
    );
  });

  it("keeps compatibility Settings links inside the native shell", () => {
    expect(productionAssetRoute("book-1", "run", "run-1", false)).toBe(
      "/books/book-1/tasks/run-1?returnTo=%2Fbooks%2Fbook-1%2Fadvanced%3Ftool%3Dassets",
    );
  });

  it("flags an existing import with the same source hash", () => {
    expect(
      findDuplicateImportBatch(
        [
          {
            id: "old-batch",
            targetProjectId: "book-1",
            filename: "story.md",
            format: "markdown",
            sourceHash: "a".repeat(64),
            sourceCharacters: 100,
            status: "previewed",
            metadata: {},
            analysisRunId: null,
            appliedProjectId: null,
            createdAt: "2026-09-01T00:00:00.000Z",
            updatedAt: "2026-09-01T00:00:00.000Z",
          },
        ],
        {
          batch: {
            id: "new-batch",
            targetProjectId: "book-1",
            filename: "story-copy.md",
            format: "markdown",
            sourceHash: "a".repeat(64),
            sourceCharacters: 100,
            status: "previewed",
            metadata: {},
            analysisRunId: null,
            appliedProjectId: null,
            createdAt: "2026-09-02T00:00:00.000Z",
            updatedAt: "2026-09-02T00:00:00.000Z",
          },
          candidates: [],
        },
      ),
    ).toBe("old-batch");
  });
});
