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
  if (
    await page
      .getByRole("button", { name: "打开导航", exact: true })
      .isVisible()
  )
    await page.getByRole("button", { name: "打开导航", exact: true }).click();
  await expect(
    page.getByRole("navigation", { name: "创作导航" }),
  ).not.toContainText(/Autopilot|Runs|Lab|Canon/);
  if (
    await page
      .getByRole("button", { name: "关闭导航", exact: true })
      .isVisible()
  )
    await page.getByRole("button", { name: "关闭导航", exact: true }).click();
  await expect(page.locator("body")).toHaveJSProperty(
    "scrollWidth",
    info.project.use.viewport!.width,
  );
});

test("V2 手工写作、离页保存与版本恢复", async ({ page }, info) => {
  await page.goto("/books/new");
  await page
    .getByLabel("书名", { exact: true })
    .fill(`手工作品-${info.project.name}-${Date.now()}`);
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
  const url = page.url();
  const body = "林觉握紧了旧罗盘。灯塔熄灭时，门后有人叫出了他的名字。";
  await page.getByRole("button", { name: "重命名章节", exact: true }).click();
  await page
    .getByLabel("章节标题", { exact: true })
    .fill("第1章 灯塔熄灭之夜（修订）");
  await page.getByRole("button", { name: "保存标题", exact: true }).click();
  await expect(page.locator(".cf-paper h1")).toHaveText(
    "第1章 灯塔熄灭之夜（修订）",
  );
  await editor.fill(body);
  // Navigate before the debounce: the shell must flush the draft.
  await page
    .locator(".cf-writing-breadcrumb")
    .getByRole("link", { name: "我的作品", exact: true })
    .click();
  await expect(page).toHaveURL(/\/books$/);
  await page.goto(url);
  await expect(editor).toHaveValue(body);
  await editor.press("Control+A");
  await page.waitForTimeout(100);
  await page.getByRole("tab", { name: "批注", exact: true }).click();
  await page.getByLabel("批注内容").fill("确认开场意象与本章目标一致。");
  await page.getByRole("button", { name: "添加批注", exact: true }).click();
  await expect(page.locator(".cf-editor-notice")).toContainText(
    "批注已添加，已锚定到当前版本。",
  );
  await expect(
    page.getByText("确认开场意象与本章目标一致。", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "编辑批注", exact: true }).click();
  await page.getByLabel(/编辑批注/).fill("确认意象，并补充灯塔熄灭后的悬念。");
  await page.getByRole("button", { name: "保存批注", exact: true }).click();
  await expect(
    page.getByText("确认意象，并补充灯塔熄灭后的悬念。", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "标记已解决", exact: true }).click();
  await expect(page.getByText("已解决", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "归档章节", exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "归档章节", exact: true })
    .click();
  await expect(page).toHaveURL(/\/write$/);
  await expect(page.getByText("已归档", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "第1章 灯塔熄灭之夜（修订）", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "恢复章节", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "恢复章节", exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "恢复章节", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "归档章节", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "历史版本", exact: false }).click();
  await page.getByLabel("版本说明").fill("第一稿");
  await page.getByRole("button", { name: "创建版本", exact: true }).click();
  await expect(page.getByText("第一稿", { exact: true })).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "关闭", exact: true })
    .click();
  await editor.fill(body + "\n\n他推开门，却没有看见任何人。");
  await page.getByRole("button", { name: "历史版本", exact: false }).click();
  await page.getByLabel("版本说明").fill("第二稿");
  await page.getByRole("button", { name: "创建版本", exact: true }).click();
  await expect(page.getByText("第二稿", { exact: true })).toBeVisible();
  await page
    .locator(".cf-version", { has: page.getByText("第一稿", { exact: true }) })
    .getByRole("button", { name: "恢复", exact: true })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "恢复版本", exact: true })
    .click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "关闭", exact: true })
    .click();
  await expect(editor).toHaveValue(body);
  await page.reload();
  await expect(editor).toHaveValue(body);
  await expect(page.locator("body")).toHaveJSProperty(
    "scrollWidth",
    info.project.use.viewport!.width,
  );
  if (info.project.name === "desktop-1440")
    await page.screenshot({
      path: "output/playwright/chapterflow-writing.png",
      fullPage: true,
    });
});

test("V2 大纲章节直接进入新写作台", async ({ page }, info) => {
  await page.goto("/books/new");
  await page
    .getByLabel("书名", { exact: true })
    .fill(`大纲衔接-${info.project.name}-${Date.now()}`);
  await page.getByRole("button", { name: "创建作品", exact: true }).click();
  await expect(page).toHaveURL(/\/books\/[^/]+\/dashboard$/);
  const base = page.url().replace(/\/dashboard$/, "");
  await page.goto(`${base}/outline`);
  await page
    .getByRole("combobox", { name: "类型", exact: true })
    .selectOption({ label: "章节" });
  await page
    .getByRole("textbox", { name: "标题", exact: true })
    .fill("第1章 风起之时");
  await page
    .getByRole("textbox", { name: "摘要", exact: true })
    .fill("灯塔突然熄灭。");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("已写入服务端");
  await page
    .getByRole("combobox", { name: "编辑对象", exact: true })
    .selectOption({ label: "第1章 风起之时" });
  await page.getByRole("link", { name: "去写作台写本章", exact: true }).click();
  await expect(page).toHaveURL(/\/books\/[^/]+\/write\/[^/?]+$/);
  await expect(page.getByRole("textbox", { name: "章节正文" })).toBeVisible();
});
