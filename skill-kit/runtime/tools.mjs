import { initProject, projectSummary, syncProject, listChapters, readChapter } from "./project.mjs";
import { buildContext, buildTaskPacket } from "./context.mjs";
import { stageCandidate, decideCandidate, listCandidates } from "./candidates.mjs";
import {
  upsertEntity,
  listEntities,
  upsertRelationship,
  listRelationships,
  upsertTimelineEvent,
  listTimeline,
  upsertForeshadow,
  listForeshadows,
  openReaderPromise,
  transitionReaderPromise,
  listReaderPromises,
  readerPromiseHealth,
} from "./story.mjs";
import { retrieveKnowledge, knowledgeCoverage } from "./knowledge.mjs";
import { reviewOpening, reviewSigning } from "./review.mjs";
import { renderView } from "../renderer/html.mjs";
import { VIEW_TYPES } from "./view-spec.mjs";

const rootProp = {
  root: {
    type: "string",
    description: "ChapterFlow project root. Defaults to CHAPTERFLOW_PROJECT or current working directory.",
  },
};

const tools = [
  tool("chapterflow_project_init", "Create a standalone ChapterFlow novel workspace.", {
    ...rootProp,
    title: { type: "string" }, premise: { type: "string" }, genre: { type: "string" }, audience: { type: "string" }, promise: { type: "string" }, platform: { type: "string" },
  }, ["root", "title"], (a) => initProject(rootOf(a), a)),
  tool("chapterflow_project_summary", "Read current project progress and state without mutating it.", rootProp, [], (a) => projectSummary(rootOf(a))),
  tool("chapterflow_project_sync", "Re-index Markdown manuscript files after external/agent edits.", rootProp, [], (a) => syncProject(rootOf(a))),
  tool("chapterflow_chapter_list", "List indexed manuscript chapters.", rootProp, [], (a) => listChapters(rootOf(a))),
  tool("chapterflow_chapter_read", "Read one manuscript chapter by numeric index.", { ...rootProp, chapterIndex: { type: "integer", minimum: 1 } }, ["chapterIndex"], (a) => readChapter(rootOf(a), a.chapterIndex)),
  tool("chapterflow_context", "Build compact authoritative story context for the host model. The host model should generate creative content itself.", {
    ...rootProp,
    task: { type: "string" },
    stage: { type: "string" },
    chapterIndex: { type: "integer", minimum: 1 },
    recentChapters: { type: "integer", minimum: 0, maximum: 8 },
    knowledgeQuery: { type: "string" },
  }, [], (a) => a.task ? buildTaskPacket(rootOf(a), a.task, a) : buildContext(rootOf(a), a)),
  tool("chapterflow_candidate_stage", "Stage an AI/author proposal without changing formal project state. Required before accepting generated positioning, story engine, packaging, opening blueprint, or chapter prose.", {
    ...rootProp,
    kind: { type: "string", enum: ["book_positioning", "story_engine", "packaging", "opening_blueprint", "chapter_draft"] },
    payload: { type: "object", additionalProperties: true },
    provenance: { type: "object", additionalProperties: true },
  }, ["kind", "payload"], (a) => stageCandidate(rootOf(a), a)),
  tool("chapterflow_candidate_list", "List staged/accepted/rejected proposals.", { ...rootProp, status: { type: "string", enum: ["candidate", "accepted", "rejected"] } }, [], (a) => listCandidates(rootOf(a), a.status ?? null)),
  tool("chapterflow_candidate_decide", "Accept or reject a staged candidate. Acceptance fails if project state changed after generation.", {
    ...rootProp,
    candidateId: { type: "string" },
    action: { type: "string", enum: ["accept", "reject"] },
  }, ["candidateId", "action"], (a) => decideCandidate(rootOf(a), a.candidateId, a.action)),
  tool("chapterflow_entity_upsert", "Create/update a character, organization, location or other story entity after author confirmation.", {
    ...rootProp,
    id: { type: "string" }, type: { type: "string" }, name: { type: "string" }, summary: { type: "string" }, status: { type: "string" }, attrs: { type: "object", additionalProperties: true },
  }, ["name"], (a) => upsertEntity(rootOf(a), a)),
  tool("chapterflow_entity_list", "List story entities.", { ...rootProp, type: { type: "string" } }, [], (a) => listEntities(rootOf(a), a.type ?? null)),
  tool("chapterflow_relationship_upsert", "Create/update a relationship after author confirmation.", {
    ...rootProp,
    id: { type: "string" }, sourceId: { type: "string" }, targetId: { type: "string" }, relationType: { type: "string" }, label: { type: "string" }, status: { type: "string" }, fromChapter: { type: "integer", minimum: 1 }, toChapter: { type: "integer", minimum: 1 }, notes: { type: "string" },
  }, ["sourceId", "targetId", "label"], (a) => upsertRelationship(rootOf(a), a)),
  tool("chapterflow_relationship_list", "List relationships, optionally as they existed at a chapter.", { ...rootProp, chapterIndex: { type: "integer", minimum: 1 } }, [], (a) => listRelationships(rootOf(a), a.chapterIndex ?? null)),
  tool("chapterflow_timeline_upsert", "Create/update a story timeline event after author confirmation.", {
    ...rootProp,
    id: { type: "string" }, title: { type: "string" }, storyTime: { type: "string" }, chapterIndex: { type: "integer", minimum: 1 }, summary: { type: "string" }, characterIds: { type: "array", items: { type: "string" } }, attrs: { type: "object", additionalProperties: true },
  }, ["title"], (a) => upsertTimelineEvent(rootOf(a), a)),
  tool("chapterflow_timeline_list", "List story timeline events.", rootProp, [], (a) => listTimeline(rootOf(a))),
  tool("chapterflow_foreshadow_upsert", "Create/update a foreshadow record after author confirmation.", {
    ...rootProp,
    id: { type: "string" }, title: { type: "string" }, status: { type: "string" }, introducedChapter: { type: "integer", minimum: 1 }, targetChapter: { type: "integer", minimum: 1 }, resolvedChapter: { type: "integer", minimum: 1 }, notes: { type: "string" },
  }, ["title"], (a) => upsertForeshadow(rootOf(a), a)),
  tool("chapterflow_foreshadow_list", "List foreshadows and their lifecycle.", rootProp, [], (a) => listForeshadows(rootOf(a))),
  tool("chapterflow_reader_promise_open", "Open a durable reader expectation at a chapter.", {
    ...rootProp,
    id: { type: "string" }, title: { type: "string" }, description: { type: "string" }, chapterIndex: { type: "integer", minimum: 1 }, targetChapter: { type: "integer", minimum: 1 }, note: { type: "string" },
  }, ["title", "chapterIndex"], (a) => openReaderPromise(rootOf(a), a)),
  tool("chapterflow_reader_promise_transition", "Advance or pay off an existing reader expectation.", {
    ...rootProp,
    promiseId: { type: "string" }, action: { type: "string", enum: ["ADVANCE", "PAYOFF"] }, chapterIndex: { type: "integer", minimum: 1 }, note: { type: "string" },
  }, ["promiseId", "action", "chapterIndex"], (a) => transitionReaderPromise(rootOf(a), a)),
  tool("chapterflow_reader_promise_list", "List reader expectations and optional health warnings.", { ...rootProp, status: { type: "string", enum: ["open", "paid_off", "abandoned"] }, currentChapter: { type: "integer", minimum: 0 } }, [], (a) => ({ promises: listReaderPromises(rootOf(a), a.status ?? null), health: readerPromiseHealth(rootOf(a), a.currentChapter ?? null) })),
  tool("chapterflow_knowledge_search", "Retrieve traceable Fanqie official knowledge cards. Use this instead of treating model memory as current platform guidance.", {
    stage: { type: "string" }, genre: { type: "string" }, query: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 20 }, coverage: { type: "boolean" },
  }, [], (a) => a.coverage ? knowledgeCoverage() : retrieveKnowledge(a)),
  tool("chapterflow_review_opening", "Run deterministic opening signals over the first chapters and return official guidance separately.", { ...rootProp, chapterCount: { type: "integer", minimum: 1, maximum: 5 } }, [], (a) => reviewOpening(rootOf(a), a)),
  tool("chapterflow_review_signing", "Assess signing preparation as blockers/high-risk/improvements/observations. Never predicts approval.", rootProp, [], (a) => reviewSigning(rootOf(a))),
  tool("chapterflow_view_render", "Render a standalone interactive HTML visualization for relationships, timeline, reader promises, foreshadows, story map, or opening health.", {
    ...rootProp,
    type: { type: "string", enum: VIEW_TYPES },
    chapterIndex: { type: "integer", minimum: 1 },
  }, ["type"], (a) => {
    const rendered = renderView(rootOf(a), a.type, a);
    return { type: rendered.type, title: rendered.title, path: rendered.path, summary: summarizeView(rendered.spec) };
  }),
];

export function listTools() {
  return tools.map(({ handler, ...definition }) => definition);
}

export async function executeTool(name, args = {}) {
  const definition = tools.find((item) => item.name === name);
  if (!definition) throw new Error(`Unknown ChapterFlow tool: ${name}`);
  return await definition.handler(args ?? {});
}

function tool(name, description, properties, required, handler) {
  return {
    name,
    description,
    inputSchema: {
      type: "object",
      properties,
      required,
      additionalProperties: false,
    },
    handler,
  };
}

function rootOf(args) {
  return args.root || process.env.CHAPTERFLOW_PROJECT || process.cwd();
}

function summarizeView(spec) {
  switch (spec.type) {
    case "character_graph": return `${spec.nodes.length} entities / ${spec.edges.length} relationships`;
    case "timeline": return `${spec.events.length} timeline events`;
    case "promise_board": return `${spec.promises.length} reader promises`;
    case "foreshadow_map": return `${spec.foreshadows.length} foreshadows`;
    case "story_map": return `${spec.chapters.length} planned/written chapters`;
    case "chapter_health": return `${spec.chapters.length} opening chapters analyzed`;
    default: return spec.title ?? spec.type;
  }
}
