import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Script } from "node:vm";
import { initProject, readConfig, writeChapter } from "../runtime/project.mjs";
import { stageCandidate, decideCandidate } from "../runtime/candidates.mjs";
import { buildContext } from "../runtime/context.mjs";
import { buildViewSpec } from "../runtime/view-spec.mjs";
import {
  upsertEntity,
  upsertRelationship,
  openReaderPromise,
  upsertForeshadow,
} from "../runtime/story.mjs";
import { renderView } from "../renderer/html.mjs";
import { exportManuscript } from "../runtime/delivery.mjs";

const workspace = () => {
  const root = mkdtempSync(join(tmpdir(), "cf-workflow-"));
  initProject(root, { title: "验证作品" });
  return root;
};
const accept = (root, kind, payload) =>
  decideCandidate(root, stageCandidate(root, { kind, payload }).id, "accept");
const plan = (index) => ({
  index,
  title: `章节${index}`,
  goal: "寻找证据",
  conflict: "证据失踪",
  outcome: "发现新线索",
});

test("long-form plans merge without losing other chapters and feed revision context", () => {
  const root = workspace();
  accept(root, "opening_blueprint", {
    firstThreeChapters: [1, 2, 3].map(plan),
    firstArcChapters: [],
  });
  accept(root, "story_plan", {
    arcs: [{ id: "a", title: "第一弧" }],
    chapters: [plan(4), plan(5)],
  });
  accept(root, "story_plan", { chapters: [{ ...plan(4), goal: "修订目标" }] });
  assert.equal(readConfig(root).storyPlan.chapters.length, 2);
  writeChapter(root, { index: 4, title: "章节4", content: "目标章正文" });
  writeChapter(root, {
    index: 8,
    title: "后续章",
    content: "未来正文不能充当前文",
  });
  const context = buildContext(root, { chapterIndex: 4 });
  assert.equal(context.targetChapterPlan.goal, "修订目标");
  assert.match(context.targetManuscript.content, /目标章正文/);
  assert.deepEqual(context.recentManuscript, []);
  const spec = buildViewSpec(root, "story_map");
  assert.deepEqual(
    spec.chapters.map((c) => c.index),
    [1, 2, 3, 4, 5, 8],
  );
  assert.equal(spec.chapters.find((c) => c.index === 8).written, true);
  assert.throws(
    () =>
      stageCandidate(root, {
        kind: "story_plan",
        payload: { chapters: [plan(1), plan(1)] },
      }),
    /unique/,
  );
});

test("external manuscript edits invalidate a staged rewrite", () => {
  const root = workspace();
  writeChapter(root, { index: 1, title: "一", content: "原稿" });
  const candidate = stageCandidate(root, {
    kind: "chapter_draft",
    payload: { index: 1, title: "一", content: "候选" },
  });
  const path = join(root, "manuscript", "001-一.md");
  writeFileSync(path, "# 一\n\n作者的新内容\n");
  assert.throws(() => decideCandidate(root, candidate.id, "accept"), /stale/);
  assert.match(readFileSync(path, "utf8"), /作者的新内容/);
});

test("visual workspace covers full manuscript, overdue items and valid graph endpoints", () => {
  const root = workspace();
  writeChapter(root, { index: 12, title: "第十二章", content: "新剧情" });
  upsertEntity(root, { id: "a", name: "主角" });
  upsertEntity(root, { id: "b", name: "退场人物", status: "archived" });
  upsertRelationship(root, { sourceId: "a", targetId: "b", label: "旧识" });
  openReaderPromise(root, { title: "真相", chapterIndex: 1, targetChapter: 6 });
  upsertForeshadow(root, {
    title: "钥匙",
    introducedChapter: 1,
    targetChapter: 8,
  });
  const spec = buildViewSpec(root, "workspace");
  assert.equal(spec.views.length, 6);
  assert.deepEqual(
    spec.views.find((v) => v.type === "character_graph").edges,
    [],
  );
  assert.equal(
    spec.views.find((v) => v.type === "promise_board").promises[0].overdue,
    true,
  );
  assert.equal(
    spec.views.find((v) => v.type === "foreshadow_map").foreshadows[0].overdue,
    true,
  );
  assert.equal(
    spec.views.find((v) => v.type === "chapter_health").chapters[0].index,
    12,
  );
  assert.throws(
    () => buildViewSpec(root, "timeline", { chapterIndex: 0 }),
    /positive/,
  );
});

test("HTML embeds hostile story text as data and remains executable; export excludes candidates", () => {
  const root = workspace();
  upsertEntity(root, {
    name: "</script><script>globalThis.injected=true</script>",
  });
  writeChapter(root, { index: 1, title: "已确认", content: "正式内容" });
  stageCandidate(root, {
    kind: "chapter_draft",
    payload: { index: 2, title: "候选章", content: "不可导出" },
  });
  const html = readFileSync(renderView(root, "workspace").path, "utf8");
  assert.equal((html.match(/<script>/g) ?? []).length, 1);
  new Script(html.match(/<script>([\s\S]*)<\/script>/)[1]);
  const exported = exportManuscript(root);
  assert.equal(exported.chapterCount, 1);
  assert.doesNotMatch(readFileSync(exported.path, "utf8"), /不可导出/);
  assert.equal(
    JSON.parse(readFileSync(exported.manifestPath, "utf8")).chapters[0].index,
    1,
  );
  assert.throws(
    () => exportManuscript(root, { fromChapter: 4, toChapter: 2 }),
    /range/,
  );
});
