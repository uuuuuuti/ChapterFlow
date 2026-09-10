import { describe, expect, it } from "vitest";

import {
  chapterFlowProjectPath,
  legacyProjectWorkspacePath,
  projectWorkspacePath,
} from "../src/lib/project-route";

describe("project route builders", () => {
  it("uses ChapterFlow paths for the default helper", () => {
    expect(projectWorkspacePath("book/1", "overview")).toBe(
      "/books/book%2F1/dashboard",
    );
    expect(projectWorkspacePath("book-1", "bible")).toBe(
      "/books/book-1/outline",
    );
    expect(projectWorkspacePath("book-1", "studio")).toBe(
      "/books/book-1/write",
    );
    expect(projectWorkspacePath("book-1", "runs")).toBe(
      "/books/book-1/tasks",
    );
  });

  it("keeps legacy paths behind an explicitly named compatibility helper", () => {
    expect(legacyProjectWorkspacePath("book-1", "studio")).toBe(
      "/projects/book-1/studio",
    );
  });

  it("maps native navigation without exposing internal workspace names", () => {
    expect(chapterFlowProjectPath("book-1", "bible")).toBe(
      "/books/book-1/outline",
    );
    expect(chapterFlowProjectPath("book-1", "delivery")).toBe(
      "/books/book-1/publish",
    );
    expect(chapterFlowProjectPath("book-1", "autopilot")).toBe(
      "/books/book-1/quick-create",
    );
    expect(chapterFlowProjectPath("book-1", "runs")).toBe(
      "/books/book-1/tasks",
    );
  });
});
