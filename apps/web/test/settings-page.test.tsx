// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLocale } from "../src/i18n";
import { SettingsPage } from "../src/pages/settings/settings-page";

const provider = {
  id: "provider-1",
  name: "主渠道",
  wireApi: "openai-chat",
  baseUrl: "https://api.example.com/v1",
  endpoint: null,
  credentialRef: "env:CF_KEY",
  anthropicVersion: null,
  headers: {},
  queryParams: {},
  requestStartTimeoutMs: null,
  streamIdleTimeoutMs: null,
  enabled: true,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};
const model = {
  id: "model-1",
  providerId: provider.id,
  modelId: "chapter-model",
  taskType: "writing",
  contextWindow: 64_000,
  maxOutputTokens: 8_192,
  sampling: {},
  capabilities: [],
  enabled: true,
  metadataSource: "manual",
  metadataVerifiedAt: null,
  metadataStale: false,
  createdAt: provider.createdAt,
  updatedAt: provider.updatedAt,
};

function json(value: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(value), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
}

function renderSettings() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/settings/ai"]}>
        <Routes>
          <Route path="/settings/:section" element={<SettingsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  setLocale("zh-CN");
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ChapterFlow 原生 AI 设置", () => {
  it("创建渠道失败时保留表单并显示错误，成功后刷新配置", async () => {
    let providers = [provider];
    let createAttempts = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/providers" && init?.method === "POST") {
        createAttempts += 1;
        if (createAttempts === 1)
          return json({ error: { code: "provider.duplicate", message: "名称已存在" } }, 409);
        const created = { ...provider, id: "provider-2", name: "备用渠道" };
        providers = [...providers, created];
        return json(created, 201);
      }
      if (url === "/api/providers") return json(providers);
      if (url === "/api/models") return json([model]);
      if (url === "/api/assignments") return json([]);
      throw new Error(`unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderSettings();

    fireEvent.click(await screen.findByRole("button", { name: "添加渠道" }));
    const form = screen.getByText("添加 AI 渠道").closest("form")!;
    fireEvent.change(within(form).getByLabelText("名称"), { target: { value: "备用渠道" } });
    fireEvent.change(within(form).getByLabelText("服务地址"), { target: { value: "https://backup.example.com" } });
    fireEvent.submit(form);
    expect(await screen.findByText("渠道保存失败")).toBeInTheDocument();
    expect(screen.getByText("添加 AI 渠道")).toBeInTheDocument();

    fireEvent.submit(form);
    await waitFor(() => expect(screen.queryByText("添加 AI 渠道")).not.toBeInTheDocument());
    expect(await screen.findByText("备用渠道")).toBeInTheDocument();
  });

  it("删除渠道先确认，服务端拒绝时保留对话框并说明配置未改变", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/providers") {
        if (init?.method === "DELETE")
          return json({ error: { code: "provider.in_use", message: "渠道仍被模型使用" } }, 409);
        return json([provider]);
      }
      if (url === "/api/models") return json([model]);
      if (url === "/api/assignments") return json([]);
      throw new Error(`unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderSettings();

    fireEvent.click(await screen.findByRole("button", { name: "删除渠道 主渠道" }));
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText(/确认删除渠道 主渠道/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "删除" }));
    expect(await within(screen.getByRole("alertdialog")).findByText("删除失败，配置未改变")).toBeInTheDocument();
    expect(screen.getByText("主渠道")).toBeInTheDocument();
  });

  it("测试连接使用模型记录 ID，而不是上游模型字符串", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/providers") return json([provider]);
      if (url === "/api/models") return json([model]);
      if (url === "/api/assignments") return json([]);
      if (url === "/api/providers/test") {
        return json({
          providerId: provider.id,
          modelId: model.id,
          startedAt: provider.createdAt,
          finishedAt: provider.updatedAt,
          stages: [
            { stage: "text", status: "passed", latencyMs: 1, detail: "ok" },
          ],
        });
      }
      throw new Error(`unexpected request ${url} ${init?.method ?? "GET"}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderSettings();

    fireEvent.click(await screen.findByRole("button", { name: "测试连接" }));
    await screen.findByText("最近测试：通过");

    const call = fetchMock.mock.calls.find(([input]) => String(input) === "/api/providers/test");
    expect(call).toBeDefined();
    expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({
      providerId: provider.id,
      modelId: model.id,
    });
  });
});
