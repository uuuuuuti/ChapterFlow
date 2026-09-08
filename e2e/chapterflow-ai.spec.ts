import { expect, test } from "@playwright/test";

test("V2 AI 续写、离页恢复、接受、选区改写与检查", async ({ page }, info) => {
  test.skip(
    process.env.CHAPTERFLOW_E2E_SUCCESS_MODEL !== "1",
    "使用独立成功模型运行，保留原故障用例语义",
  );
  test.setTimeout(120000);
  await page.goto("/books/new");
  await page
    .getByLabel("书名", { exact: true })
    .fill(`AI 创作验收-${info.project.name}-${Date.now()}`);
  await page.getByRole("button", { name: "创建作品", exact: true }).click();
  await page.getByRole("link", { name: "继续写作", exact: true }).click();
  await page
    .locator(".cf-writing-empty")
    .getByRole("button", { name: "新建章节", exact: true })
    .click();
  await page.getByLabel("章节标题").fill("第1章 灯塔熄灭之夜");
  await page.getByRole("button", { name: "创建章节", exact: true }).click();
  const editor = page.getByRole("textbox", { name: "章节正文" });
  await expect(editor).toBeVisible();
  const original = "林觉站在灯塔前，握紧了旧罗盘。";
  await editor.fill(original);
  await page.getByRole("tab", { name: "AI", exact: true }).click();
  await page.getByRole("button", { name: "续写", exact: true }).click();
  await expect(page).toHaveURL(/task=/);
  const taskUrl = page.url();
  await page
    .locator(".cf-writing-breadcrumb")
    .getByRole("link", { name: "我的作品", exact: true })
    .click();
  await page.goto(taskUrl.split("?")[0]!);
  await page.getByRole("button", { name: "任务中心", exact: true }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("heading", { name: "章节创作", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "关闭", exact: true })
    .click();
  await page.goto(taskUrl);
  await expect(
    page.getByRole("button", { name: "接受正文", exact: true }),
  ).toBeVisible({ timeout: 60000 });
  await expect(editor).toHaveValue(original);
  await editor.fill(original + "这是生成建议之后的新修改。");
  await expect(page.locator(".cf-paper footer")).toContainText("已保存");
  await page.getByRole("button", { name: "接受正文", exact: true }).click();
  await expect(page.getByText(/正文已在 AI 生成后修改/)).toBeVisible();
  await expect(editor).toHaveValue(original + "这是生成建议之后的新修改。");
  await editor.fill(original);
  await expect(page.locator(".cf-paper footer")).toContainText("已保存");
  await page.getByRole("button", { name: "接受正文", exact: true }).click();
  await expect(editor).toHaveValue(/夜色像一块巨大的幕布/, { timeout: 15000 });
  await editor.evaluate((el) => {
    const t = el as HTMLTextAreaElement;
    t.focus();
    t.setSelectionRange(0, 20);
    t.ownerDocument.dispatchEvent(new Event("selectionchange"));
  });
  await page
    .getByRole("toolbar", { name: "选区 AI 工具" })
    .getByRole("button", { name: "更克制", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "接受改写", exact: true }),
  ).toBeVisible({ timeout: 60000 });
  await expect(editor).toHaveValue(/夜色像一块巨大的幕布/);
  await page.getByRole("button", { name: "接受改写", exact: true }).click();
  await expect(editor).toHaveValue(/海风停了一瞬/);
  await page.getByRole("tab", { name: "检查", exact: true }).click();
  await page.getByRole("button", { name: "检查本章", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "本章检查通过", exact: true }),
  ).toBeVisible({ timeout: 60000 });
  await expect(page).toHaveURL(/\/books\/[^/]+\/write\//);
  await expect(page.locator("body")).toHaveJSProperty(
    "scrollWidth",
    info.project.use.viewport!.width,
  );
  // Exercise a non-empty review and the full review -> suggestion -> acceptance loop.
  const needsRevision = "他非常非常非常紧张，站在灯塔前。";
  await editor.fill(needsRevision);
  await page.getByRole("button", { name: "检查本章", exact: true }).click();
  const issue = page
    .locator(".cf-review-issue")
    .filter({ hasText: "情绪形容重复" });
  await expect(issue).toBeVisible({ timeout: 60000 });
  await issue
    .getByRole("button", { name: "生成修改建议", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "接受改写", exact: true }),
  ).toBeVisible({ timeout: 60000 });
  await expect(editor).toHaveValue(needsRevision);
  await page.getByRole("button", { name: "接受改写", exact: true }).click();
  await expect(editor).toHaveValue("海风停了一瞬。他握紧罗盘，没有回头。");
  await page.reload();
  await expect(editor).toHaveValue("海风停了一瞬。他握紧罗盘，没有回头。");
});
