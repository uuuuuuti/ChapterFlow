// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";

import { ApiError, isNotFoundError } from "../src/shared/api/client";
import { ResourceErrorState } from "../src/components/resource-error-state";

afterEach(cleanup);

describe("原生资源错误恢复", () => {
  it("把领域 404 解释成带回退入口的资源状态", () => {
    const error = new ApiError(
      "project.not_found",
      "Project not found",
      404,
    );
    expect(isNotFoundError(error)).toBe(true);

    render(
      <MemoryRouter>
        <ResourceErrorState
          error={error}
          backHref="/books"
          backLabel="回到作品库"
          title="找不到这本作品"
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("找不到这本作品");
    expect(screen.getByRole("link", { name: "回到作品库" })).toHaveAttribute(
      "href",
      "/books",
    );
  });

  it("保留非 404 的通用错误说明", () => {
    const error = new ApiError("project.read_failed", "读取失败", 503);
    expect(isNotFoundError(error)).toBe(false);

    render(
      <MemoryRouter>
        <ResourceErrorState
          error={error}
          backHref="/books"
          backLabel="回到作品库"
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("读取失败");
    expect(screen.queryByRole("link", { name: "回到作品库" })).toBeNull();
  });
});
