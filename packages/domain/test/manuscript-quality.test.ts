import { describe, expect, it } from "vitest";

import {
  effectiveManuscriptCharacterCount,
  manuscriptBodyForCounting,
} from "../src/manuscript-quality.js";

describe("manuscript quality character counting", () => {
  it("excludes reasoning, transport markers, fences, and headings", () => {
    const value =
      "<think>private reasoning</think>\n# 第 1 章\n```text\n甲 乙\n```\n<manuscript>丙丁</manuscript>";
    expect(manuscriptBodyForCounting(value)).toBe("甲乙丙丁");
    expect(effectiveManuscriptCharacterCount(value)).toBe(4);
  });
});
