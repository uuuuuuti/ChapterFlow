import { describe, expect, it } from "vitest";

import { analyzeOpeningText } from "../src/index.js";

describe("signing sprint opening signals", () => {
  it("returns inspectable signals without turning them into a verdict", () => {
    const repeated = "林野推开门，看见走廊尽头亮着一盏红灯，门后传来三声轻响。";
    const report = analyzeOpeningText(
      `“你终于来了。”林野握紧门把手。\n\n${repeated}\n\n${repeated}`,
      "2026-09-15T00:00:00.000Z",
      { longParagraphThreshold: 10 },
    );

    expect(report.analyzedAt).toBe("2026-09-15T00:00:00.000Z");
    expect(report.metrics.characterCount).toBeGreaterThan(0);
    expect(report.metrics.dialogueCharacterCount).toBeGreaterThan(0);
    expect(report.metrics.repeatedParagraphCount).toBe(1);
    expect(report.metrics.longParagraphCount).toBe(3);
    expect(report.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "dialogue_ratio",
          direction: "observation",
        }),
        expect.objectContaining({ code: "repeated_paragraphs", threshold: 1 }),
      ]),
    );
    expect(report).not.toHaveProperty("score");
    expect(report).not.toHaveProperty("probability");
  });

  it("handles a blank opening as an explicit empty observation", () => {
    const report = analyzeOpeningText("", "2026-09-15T00:00:00.000Z");

    expect(report.analyzedChapterCount).toBe(0);
    expect(report.metrics).toMatchObject({
      characterCount: 0,
      paragraphCount: 0,
      dialogueRatio: 0,
      repeatedParagraphCount: 0,
    });
  });
});
