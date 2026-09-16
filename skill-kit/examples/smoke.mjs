import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { initProject } from "../runtime/project.mjs";
import { stageCandidate, decideCandidate } from "../runtime/candidates.mjs";
import { buildTaskPacket } from "../runtime/context.mjs";
import { renderView } from "../renderer/html.mjs";

const root = mkdtempSync(join(tmpdir(), "chapterflow-skill-smoke-"));
const project = initProject(root, {
  title: "七秒之后",
  premise: "落魄刑警能听见死者临终前七秒的声音。",
  genre: "都市悬疑",
  audience: "悬疑男频读者",
  promise: "追查旧案，同时承受记忆代价",
});

const candidate = stageCandidate(root, {
  kind: "book_positioning",
  payload: {
    oneLineStory: "一个会因能力失去记忆的刑警追查姐姐旧案。",
    coreIdea: "死者最后七秒声音",
    readerProfile: "悬疑男频读者",
    protagonistDesire: "查清姐姐死亡真相",
    obstacle: "能力侵蚀记忆",
    coreConflict: "越接近真相越可能忘记真相",
    longTermExpectation: "姐姐旧案与能力来源的关系",
  },
});
decideCandidate(root, candidate.id, "accept");

const packet = buildTaskPacket(root, "start-book");
const view = renderView(root, "story_map");

console.log(JSON.stringify({
  project,
  task: packet.task,
  officialKnowledgeCards: packet.officialKnowledge.length,
  view: view.path,
}, null, 2));
