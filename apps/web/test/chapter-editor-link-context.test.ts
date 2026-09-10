import { describe, expect, it } from "vitest";

import { parseSelectionParam } from "../src/features/chapter-editor/chapter-editor";

describe("写作台链接上下文", () => {
  it("只接受正文版本内的非空 start:end 字符范围", () => {
    expect(parseSelectionParam("12:48")).toEqual({ start: 12, end: 48 });
    expect(parseSelectionParam("0:1")).toEqual({ start: 0, end: 1 });
    expect(parseSelectionParam("12:12")).toBeNull();
    expect(parseSelectionParam("48:12")).toBeNull();
    expect(parseSelectionParam("12-48")).toBeNull();
    expect(parseSelectionParam("9007199254740992:9007199254740993")).toBeNull();
  });
});
