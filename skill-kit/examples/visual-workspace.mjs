import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initProject, writeChapter } from "../runtime/project.mjs";
import { stageCandidate, decideCandidate } from "../runtime/candidates.mjs";
import {
  upsertEntity,
  upsertRelationship,
  upsertTimelineEvent,
  upsertForeshadow,
  openReaderPromise,
  transitionReaderPromise,
} from "../runtime/story.mjs";
import { renderView } from "../renderer/html.mjs";

const root = mkdtempSync(join(tmpdir(), "chapterflow-visual-demo-"));
initProject(root, {
  title: "七秒之后 · 示例作品",
  premise: "每条线索都需要付出记忆代价。",
});
const names = [
  "沈砚",
  "苏禾",
  "林队长",
  "失踪证人周宁",
  "档案管理员",
  "调查组",
  "旧城区",
  "姐姐沈岚",
];
names.forEach((name, index) =>
  upsertEntity(root, {
    id: `e${index}`,
    name,
    type: index === 5 ? "organization" : index === 6 ? "location" : "character",
    summary: `${name}与旧案调查相关。人物各有目标，关系随着证据变化。`,
    attrs: { goal: "确认旧案的真实经过", boundary: "只知道亲历的事件" },
  }),
);
for (let i = 1; i < names.length; i++)
  upsertRelationship(root, {
    sourceId: "e0",
    targetId: `e${i}`,
    label: ["调查同盟", "隐瞒证据", "保护证人"][i % 3],
    fromChapter: i,
    notes: "此关系依赖已确认的事件；后续变化应保留章节范围。",
  });
const candidate = stageCandidate(root, {
  kind: "story_plan",
  payload: {
    arcs: [
      {
        id: "old-case",
        title: "第一弧：缺失的录音",
        goal: "找到活着的证人",
        conflict: "记忆不断流失",
        payoff: "确认案卷被篡改",
      },
    ],
    chapters: Array.from({ length: 12 }, (_, i) => ({
      index: i + 1,
      arcId: "old-case",
      title: `第${i + 1}条线索`,
      goal: "找到证据的原始持有人",
      conflict: "线索与旧记忆互相矛盾",
      outcome: "证实一条线索但失去一段记忆",
      readerExpectation: "谁篡改了录音",
      emotionTarget: i % 2 ? "紧张" : "期待",
      hook: "新的证人出现在监控里",
      payoff: "排除一个错误猜测",
    })),
  },
});
decideCandidate(root, candidate.id, "accept");
for (let i = 1; i <= 8; i++) {
  writeChapter(root, {
    index: i,
    title: `第${i}条线索`,
    content: `沈砚站在门口，发现门锁被换过。\n\n“有人比我们先到。”苏禾指着地上的纸片。\n\n他拾起纸片，却已记不起刚才拨过的号码。`,
  });
  upsertTimelineEvent(root, {
    title: `发现第${i}条线索`,
    storyTime: `故事第${i}天`,
    chapterIndex: i,
    characterIds: ["e0", "e1"],
    summary: "调查推进，但记忆代价使局势恶化。",
  });
}
const promise = openReaderPromise(root, {
  title: "姐姐旧案的真相",
  chapterIndex: 1,
  targetChapter: 6,
  description: "读者期待找到案卷被改写的证据。",
});
transitionReaderPromise(root, {
  promiseId: promise.id,
  action: "ADVANCE",
  chapterIndex: 3,
  note: "发现时间戳异常",
});
upsertForeshadow(root, {
  title: "烧焦的录音带",
  introducedChapter: 2,
  targetChapter: 5,
  notes: "应在档案室场景解释来源；当前尚未回收。",
});
upsertForeshadow(root, {
  title: "证人的钥匙",
  introducedChapter: 1,
  targetChapter: 7,
  resolvedChapter: 7,
  status: "resolved",
  notes: "钥匙打开了证人的旧信箱。",
});
console.log(JSON.stringify(renderView(root, "workspace"), null, 2));
