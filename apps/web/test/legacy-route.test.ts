import { describe, expect, it } from "vitest";
import { legacyRouteTarget } from "../src/lib/legacy-route";

describe("legacyRouteTarget", () => {
  it("moves project-free legacy entry points to the library", () => {
    expect(legacyRouteTarget("/shelf", "?q=灯塔", "#recent")).toBe(
      "/books?q=灯塔#recent",
    );
    expect(legacyRouteTarget("/autopilot")).toBe("/books");
  });

  it("maps bible spreads to the native outline and knowledge sections", () => {
    expect(legacyRouteTarget("/projects/p-1/bible", "?spread=outline")).toBe(
      "/books/p-1/outline",
    );
    expect(legacyRouteTarget("/projects/p-1/bible", "?spread=entities")).toBe(
      "/books/p-1/knowledge/characters",
    );
    expect(legacyRouteTarget("/projects/p-1/bible", "?spread=foreshadows")).toBe(
      "/books/p-1/knowledge/foreshadow",
    );
  });

  it("keeps the studio document, outline, task and review context", () => {
    expect(
      legacyRouteTarget(
        "/projects/p-1/studio",
        "?document=doc-1&run=run-1&focus=review",
      ),
    ).toBe("/books/p-1/write/doc-1?task=run-1&tab=review");
    expect(
      legacyRouteTarget(
        "/projects/p-1/studio/",
        "?document=doc-1&focus=canon",
      ),
    ).toBe("/books/p-1/write/doc-1?tab=canon");
    expect(
      legacyRouteTarget("/projects/p-1/studio", "?outline=node-1"),
    ).toBe("/books/p-1/write?outline=node-1");
    expect(legacyRouteTarget("/projects/p-1/runs", "?run=run-2")).toBe(
      "/books/p-1/tasks/run-2?returnTo=%2Fbooks%2Fp-1%2Fdashboard",
    );
    expect(legacyRouteTarget("/projects/p-1/runs")).toBe(
      "/books/p-1/tasks",
    );
  });

  it("maps autopilot, lab, delivery and unknown project workspaces", () => {
    expect(
      legacyRouteTarget("/projects/p-1/autopilot", "?session=s-1"),
    ).toBe("/books/p-1/quick-create?session=s-1");
    expect(legacyRouteTarget("/projects/p-1/lab", "?tool=predict")).toBe(
      "/books/p-1/advanced?tool=predict",
    );
    expect(legacyRouteTarget("/projects/p-1/delivery")).toBe(
      "/books/p-1/publish",
    );
    expect(legacyRouteTarget("/projects/p-1/retired")).toBe(
      "/books/p-1/dashboard",
    );
  });

  it("preserves deep-link selection, session, return and hash context without looping", () => {
    const studio = legacyRouteTarget(
      "/projects/p%2F1/studio/",
      "?document=doc%2F1&outline=node-1&run=run-1&focus=selection&selection=12%3A30&returnTo=%2Fprojects%2Fp%252F1%2Fstudio",
      "#editor",
    );
    expect(studio).toContain("/books/p%2F1/write/doc%2F1?");
    const studioUrl = new URL(`https://chapterflow.test${studio}`);
    expect(studioUrl.searchParams.get("task")).toBe("run-1");
    expect(studioUrl.searchParams.get("outline")).toBe("node-1");
    expect(studioUrl.searchParams.get("selection")).toBe("12:30");
    expect(studioUrl.searchParams.get("focus")).toBe("selection");
    expect(studioUrl.hash).toBe("#editor");
    expect(legacyRouteTarget("/projects/p-1/autopilot/", "?session=s-1&returnTo=%2Fbooks%2Fp-1%2Fdashboard", "#progress")).toBe(
      "/books/p-1/quick-create?session=s-1&returnTo=%2Fbooks%2Fp-1%2Fdashboard#progress",
    );
    expect(legacyRouteTarget("/not-a-project")).toBeNull();
  });

  it("moves co-create sessions out of the old Studio and keeps the writing return target", () => {
    const target = legacyRouteTarget(
      "/projects/book-1/studio",
      "?mode=cocreate&session=session-7&document=doc-2&focus=review&selection=4%3A9",
    );
    expect(target).toBe(
      "/books/book-1/quick-create?returnTo=%2Fbooks%2Fbook-1%2Fwrite%2Fdoc-2%3Ftab%3Dreview%26selection%3D4%253A9&session=session-7",
    );
  });

  it("supports nested legacy resource paths and session-only run links", () => {
    expect(legacyRouteTarget("/projects/book-1/studio/documents/doc-2")).toBe(
      "/books/book-1/write/doc-2",
    );
    expect(legacyRouteTarget("/projects/book-1/runs", "?session=s-2")).toBe(
      "/books/book-1/quick-create?session=s-2",
    );
    expect(legacyRouteTarget("/projects/book-1/autopilot/s-2")).toBe(
      "/books/book-1/quick-create?session=s-2",
    );
  });

  it("does not throw on malformed encoded IDs and normalizes a project root", () => {
    expect(legacyRouteTarget("/projects/%E0%A4%A/studio")).toBe(
      "/books/%25E0%25A4%25A/write",
    );
    expect(legacyRouteTarget("projects/book-1")).toBe(
      "/books/book-1/dashboard",
    );
  });
});
