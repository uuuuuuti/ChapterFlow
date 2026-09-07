import { expect, test } from "@playwright/test";

test("ChapterFlow 作品入口与创作首页", async ({ page }, info) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/books$/);
  await expect(
    page.getByRole("heading", { name: "我的作品", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("main")
    .getByRole("link", { name: /新建作品|创建第一部作品/ })
    .first()
    .click();
  await page
    .getByLabel("书名", { exact: true })
    .fill(`文织验收-${info.project.name}-${Date.now()}`);
  await page
    .getByLabel("一句话简介")
    .fill("失去记忆的守塔人，在潮声中寻找自己的名字。");
  await page.getByRole("button", { name: "创建作品", exact: true }).click();
  await expect(page).toHaveURL(/\/books\/[^/]+\/dashboard$/);
  await expect(
    page.getByRole("heading", { name: "创作首页", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "继续写作", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "创作导航" }),
  ).not.toContainText(/Autopilot|Runs|Lab|Canon/);
  await expect(page.locator("body")).toHaveJSProperty(
    "scrollWidth",
    info.project.use.viewport!.width,
  );
});
