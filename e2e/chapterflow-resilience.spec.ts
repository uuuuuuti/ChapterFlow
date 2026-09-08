import { expect, test, type Page } from "@playwright/test";

async function openChapter(page: Page, title: string) {
  await page.goto("/books/new");
  await page.getByLabel("书名", { exact: true }).fill(title);
  await page.getByRole("button", { name: "创建作品", exact: true }).click();
  await page.getByRole("link", { name: "继续写作", exact: true }).click();
  await page
    .locator(".cf-writing-empty")
    .getByRole("button", { name: "新建章节", exact: true })
    .click();
  await page.getByLabel("章节标题").fill("第1章 风起之时");
  await page.getByRole("button", { name: "创建章节", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "章节正文" })).toBeVisible();
}

test("V2 保存失败时保留正文，重试成功后才能离页", async ({ page }, info) => {
  await openChapter(page, `保存保护-${info.project.name}-${Date.now()}`);
  let fail = true;
  await page.route("**/studio/documents/*/draft", async (route) => {
    if (fail && route.request().method() === "PUT")
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "test.offline", message: "暂时无法保存" },
        }),
      });
    else await route.continue();
  });
  const editor = page.getByRole("textbox", { name: "章节正文" });
  const text = "这是尚未保存的珍贵稿件，不能因为切换页面而消失。";
  await editor.fill(text);
  await page
    .locator(".cf-writing-breadcrumb")
    .getByRole("link", { name: "我的作品", exact: true })
    .click();
  await expect(page).toHaveURL(/\/write\//);
  await expect(editor).toHaveValue(text);
  await expect(
    page.getByText("草稿保存失败，请重试保存后再离开。", { exact: true }),
  ).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "重试保存", exact: true }).click();
  await expect(page.locator(".cf-paper footer")).toContainText("已保存");
  const url = page.url();
  await page
    .locator(".cf-writing-breadcrumb")
    .getByRole("link", { name: "我的作品", exact: true })
    .click();
  await expect(page).toHaveURL(/\/books$/);
  await page.goto(url);
  await expect(editor).toHaveValue(text);
});

test("V2 浏览器本地模式无需模型也能建书和保存", async ({ page }, info) => {
  test.skip(
    info.project.name !== "desktop-1440",
    "本地存储独立实例验证一次，布局由四视口写作测试覆盖",
  );
  await page.addInitScript(() =>
    localStorage.setItem("narralume:driver", "local"),
  );
  await openChapter(page, `本地无模型-${Date.now()}`);
  const editor = page.getByRole("textbox", { name: "章节正文" });
  await editor.fill("没有配置模型，故事也可以从这里开始。");
  await expect(page.locator(".cf-paper footer")).toContainText("已保存");
  await page.reload();
  await expect(editor).toHaveValue("没有配置模型，故事也可以从这里开始。");
});
