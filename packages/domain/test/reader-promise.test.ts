import { describe, expect, it } from "vitest";

import { createReaderPromise, transitionReaderPromise } from "../src/index.js";

const now = "2026-09-14T00:00:00.000Z";

describe("Reader Promise domain lifecycle", () => {
  it("opens, advances, and pays off without losing the opening anchor", () => {
    const opened = createReaderPromise({
      id: "promise-1",
      projectId: "project-1",
      title: "凶手身份何时揭晓",
      description: "读者等待真相",
      openedChapterId: "chapter-1",
      openedChapterIndex: 1,
      now,
    });
    const advanced = transitionReaderPromise(
      opened,
      "ADVANCE",
      "chapter-2",
      2,
      now,
    );
    const paidOff = transitionReaderPromise(
      advanced,
      "PAYOFF",
      "chapter-3",
      3,
      now,
    );

    expect(advanced).toMatchObject({
      status: "open",
      openedChapterId: "chapter-1",
      lastAdvancedChapterId: "chapter-2",
      advanceCount: 1,
      version: 1,
    });
    expect(paidOff).toMatchObject({
      status: "paid_off",
      openedChapterId: "chapter-1",
      paidOffChapterId: "chapter-3",
      lastAdvancedChapterId: "chapter-3",
      advanceCount: 1,
      version: 2,
    });
  });

  it("does not allow a closed promise to transition again", () => {
    const promise = createReaderPromise({
      id: "promise-2",
      projectId: "project-1",
      title: "一封未寄出的信",
      openedChapterId: "chapter-1",
      openedChapterIndex: 1,
      now,
    });
    const paidOff = transitionReaderPromise(
      promise,
      "PAYOFF",
      "chapter-1",
      1,
      now,
    );
    expect(() =>
      transitionReaderPromise(paidOff, "ADVANCE", "chapter-2", 2, now),
    ).toThrow(/paid_off/);
  });
});
