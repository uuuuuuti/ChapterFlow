import { randomUUID } from "node:crypto";

import { getProjectVersion, openState, row, rows } from "./state.mjs";
import {
  statePath,
  writeChapter,
  writeConfig,
  syncProject,
} from "./project.mjs";

export const CANDIDATE_KINDS = [
  "book_positioning",
  "story_engine",
  "packaging",
  "opening_blueprint",
  "chapter_draft",
  "story_plan",
];

export function stageCandidate(root, input) {
  const kind = String(input.kind ?? "").trim();
  if (!CANDIDATE_KINDS.includes(kind))
    throw new Error(`Unsupported candidate kind: ${kind}`);
  validatePayload(kind, input.payload);
  syncProject(root);
  const db = openState(statePath(root));
  const now = new Date().toISOString();
  const candidate = {
    id: input.id ?? randomUUID(),
    kind,
    status: "candidate",
    payload: structuredClone(input.payload),
    provenance: input.provenance ?? { kind: "host_agent", sourceRefs: [] },
    baseVersion: getProjectVersion(db),
    createdAt: now,
    decidedAt: null,
  };
  db.prepare(
    `INSERT INTO candidates(id, kind, status, payload_json, provenance_json, base_version, created_at, decided_at)
              VALUES (?, ?, 'candidate', ?, ?, ?, ?, NULL)`,
  ).run(
    candidate.id,
    candidate.kind,
    JSON.stringify(candidate.payload),
    JSON.stringify(candidate.provenance),
    candidate.baseVersion,
    now,
  );
  db.close();
  return candidate;
}

export function listCandidates(root, status = null) {
  const db = openState(statePath(root));
  const values = status
    ? rows(
        db,
        "SELECT * FROM candidates WHERE status = ? ORDER BY created_at DESC",
        status,
      )
    : rows(db, "SELECT * FROM candidates ORDER BY created_at DESC");
  db.close();
  return values.map(deserializeCandidate);
}

export function decideCandidate(root, candidateId, action) {
  if (!["accept", "reject"].includes(action))
    throw new Error("Candidate action must be accept or reject");
  syncProject(root);
  const db = openState(statePath(root));
  const stored = row(db, "SELECT * FROM candidates WHERE id = ?", candidateId);
  if (!stored) {
    db.close();
    throw new Error(`Candidate not found: ${candidateId}`);
  }
  const candidate = deserializeCandidate(stored);
  if (candidate.status !== "candidate") {
    db.close();
    throw new Error(
      `Candidate ${candidateId} has already been ${candidate.status}`,
    );
  }
  const currentVersion = getProjectVersion(db);
  if (action === "accept" && candidate.baseVersion !== currentVersion) {
    db.close();
    throw new Error(
      `Candidate ${candidateId} is stale (base ${candidate.baseVersion}, current ${currentVersion}). Regenerate or review again.`,
    );
  }
  const now = new Date().toISOString();
  if (action === "reject") {
    db.prepare(
      "UPDATE candidates SET status = 'rejected', decided_at = ? WHERE id = ?",
    ).run(now, candidateId);
    db.close();
    return { ...candidate, status: "rejected", decidedAt: now };
  }
  db.close();
  applyCandidate(root, candidate);
  const after = openState(statePath(root));
  after
    .prepare(
      "UPDATE candidates SET status = 'accepted', decided_at = ? WHERE id = ?",
    )
    .run(now, candidateId);
  after.close();
  return { ...candidate, status: "accepted", decidedAt: now };
}

function applyCandidate(root, candidate) {
  switch (candidate.kind) {
    case "book_positioning":
      writeConfig(root, (config) => ({
        ...config,
        positioning: candidate.payload,
      }));
      return;
    case "story_engine":
      writeConfig(root, (config) => ({
        ...config,
        storyEngine: candidate.payload,
      }));
      return;
    case "packaging":
      writeConfig(root, (config) => {
        const selected = candidate.payload.selected ?? candidate.payload;
        return {
          ...config,
          packaging: candidate.payload,
          title: selected.title?.trim() || config.title,
          premise: selected.description?.trim() || config.premise,
        };
      });
      return;
    case "opening_blueprint":
      writeConfig(root, (config) => ({
        ...config,
        openingBlueprint: candidate.payload,
      }));
      return;
    case "chapter_draft":
      writeChapter(root, candidate.payload);
      return;
    case "story_plan":
      writeConfig(root, (config) => {
        const previous = config.storyPlan ?? { arcs: [], chapters: [] };
        const merge = (old, next, key) => [
          ...new Map(
            [...old, ...next].map((item) => [item[key], item]),
          ).values(),
        ];
        return {
          ...config,
          storyPlan: {
            arcs: merge(
              previous.arcs ?? [],
              candidate.payload.arcs ?? [],
              "id",
            ),
            chapters: merge(
              previous.chapters ?? [],
              candidate.payload.chapters,
              "index",
            ).sort((a, b) => a.index - b.index),
          },
        };
      });
      return;
    default:
      throw new Error(`Unsupported candidate kind: ${candidate.kind}`);
  }
}

function validatePayload(kind, payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Candidate payload must be an object");
  }
  if (kind === "story_plan") {
    if (!Array.isArray(payload.chapters) || !payload.chapters.length)
      throw new Error("story_plan requires chapters");
    const seen = new Set();
    for (const chapter of payload.chapters) {
      if (
        !chapter ||
        !Number.isInteger(chapter.index) ||
        chapter.index < 1 ||
        seen.has(chapter.index)
      )
        throw new Error(
          "story_plan chapter indices must be unique positive integers",
        );
      seen.add(chapter.index);
      for (const field of ["title", "goal", "conflict", "outcome"]) {
        if (typeof chapter[field] !== "string" || !chapter[field].trim())
          throw new Error(`story_plan chapter requires ${field}`);
      }
    }
    if (payload.arcs !== undefined) {
      if (!Array.isArray(payload.arcs))
        throw new Error("story_plan arcs must be an array");
      const ids = new Set();
      for (const arc of payload.arcs) {
        if (
          !arc ||
          typeof arc.id !== "string" ||
          !arc.id.trim() ||
          ids.has(arc.id) ||
          typeof arc.title !== "string" ||
          !arc.title.trim()
        )
          throw new Error("story_plan arcs require unique ids and titles");
        ids.add(arc.id);
      }
    }
  }
  if (kind === "chapter_draft") {
    if (!Number.isInteger(Number(payload.index)) || Number(payload.index) < 1)
      throw new Error("chapter_draft requires a positive index");
    if (!String(payload.title ?? "").trim())
      throw new Error("chapter_draft requires title");
    if (!String(payload.content ?? "").trim())
      throw new Error("chapter_draft requires content");
  }
  if (kind === "book_positioning") {
    for (const field of [
      "oneLineStory",
      "coreIdea",
      "readerProfile",
      "protagonistDesire",
      "coreConflict",
      "longTermExpectation",
    ]) {
      if (!String(payload[field] ?? "").trim())
        throw new Error(`book_positioning requires ${field}`);
    }
  }
  if (kind === "story_engine" && !String(payload.protagonist ?? "").trim()) {
    throw new Error("story_engine requires protagonist");
  }
  if (kind === "opening_blueprint") {
    const firstThree = payload.firstThreeChapters;
    if (!Array.isArray(firstThree) || firstThree.length !== 3) {
      throw new Error(
        "opening_blueprint requires exactly three opening chapters",
      );
    }
  }
}

function deserializeCandidate(value) {
  return {
    id: value.id,
    kind: value.kind,
    status: value.status,
    payload: JSON.parse(value.payload_json),
    provenance: JSON.parse(value.provenance_json),
    baseVersion: Number(value.base_version),
    createdAt: value.created_at,
    decidedAt: value.decided_at,
  };
}
