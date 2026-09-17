import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { initProject, readConfig, listChapters } from "../runtime/project.mjs";
import { stageCandidate, decideCandidate } from "../runtime/candidates.mjs";
import {
  upsertEntity,
  upsertRelationship,
  upsertTimelineEvent,
  upsertForeshadow,
  openReaderPromise,
  transitionReaderPromise,
  listReaderPromises,
} from "../runtime/story.mjs";
import { buildTaskPacket } from "../runtime/context.mjs";
import { reviewOpening, reviewSigning } from "../runtime/review.mjs";
import { renderView } from "../renderer/html.mjs";
import { listTools, executeTool } from "../runtime/tools.mjs";

function workspace() {
  return mkdtempSync(join(tmpdir(), "chapterflow-skill-kit-"));
}

function accept(root, kind, payload) {
  const candidate = stageCandidate(root, { kind, payload, provenance: { kind: "test", sourceRefs: [] } });
  return decideCandidate(root, candidate.id, "accept");
}

test("standalone skill runtime completes a signing-prep story workflow", async () => {
  const root = workspace();
  const summary = initProject(root, {
    title: "七秒之后",
    premise: "落魄刑警能听见死者临终前七秒的声音。",
    genre: "都市悬疑",
    audience: "喜欢悬疑反转与成长线的男频读者",
    promise: "每条声音都逼近真相，同时付出记忆代价",
  });
  assert.equal(summary.chapterCount, 0);

  accept(root, "book_positioning", {
    oneLineStory: "失意刑警用会损伤记忆的能力追查姐姐旧案。",
    coreIdea: "每个死者留下最后七秒声音。",
    sellingPoints: ["声音线索", "记忆代价", "旧案主线"],
    readerProfile: "都市悬疑读者",
    protagonistDesire: "查清姐姐死亡真相",
    obstacle: "能力会侵蚀近期记忆，幕后人还在抹除证据",
    coreConflict: "必须在忘记关键线索前完成调查",
    longTermExpectation: "姐姐旧案与能力来源究竟有什么关系",
  });
  accept(root, "story_engine", {
    protagonist: "沈砚，失意刑警",
    antagonist: "篡改证据的人",
    mechanism: "听见死者临终前七秒",
    mechanismCost: "每次使用都会丢失一段近期记忆",
    relationships: [],
    worldRules: ["声音不可重复读取"],
    conflict: "在记忆持续缺损时追查旧案",
  });
  accept(root, "packaging", {
    selected: {
      title: "七秒之后",
      description: "每个死者都会留下最后七秒，而沈砚每听一次，就会忘掉一点自己。",
      tags: ["都市", "悬疑", "异能"],
    },
  });
  accept(root, "opening_blueprint", {
    readerPromise: "姐姐旧案到底被谁改写",
    openingHook: "死者说出沈砚的名字",
    expectation: "声音能力能否还原真相",
    firstArcTitle: "失真的七秒",
    firstArcGoal: "确认姐姐旧案被人为改写",
    firstArcConflict: "记忆代价越来越重",
    firstArcPayoff: "找到第一名活着的证人",
    firstThreeChapters: [1, 2, 3].map((index) => ({
      index,
      title: `第${index}章`,
      purpose: index === 1 ? "setup" : "progress",
      protagonistAction: "追查新的声音线索",
      conflict: "线索与记忆代价冲突",
      readerExpectation: "真相是否更近一步",
      emotionTarget: "紧张",
      hook: "出现下一条异常线索",
      payoff: "确认一条有效事实",
    })),
    firstArcChapters: [],
  });

  for (let index = 1; index <= 3; index += 1) {
    accept(root, "chapter_draft", {
      index,
      title: `声音第${index}次出现`,
      content: [
        `沈砚在第${index}个现场听见了不该存在的声音。`,
        "他没有解释能力来源，而是顺着声音留下的方向继续调查。",
        "新的证据出现，同时他发现自己忘掉了刚刚记住的一串号码。",
      ].join("\n\n"),
    });
  }
  assert.equal(listChapters(root).length, 3);

  const shen = upsertEntity(root, { id: "shen", type: "character", name: "沈砚", summary: "追查姐姐旧案的刑警" });
  const su = upsertEntity(root, { id: "su", type: "character", name: "苏禾", summary: "掌握旧案资料的记者" });
  upsertRelationship(root, { sourceId: shen.id, targetId: su.id, relationType: "alliance", label: "互相利用的调查同盟", fromChapter: 2 });
  upsertTimelineEvent(root, { title: "沈砚第一次听见死者声音", storyTime: "故事第1天", chapterIndex: 1, characterIds: [shen.id] });
  upsertForeshadow(root, { title: "缺失的七秒录音", introducedChapter: 1, targetChapter: 12, notes: "与姐姐旧案有关" });
  const promise = openReaderPromise(root, { title: "姐姐旧案真相", chapterIndex: 1, targetChapter: 20 });
  transitionReaderPromise(root, { promiseId: promise.id, action: "ADVANCE", chapterIndex: 3, note: "发现案卷时间被修改" });
  assert.equal(listReaderPromises(root, "open")[0].advanceCount, 1);

  const packet = buildTaskPacket(root, "write-chapter", { chapterIndex: 4 });
  assert.equal(packet.currentChapter, 4);
  assert.ok(packet.officialKnowledge.length >= 1);
  assert.equal(packet.storyState.readerPromises.length, 1);

  const opening = reviewOpening(root);
  assert.equal(opening.chapterCount, 3);
  const signing = reviewSigning(root);
  assert.equal(signing.blockers.length, 0);
  assert.ok(["prepared", "needs_review"].includes(signing.status));

  const graph = renderView(root, "character_graph");
  const timeline = renderView(root, "timeline");
  const promises = renderView(root, "promise_board");
  assert.match(readFileSync(graph.path, "utf8"), /人物关系/u);
  assert.match(readFileSync(timeline.path, "utf8"), /故事时间线/u);
  assert.match(readFileSync(promises.path, "utf8"), /读者期待/u);

  const config = readConfig(root);
  assert.equal(config.title, "七秒之后");
  assert.ok(config.positioning);
  assert.ok(config.openingBlueprint);

  assert.ok(listTools().some((tool) => tool.name === "chapterflow_view_render"));
  const toolSummary = await executeTool("chapterflow_project_summary", { root });
  assert.equal(toolSummary.chapterCount, 3);
});

test("candidate stale guard prevents silent overwrite", () => {
  const root = workspace();
  initProject(root, { title: "并发测试" });
  const first = stageCandidate(root, {
    kind: "story_engine",
    payload: { protagonist: "A" },
  });
  upsertEntity(root, { id: "someone", type: "character", name: "有人" });
  assert.throws(() => decideCandidate(root, first.id, "accept"), /stale/u);
});
