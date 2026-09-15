import { expect, test } from "@playwright/test";

test("快速开书从想法入口进入签约准备工作流", async ({ page }, info) => {
  await page.goto("/books/new?mode=signing-sprint");
  await expect(
    page.getByRole("heading", { name: "快速开书", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("作品名（可先留空）", { exact: true })
    .fill(`快速开书-${info.project.name}-${Date.now()}`);
  await page.getByLabel("大致题材", { exact: true }).fill("都市悬疑");
  await page
    .getByLabel("一句话想法（可选）", { exact: true })
    .fill("修复师在旧书里发现来自未来的留言。");
  await page.getByRole("button", { name: "进入快速开书", exact: true }).click();
  await expect(page).toHaveURL(/\/books\/[^/]+\/signing-sprint$/);
  await expect(
    page.getByRole("heading", { name: "快速开书", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "快速开书步骤", exact: true }),
  ).toBeVisible();

  await page
    .getByRole("textbox", { name: "故事想法", exact: true })
    .fill("修复师在旧书里发现来自未来的留言，必须在停电前找到妹妹。");
  await page.getByLabel("大致题材", { exact: true }).fill("都市悬疑");
  await page.getByLabel("想写给谁", { exact: true }).fill("喜欢反转的追更读者");
  await page.getByLabel("核心阅读体验", { exact: true }).fill("紧张与期待");
  await page
    .getByRole("button", { name: "保存并继续定位", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "把故事变成一句可追更的承诺",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByLabel("一句话故事", { exact: true })
    .fill("修复师在失踪妹妹留下的未来留言中追查真相。");
  await page
    .getByLabel("核心创意", { exact: true })
    .fill("每条留言都比现实早七秒出现。");
  await page
    .getByLabel("主角想要什么", { exact: true })
    .fill("找到妹妹并阻止下一起案件。");
  await page
    .getByLabel("谁或什么在阻拦", { exact: true })
    .fill("篡改留言的凶手和逐渐失效的记忆。");
  await page
    .getByLabel("故事靠什么持续推进", { exact: true })
    .fill("每次修复旧书都会得到一条新的线索。");
  await page
    .getByLabel("核心冲突", { exact: true })
    .fill("主角必须用失去记忆的代价换取真相。");
  await page
    .getByLabel("读者最后想得到什么体验", { exact: true })
    .fill("紧张追查后获得反转和成长。");
  await page
    .getByLabel("目标读者", { exact: true })
    .fill("喜欢都市悬疑和反转的追更读者");
  await page
    .getByLabel("长期期待", { exact: true })
    .fill("主角最终直面自己隐瞒的旧案。");
  await page
    .getByLabel("短期吸引力", { exact: true })
    .fill("七秒预知制造即时悬念。");
  await page
    .getByLabel("中期扩展空间", { exact: true })
    .fill("不同案件逐步指向同一条留言网络。");
  await page
    .getByLabel("长期主线空间", { exact: true })
    .fill("妹妹失踪与主角旧案最终汇合。");
  await page
    .getByRole("button", { name: "保存定位并继续", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "让人物和规则互相拉扯", exact: true }),
  ).toBeVisible();
  await page.getByLabel("主角", { exact: true }).fill("林野，落魄修复师");
  await page
    .getByLabel("第一阶段冲突", { exact: true })
    .fill("在城市停电前找到留言来源。");
  await page
    .getByLabel("核心机制", { exact: true })
    .fill("读取旧书会看见死者临终前七秒。");
  await page
    .getByLabel("主要对手或阻力", { exact: true })
    .fill("篡改留言的凶手");
  await page
    .getByRole("button", { name: "保存人物与冲突并继续", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "给作品一个能兑现的包装", exact: true }),
  ).toBeVisible();
  await page.getByLabel("书名", { exact: true }).fill("七秒留言");
  await page
    .getByLabel("标签（用逗号或换行分隔）", { exact: true })
    .fill("都市,悬疑");
  await page
    .getByLabel("简介", { exact: true })
    .fill("修复师追查来自未来的留言，代价是失去自己的记忆。");
  await page.getByRole("button", { name: "加入我的候选", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "安排一个能马上动笔的开篇",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "保存开篇并进入写作", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "现在开始写，再回看开篇", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "打开章节列表", exact: true }),
  ).toHaveAttribute("href", /\/books\/[^/]+\/write$/);
  await page.getByRole("button", { name: "更新开篇检查", exact: true }).click();
  await expect(page.getByText(/个章节已检查/)).toBeVisible();
  await page
    .getByRole("button", { name: "更新签约准备预检", exact: true })
    .click();
  await expect(page.getByText(/需要回看|暂未发现需要处理/)).toBeVisible();
});

test("快速开书完整走到三章正文、开篇体检和签约预检", async ({ page }, info) => {
  test.skip(
    process.env.CHAPTERFLOW_E2E_SUCCESS_MODEL !== "1",
    "使用独立成功模型运行完整快速开书链路",
  );
  test.setTimeout(120000);

  await page.goto("/books/new?mode=signing-sprint");
  await page
    .getByLabel("作品名（可先留空）", { exact: true })
    .fill(`完整开书-${info.project.name}-${Date.now()}`);
  await page.getByLabel("大致题材", { exact: true }).fill("都市悬疑");
  await page.getByLabel("目标读者", { exact: true }).fill("喜欢反转的追更读者");
  await page.getByLabel("核心阅读体验", { exact: true }).fill("紧张与成长");
  await page
    .getByLabel("一句话想法（可选）", { exact: true })
    .fill("落魄刑警能听见死者最后七秒的声音，必须查清姐姐旧案。");
  await page.getByRole("button", { name: "进入快速开书", exact: true }).click();
  await expect(page).toHaveURL(/\/books\/[^/]+\/signing-sprint$/);
  const sprintUrl = page.url();

  await page
    .getByRole("textbox", { name: "故事想法", exact: true })
    .fill("落魄刑警能听见死者最后七秒的声音，必须查清姐姐旧案。");
  await page.getByLabel("大致题材", { exact: true }).fill("都市悬疑");
  await page.getByLabel("想写给谁", { exact: true }).fill("喜欢反转的追更读者");
  await page.getByLabel("核心阅读体验", { exact: true }).fill("紧张与成长");
  await page
    .getByRole("button", { name: "保存并继续定位", exact: true })
    .click();

  const positioning = [
    ["一句话故事", "落魄刑警用死者最后七秒的声音追查姐姐旧案。"],
    ["核心创意", "每个声音线索都会带走主角一段记忆。"],
    ["主角想要什么", "查清姐姐死亡真相。"],
    ["谁或什么在阻拦", "篡改声音记录的人和逐渐消失的记忆。"],
    ["故事靠什么持续推进", "每个案件都会给出一条新的声音线索。"],
    ["核心冲突", "主角必须用记忆换取真相。"],
    ["读者最后想得到什么体验", "在反转和成长中获得持续紧张感。"],
    ["目标读者", "喜欢都市脑洞与悬疑反转的追更读者。"],
    ["长期期待", "姐姐旧案最终指向主角隐瞒的选择。"],
    ["短期吸引力", "七秒声音机制制造即时谜面。"],
    ["中期扩展空间", "多个案件逐步连接成声音网络。"],
    ["长期主线空间", "记忆缺口与姐姐旧案汇合成终局。"],
  ] as const;
  for (const [label, value] of positioning) {
    await page.getByLabel(label, { exact: true }).fill(value);
  }
  await page
    .getByRole("button", { name: "保存定位并继续", exact: true })
    .click();

  await page.getByLabel("主角", { exact: true }).fill("沈砚，落魄刑警");
  await page
    .getByLabel("主要对手或阻力", { exact: true })
    .fill("篡改声音记录的人");
  await page.getByLabel("核心机制", { exact: true }).fill("听见死者最后七秒");
  await page
    .getByLabel("第一阶段冲突", { exact: true })
    .fill("在记忆消失前查清姐姐旧案。");
  await page
    .getByRole("button", { name: "保存人物与冲突并继续", exact: true })
    .click();

  await page.getByLabel("书名", { exact: true }).fill("七秒回声");
  await page
    .getByLabel("标签（用逗号或换行分隔）", { exact: true })
    .fill("都市,悬疑,脑洞");
  await page
    .getByLabel("简介", { exact: true })
    .fill(
      "落魄刑警用死者最后七秒的声音追查姐姐旧案，每次靠近真相都会失去一段记忆。",
    );
  await page.getByRole("button", { name: "加入我的候选", exact: true }).click();

  await page
    .getByRole("button", { name: "保存开篇并进入写作", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "现在开始写，再回看开篇", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /开始写《/ }).click();
  await expect(page).toHaveURL(/\/tasks\/[^/]+$/);
  await expect(
    page.getByRole("button", { name: "接受正文", exact: true }),
  ).toBeVisible({
    timeout: 60000,
  });
  await page.getByRole("button", { name: "接受正文", exact: true }).click();

  await page.goto(sprintUrl);
  await expect(
    page.getByRole("heading", { name: "现在开始写，再回看开篇", exact: true }),
  ).toBeVisible();
  const chapterLinks = page.locator(".cf-signing-sprint-chapter-links a");
  await expect(chapterLinks).toHaveCount(3);
  for (const [index, content] of [
    [1, "沈砚追到第二条声音线索，发现有人先一步改写了现场。"],
    [2, "沈砚在姐姐旧案的录音里听见自己的名字，决定付出记忆代价。"],
  ] as const) {
    await chapterLinks.nth(index).click();
    const editor = page.getByRole("textbox", { name: "章节正文" });
    await expect(editor).toBeVisible();
    await editor.fill(content);
    await expect(page.locator(".cf-paper footer")).toContainText("已保存");
    await page.goto(sprintUrl);
    await expect(
      page.getByRole("heading", {
        name: "现在开始写，再回看开篇",
        exact: true,
      }),
    ).toBeVisible();
  }

  await page.getByRole("button", { name: "更新开篇检查", exact: true }).click();
  await expect(page.getByText("3 个章节已检查", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "更新签约准备预检", exact: true })
    .click();
  await expect(
    page.getByText(/开篇质量 needs_attention|开篇质量 ready/),
  ).toBeVisible();
  await expect(page.locator("body")).toHaveJSProperty(
    "scrollWidth",
    info.project.use.viewport!.width,
  );
});

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
  await page.getByRole("button", { name: /自己创建/ }).click();
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
  await page.getByRole("button", { name: /自己创建/ }).click();
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
  await page.getByRole("button", { name: /自己创建/ }).click();
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
    .selectOption({ label: "第 1 章 · 第1章 风起之时" });
  await page.getByRole("link", { name: "去写作台写本章", exact: true }).click();
  await expect(page).toHaveURL(/\/books\/[^/]+\/write\/[^/?]+$/);
  await expect(page.getByRole("textbox", { name: "章节正文" })).toBeVisible();
});
