import { expect, test, type Locator, type Page } from "@playwright/test";

const TERMINAL_RUN_STATUSES = new Set([
  "awaiting_user",
  "cancelled",
  "completed",
  "failed",
]);

async function selectEditorRange(editor: Locator, start: number, end: number) {
  await editor.evaluate(
    (element, range) => {
      const textarea = element as HTMLTextAreaElement;
      textarea.focus();
      textarea.setSelectionRange(range.start, range.end);
      textarea.dispatchEvent(new Event("select", { bubbles: true }));
      textarea.ownerDocument.dispatchEvent(new Event("selectionchange"));
    },
    { start, end },
  );
}

test("ChapterFlow 主链只经由原生 UI：设置 → 建书 → 大纲 → 写作 → AI → 发布", async ({
  page,
}, testInfo) => {
  const suffix = `${testInfo.project.name}-${Date.now()}`;
  const providerName = `E2E 模型服务 ${suffix}`;
  const modelName = `e2e-writer-${suffix}`;
  const title = `潮汐回归-${suffix}`;
  const chapterTitle = `雾港失灯-${suffix}`;
  const body =
    "林昇回港当夜，灯塔突然熄灭。退潮前，他在石阶下找到一封没有署名的信。";
  const backupLabel = `交付验收-${suffix}`;

  await page.goto("/settings/ai");
  await expect(
    page.getByRole("heading", { name: "设置", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "添加渠道" }).click();
  const providerForm = page
    .getByRole("heading", { name: "添加 AI 渠道" })
    .locator("..")
    .locator("..")
    .locator("form");
  await providerForm.getByLabel("名称").fill(providerName);
  await providerForm.getByLabel("服务地址").fill("https://e2e.example.com/v1");
  await providerForm
    .getByLabel("API Key 或环境变量引用")
    .fill("e2e-placeholder-key");
  await providerForm.getByRole("button", { name: "保存渠道" }).click();
  await expect(page.getByText(providerName, { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "添加模型" }).click();
  const modelForm = page
    .getByRole("heading", { name: "添加模型" })
    .locator("..")
    .locator("..")
    .locator("form");
  await modelForm.getByLabel("模型 ID").fill(modelName);
  await modelForm.getByRole("button", { name: "保存模型" }).click();
  await expect(
    page.locator(".cf-provider-models").getByText(modelName, { exact: true }),
  ).toBeVisible();
  await page.getByLabel("正文写作").selectOption({ label: modelName });

  await page.goto("/books");
  await page.getByRole("main").getByRole("link", { name: "新建作品" }).click();
  await page.getByLabel("书名", { exact: true }).fill(title);
  await page
    .getByLabel("一句话简介")
    .fill("失灯的守塔人必须在退潮前找回一封信。");
  await page.getByRole("button", { name: "创建作品", exact: true }).click();
  await expect(page).toHaveURL(/\/books\/[^/]+\/dashboard$/);
  const projectId = new URL(page.url()).pathname.split("/")[2]!;
  await expect(
    page.getByRole("heading", { name: "创作首页", exact: true }),
  ).toBeVisible();

  await page.goto(`/books/${projectId}/outline`);
  await page
    .getByRole("combobox", { name: "类型", exact: true })
    .selectOption({ label: "章节" });
  await page
    .getByRole("textbox", { name: "标题", exact: true })
    .fill(chapterTitle);
  await page
    .getByRole("textbox", { name: "摘要", exact: true })
    .fill("林昇回港当夜，灯塔突然熄灭。");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("已写入服务端");
  await page
    .getByRole("combobox", { name: "编辑对象", exact: true })
    .selectOption({ label: chapterTitle });
  await page.getByRole("link", { name: "去写作台写本章", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/books/${projectId}/write/`));

  const editor = page.getByRole("textbox", { name: "章节正文" });
  await expect(editor).toBeVisible();
  await editor.fill(body);
  await selectEditorRange(editor, 0, 8);
  await expect(
    page.getByRole("toolbar", { name: "选区 AI 工具" }),
  ).toBeVisible();
  const editResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname.endsWith("/selection-edits"),
  );
  await page
    .getByRole("toolbar", { name: "选区 AI 工具" })
    .getByRole("button", { name: "更霸气" })
    .click();
  const editCreated = (await (await editResponse).json()) as {
    run: { id: string };
  };
  await advanceRunToTerminal(page, projectId, editCreated.run.id);
  await page.getByRole("tab", { name: "AI" }).click();
  await expect(page.getByText(/处理失败|改写建议/).first()).toBeVisible({
    timeout: 12_000,
  });

  await page.goto(`/books/${projectId}/publish`);
  await expect(
    page.getByRole("heading", { name: "发布", exact: true }),
  ).toBeVisible();
  await page.getByLabel("备份说明").fill(backupLabel);
  await page.getByRole("button", { name: "创建备份" }).click();
  await expect(page.getByText(backupLabel, { exact: true })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载导出文件" }).click();
  await expect((await download).suggestedFilename()).toMatch(/\.md$/);
  const backupRow = page.locator(".cf-list-row", { hasText: backupLabel });
  await backupRow.getByRole("button", { name: "恢复为新作品" }).click();
  await page
    .getByRole("alertdialog", { name: "从备份恢复为新作品？" })
    .getByRole("button", { name: "开始恢复" })
    .click();
  await expect(page.getByRole("link", { name: "打开恢复作品" })).toBeVisible();
});

async function advanceRunToTerminal(
  page: Page,
  projectId: string,
  runId: string,
): Promise<void> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const response = await page.request.post(`/api/runs/${runId}/advance`, {
      data: { projectId },
    });
    if (response.status() !== 200) {
      throw new Error(`advance ${runId} returned ${response.status()}`);
    }
    const result = (await response.json()) as {
      snapshot: { run: { status: string } };
    };
    if (TERMINAL_RUN_STATUSES.has(result.snapshot.run.status)) return;
  }
  throw new Error(`Run ${runId} did not reach a terminal status.`);
}
