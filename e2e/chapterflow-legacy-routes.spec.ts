import { expect, test } from "@playwright/test";

test("旧书签解析到 ChapterFlow 原生页面并保留上下文", async ({ page }) => {
  await page.goto("/books/new");
  await page.getByLabel("书名", { exact: true }).fill(`旧链解析-${Date.now()}`);
  await page.getByRole("button", { name: "创建作品", exact: true }).click();
  await expect(page).toHaveURL(/\/books\/[^/]+\/dashboard$/);
  const projectId = new URL(page.url()).pathname.split("/")[2]!;

  await page.goto("/shelf");
  await expect(page).toHaveURL(/\/books$/);
  await expect(
    page.getByRole("heading", { name: "我的作品", exact: true }),
  ).toBeVisible();

  await page.goto(`/projects/${projectId}/overview`);
  await expect(page).toHaveURL(`/books/${projectId}/dashboard`);
  await expect(
    page.getByRole("heading", { name: "创作首页", exact: true }),
  ).toBeVisible();

  await page.goto(`/books/${projectId}/studio?focus=canon`);
  await expect(page).toHaveURL(`/books/${projectId}/write?tab=canon`);

  await page.goto(`/projects/${projectId}/bible?spread=entities`);
  await expect(page).toHaveURL(`/books/${projectId}/knowledge/characters`);
  await expect(
    page.getByRole("heading", { name: "作品设定", exact: true }),
  ).toBeVisible();

  await page.goto(`/projects/${projectId}/bible?spread=outline`);
  await expect(page).toHaveURL(`/books/${projectId}/outline`);
  await expect(
    page.getByRole("heading", { name: "大纲", exact: true }),
  ).toBeVisible();

  await page.goto(`/projects/${projectId}/studio?outline=outline-1`);
  await expect(page).toHaveURL(`/books/${projectId}/write?outline=outline-1`);

  await page.goto(`/projects/${projectId}/autopilot?session=missing-session`);
  await expect(page).toHaveURL(
    `/books/${projectId}/quick-create?session=missing-session`,
  );
  await expect(
    page.getByRole("heading", { name: "连续创作", exact: true }),
  ).toBeVisible();

  await page.goto(`/projects/${projectId}/runs?run=missing-run`);
  await expect(page).toHaveURL(
    new RegExp(`/books/${projectId}/tasks/missing-run\\?returnTo=`),
  );
  await expect(
    page.getByRole("heading", { name: "任务详情", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "找不到这项任务", exact: true }),
  ).toBeVisible();

  await page.goto(`/projects/${projectId}/runs`);
  await expect(page).toHaveURL(`/books/${projectId}/tasks`);
  await expect(
    page.getByRole("heading", { name: "任务中心", exact: true }),
  ).toBeVisible();

  await page.goto(`/projects/${projectId}/studio?document=missing-document`);
  await expect(page).toHaveURL(`/books/${projectId}/write/missing-document`);
  await expect(
    page.getByRole("heading", { name: "找不到这章内容", exact: true }),
  ).toBeVisible();

  await page.goto(`/projects/${projectId}/studio?outline=missing-outline`);
  await expect(page).toHaveURL(
    `/books/${projectId}/write?outline=missing-outline`,
  );
  await expect(
    page.getByRole("heading", { name: "找不到这个大纲节点", exact: true }),
  ).toBeVisible();

  await page.goto(`/projects/${projectId}/autopilot?session=missing-session`);
  await expect(
    page.getByRole("heading", { name: "找不到这次连续创作", exact: true }),
  ).toBeVisible();

  await page.goto(`/books/${projectId}/missing-surface`);
  await expect(
    page.getByRole("heading", { name: "页面不存在", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "回到作品库", exact: true }),
  ).toHaveAttribute("href", "/books");

  await page.goto(`/projects/${projectId}/lab?tool=predict`);
  await expect(page).toHaveURL(`/books/${projectId}/advanced?tool=predict`);
  await expect(
    page.getByRole("heading", { name: "高级工具", exact: true }),
  ).toBeVisible();

  await page.goto(`/projects/${projectId}/delivery`);
  await expect(page).toHaveURL(`/books/${projectId}/publish`);
  await expect(
    page.getByRole("heading", { name: "发布", exact: true }),
  ).toBeVisible();
});
