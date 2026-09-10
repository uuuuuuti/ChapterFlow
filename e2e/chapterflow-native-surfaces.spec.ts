import { expect, test } from "@playwright/test";

test("ChapterFlow 原生工作面不再把普通入口送回旧工作区", async ({
  page,
}, testInfo) => {
  await page.goto("/books/new");
  await page
    .getByLabel("书名", { exact: true })
    .fill(`原生工作面-${Date.now()}`);
  await page.getByRole("button", { name: "创建作品", exact: true }).click();
  await expect(page).toHaveURL(/\/books\/[^/]+\/dashboard$/);
  const projectBase = page.url().replace(/\/dashboard$/, "");

  const surfaces: [string, string][] = [
    ["/outline", "大纲"],
    ["/knowledge/intent", "作品设定"],
    ["/analytics", "数据复盘"],
    ["/publish", "发布"],
    ["/quick-create", "连续创作"],
    ["/advanced?tool=assets", "风格、写作技法与导入"],
    ["/advanced?tool=web-novel", "网文作品档案"],
  ];
  for (const [suffix, heading] of surfaces) {
    await page.goto(`${projectBase}${suffix}`);
    if (suffix === "/advanced?tool=assets")
      await expect(page).toHaveURL(/tool=assets/);
    if (suffix === "/advanced?tool=web-novel")
      await expect(page).toHaveURL(/tool=web-novel/);
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
    const legacyHrefs = await page
      .locator("a[href]")
      .evaluateAll((links) =>
        links
          .map((link) => (link as HTMLAnchorElement).getAttribute("href") ?? "")
          .filter((href) =>
            /^\/(?:projects|shelf|overview|bible|studio|autopilot|runs|lab|delivery)(?:\/|$)/u.test(
              href,
            ),
          ),
      );
    expect(legacyHrefs).toEqual([]);
  }

  await page.goto(`${projectBase}/tasks/does-not-exist`);
  await expect(
    page.getByRole("heading", { name: "找不到这项任务", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "回到创作首页", exact: true }),
  ).toHaveAttribute("href", /\/dashboard$/);

  await page.goto(`${projectBase}/quick-create`);
  await expect(page.getByLabel("起始章节", { exact: true })).toBeVisible();
  await expect(page.getByLabel("结束章节", { exact: true })).toBeVisible();
  await page
    .getByLabel("核心承诺")
    .fill("在失去一切之后，主角仍要为自己的选择负责。");
  await page.getByRole("button", { name: "保存故事航标", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "开始连续创作", exact: true }),
  ).toBeEnabled();

  await page.goto("/books/templates");
  await expect(
    page.getByRole("heading", { name: "创作模板", exact: true }),
  ).toBeVisible();
  await page.goto("/settings/advanced");
  await expect(
    page.getByRole("heading", { name: "设置", exact: true }),
  ).toBeVisible();
  if (testInfo.project.name === "desktop-1440") {
    await page.goto(`${projectBase}/advanced?tool=web-novel`);
    await page
      .getByRole("button", { name: "新建本作品预设", exact: true })
      .click();
    const presetName = `验收预设-${Date.now()}`;
    await page.getByLabel("预设名称", { exact: true }).fill(presetName);
    await page.getByLabel("题材", { exact: true }).last().fill("都市悬疑");
    await page.getByRole("button", { name: "保存预设", exact: true }).click();
    const presetCard = page.locator(".cf-entity-card", { hasText: presetName });
    await expect(presetCard).toBeVisible();
    await presetCard
      .getByRole("button", { name: "应用到本书", exact: true })
      .click();
    await expect(page.getByRole("alertdialog")).toContainText("本次会改变");
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "确认应用", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(
      `已应用「${presetName}」`,
    );
    await page
      .getByRole("button", { name: "撤销上次应用", exact: true })
      .click();
    await expect(page.getByRole("status")).not.toContainText(
      `已应用「${presetName}」`,
    );

    await page.goto("/settings/storage");
    const backupLabel = `系统备份验收-${Date.now()}`;
    await page.getByLabel("系统备份说明").fill(backupLabel);
    await page
      .getByRole("button", { name: "创建系统备份", exact: true })
      .click();
    const backupRow = page.locator(".cf-list-row", { hasText: backupLabel });
    await expect(backupRow).toBeVisible();
    await backupRow
      .getByRole("button", { name: "预览完整性", exact: true })
      .click();
    await expect(page.getByText("备份可恢复", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "准备恢复", exact: true }).click();
    await page
      .getByLabel("恢复目标目录")
      .fill(`/private/tmp/chapterflow-system-${Date.now()}`);
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "确认恢复", exact: true })
      .click();
    await expect(page.locator(".cf-notice")).toContainText("系统备份已恢复到");
  }

  const internalLinks = await page
    .locator("a[href]")
    .evaluateAll((links) =>
      links
        .map((link) => (link as HTMLAnchorElement).getAttribute("href") ?? "")
        .filter((href) => href.startsWith("/")),
    );
  expect(
    internalLinks.filter(
      (href) => href.startsWith("/projects/") || href === "/shelf",
    ),
  ).toEqual([]);
});
