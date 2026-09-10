import { expect, test } from "@playwright/test";

const KERNEL_READY_TIMEOUT = 40_000;

/**
 * M3 验收：浏览器本地内核（Worker + OPFS）承载 UI 主链。
 * 显式把驱动锁到 local（localStorage 覆盖），全程不依赖 Node API——
 * 尽管Playwright webServer 仍在，页面请求一律走内核 RouteTable。
 * 链路：建项目 → 大纲 → 写作台手写并保存版本 → 交付备份 → reload 持久
 * → 运行中心可访问。
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("narralume:driver", "local"),
  );
});

test("本地内核 UI 主链：建项目 → 大纲 → 写作 → 版本持久 → 运行中心", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const suffix = `${Date.now()}`;
  const title = `内核潮汐-${suffix}`;
  const chapterTitle = `雾港内核-${suffix}`;
  const body =
    "林昇回港当夜，灯塔突然熄灭。退潮前，他在石阶下找到一封没有署名的信。";

  // ChapterFlow owns the native route; the local driver is exercised by every
  // query and mutation below.
  await page.goto("/books");
  await expect(
    page.getByRole("heading", { name: "我的作品", exact: true }),
  ).toBeVisible();

  // 空白建书（无模型也可用的纯项目创建）。
  await page.getByRole("main").getByRole("link", { name: "新建作品" }).click();
  await page.getByLabel("书名").fill(title);
  await page
    .getByLabel("一句话简介")
    .fill("失灯的守塔人必须在退潮前找回一封信。");
  await page.getByRole("button", { name: "创建作品" }).click();
  await expect(page).toHaveURL(/\/books\/[^/]+\/dashboard$/);
  const projectId = new URL(page.url()).pathname.split("/")[2];
  expect(projectId).toBeTruthy();
  await expect(page.getByRole("heading", { name: "创作首页" })).toBeVisible();

  // 大纲：创建章节节点。
  await page.goto(`/books/${projectId}/outline`);
  await page.getByLabel("类型").selectOption({ label: "章节" });
  await page
    .getByRole("textbox", { name: "标题", exact: true })
    .fill(chapterTitle);
  await page
    .getByRole("textbox", { name: "摘要", exact: true })
    .fill("林昇回港当夜，灯塔突然熄灭。");
  await page.getByRole("button", { name: "保存", exact: true }).first().click();
  await expect(page.getByRole("status")).toContainText("已写入服务端");
  await page.getByLabel("编辑对象").selectOption({ label: chapterTitle });
  await page.getByRole("link", { name: "去写作台写本章" }).click();
  await expect(page).toHaveURL(new RegExp(`/books/${projectId}/write/`));

  // 写作台：手写正文并创建版本（手动创作永远可用）。
  const editor = page.getByRole("textbox", { name: "章节正文" });
  await expect(editor).toBeVisible();
  await editor.fill(body);
  await page.getByRole("button", { name: "历史版本" }).click();
  await page.getByLabel("版本说明").fill("内核持久版本");
  await page.getByRole("button", { name: "创建版本" }).click();
  await expect(page.getByText("内核持久版本", { exact: true })).toBeVisible();

  // 重启持久性：reload 后内核从 OPFS 重开，章节文档与正文仍在。
  await page.reload();
  await expect(page.getByRole("textbox", { name: "章节正文" })).toBeVisible({
    timeout: KERNEL_READY_TIMEOUT,
  });
  await expect(editor).toBeVisible();
  await expect(editor).toHaveValue(/灯塔突然熄灭/);

  // 任务中心在 local 驱动下可用（空态；直接按地址访问）。
  await page.goto(`/books/${projectId}/dashboard`);
  await expect(page.getByRole("button", { name: "任务中心" })).toBeVisible();

  // 下载我的库（D6）：local 驱动从内核导出完整 SQLite bytes。
  const download = page.waitForEvent("download");
  await page.goto("/settings/storage");
  await expect(page.getByRole("button", { name: /下载我的库/ })).toBeVisible();
  await page.getByRole("button", { name: /下载我的库/ }).click();
  const library = await download;
  expect(library.suggestedFilename()).toMatch(/\.sqlite$/);
  await expect(
    page.getByText("本机存储使用完整库下载。", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("系统备份说明")).toHaveCount(0);
});
