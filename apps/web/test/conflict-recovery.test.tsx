// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ConflictRecovery } from "../src/components/conflict-recovery";

describe("ConflictRecovery", () => {
  it("does not show a recovery choice for an ordinary error", () => {
    render(
      <ConflictRecovery
        error={new Error("模型暂时不可用")}
        onKeepLocal={vi.fn()}
        onRefreshRemote={vi.fn()}
        onOpenDiff={vi.fn()}
      />,
    );
    expect(screen.queryByRole("alert", { name: "正文冲突恢复" })).not.toBeInTheDocument();
  });

  it("offers keep-local, diff and remote recovery actions for a conflict", () => {
    const keepLocal = vi.fn();
    const refreshRemote = vi.fn();
    const openDiff = vi.fn();
    render(
      <ConflictRecovery
        error={new Error("正文已在 AI 生成后修改。当前稿件已保留。")}
        onKeepLocal={keepLocal}
        onRefreshRemote={refreshRemote}
        onOpenDiff={openDiff}
      />,
    );

    expect(screen.getByRole("alert", { name: "正文冲突恢复" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "保留本地稿" }));
    fireEvent.click(screen.getByRole("button", { name: "打开版本差异" }));
    fireEvent.click(screen.getByRole("button", { name: "刷新远端并放弃本地稿" }));
    expect(keepLocal).toHaveBeenCalledOnce();
    expect(openDiff).toHaveBeenCalledOnce();
    expect(refreshRemote).toHaveBeenCalledOnce();
  });
});
