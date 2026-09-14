import { sha256Hex } from "@narralume/domain";
import {
  WebNovelCandidateSetSchema,
  type WebNovelCandidateItemDto,
  type WebNovelCandidateSetDto,
} from "@narralume/contracts";
import {
  SqliteDocumentRepository,
  SqliteStoryRepository,
  SqliteReaderPromiseRepository,
  SqliteWebNovelCandidateRepository,
  SqliteWebNovelRepository,
  type NarrativeDatabase,
} from "@narralume/persistence";

import { ServiceError } from "./service-error.js";

export class WebNovelCandidateError extends ServiceError {
  constructor(code: string, message: string, statusCode: number) {
    super(code, message, statusCode);
    this.name = "WebNovelCandidateError";
  }
}

export class WebNovelCandidateService {
  private readonly candidates: SqliteWebNovelCandidateRepository;
  private readonly documents: SqliteDocumentRepository;
  private readonly story: SqliteStoryRepository;
  private readonly webNovel: SqliteWebNovelRepository;
  private readonly readerPromises: SqliteReaderPromiseRepository;

  constructor(
    private readonly database: NarrativeDatabase,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.candidates = new SqliteWebNovelCandidateRepository(database);
    this.documents = new SqliteDocumentRepository(database);
    this.story = new SqliteStoryRepository(database);
    this.webNovel = new SqliteWebNovelRepository(database);
    this.readerPromises = new SqliteReaderPromiseRepository(database);
  }

  list(
    projectId: string,
    kind?: "profile" | "brief",
    outlineNodeId?: string | null,
  ): WebNovelCandidateSetDto[] {
    return this.candidates
      .list(projectId, kind)
      .filter(
        (detail) =>
          outlineNodeId === undefined ||
          detail.set.outlineNodeId === (outlineNodeId ?? null),
      )
      .map((detail) => this.view(detail));
  }

  get(projectId: string, setId: string): WebNovelCandidateSetDto {
    const detail = this.candidates.get(setId);
    if (!detail || detail.set.projectId !== projectId) {
      throw new WebNovelCandidateError(
        "web_novel_candidate.not_found",
        "Web-novel candidate set not found",
        404,
      );
    }
    return this.view(detail);
  }

  decideItem(input: {
    projectId: string;
    setId: string;
    itemId: string;
    action: "apply" | "reject";
    confirmLocked: boolean;
  }): {
    candidateSet: WebNovelCandidateSetDto;
    item: WebNovelCandidateItemDto;
  } {
    return this.database.transaction(() => {
      const detail = this.candidates.get(input.setId);
      if (!detail || detail.set.projectId !== input.projectId) {
        throw new WebNovelCandidateError(
          "web_novel_candidate.not_found",
          "Web-novel candidate set not found",
          404,
        );
      }
      const item = detail.items.find(
        (candidate) => candidate.id === input.itemId,
      );
      if (!item) {
        throw new WebNovelCandidateError(
          "web_novel_candidate.item.not_found",
          "Web-novel candidate item not found",
          404,
        );
      }
      if (item.decision) {
        if (item.decision.action !== input.action) {
          throw new WebNovelCandidateError(
            "web_novel_candidate.item.already_decided",
            "This candidate item has already been decided",
            409,
          );
        }
        const candidateSet = this.view(detail);
        return {
          candidateSet,
          item: candidateSet.items.find(
            (candidate) => candidate.id === input.itemId,
          )!,
        };
      }
      if (input.action === "reject") {
        const updated = this.candidates.decideItem({
          setId: input.setId,
          itemId: input.itemId,
          action: "reject",
          result: null,
          now: this.now().toISOString(),
        });
        return this.response(updated, input.itemId);
      }
      if (item.requiresLockedConfirmation && !input.confirmLocked) {
        throw new WebNovelCandidateError(
          "web_novel_candidate.locked_confirmation_required",
          "This candidate touches a locked planning field; confirm it explicitly before applying",
          409,
        );
      }
      const current = this.currentState(
        detail.set.projectId,
        detail.set.kind,
        detail.set.outlineNodeId,
      );
      this.assertFresh(detail.set, current);
      const now = this.now().toISOString();
      let result: Record<string, unknown>;
      if (detail.set.kind === "profile") {
        const profile = this.webNovel.getBookProfile(detail.set.projectId);
        const merged = { ...profileEditable(profile), ...item.after };
        const updated = this.webNovel.upsertBookProfile(detail.set.projectId, {
          ...profileInput(merged),
          expectedVersion: profile?.version ?? null,
          now,
        });
        result = {
          kind: "profile",
          version: updated.version,
          updatedAt: updated.updatedAt,
        };
      } else {
        if (!detail.set.outlineNodeId) {
          throw new WebNovelCandidateError(
            "web_novel_candidate.brief.outline_required",
            "The chapter brief candidate has no outline node",
            422,
          );
        }
        const brief = this.webNovel.getChapterBrief(
          detail.set.projectId,
          detail.set.outlineNodeId,
        );
        const merged = { ...briefEditable(brief), ...item.after };
        const updated = this.webNovel.upsertChapterBrief(
          detail.set.projectId,
          detail.set.outlineNodeId,
          {
            ...briefInput(merged),
            expectedVersion: brief?.version ?? null,
            now,
          },
        );
        result = {
          kind: "brief",
          outlineNodeId: updated.outlineNodeId,
          version: updated.version,
          documentVersionId: updated.documentVersionId,
          updatedAt: updated.updatedAt,
        };
      }
      const updated = this.candidates.decideItem({
        setId: input.setId,
        itemId: input.itemId,
        action: "apply",
        result,
        now,
      });
      return this.response(updated, input.itemId);
    });
  }

  private response(
    detail: ReturnType<SqliteWebNovelCandidateRepository["require"]>,
    itemId: string,
  ) {
    const candidateSet = this.view(detail);
    return {
      candidateSet: WebNovelCandidateSetSchema.parse(candidateSet),
      item: candidateSet.items.find((candidate) => candidate.id === itemId)!,
    };
  }

  private view(
    detail: ReturnType<SqliteWebNovelCandidateRepository["require"]>,
  ): WebNovelCandidateSetDto {
    const current = this.currentState(
      detail.set.projectId,
      detail.set.kind,
      detail.set.outlineNodeId,
    );
    const view = {
      ...detail.set,
      currentFingerprint: current.fingerprint,
      stale: !this.isFresh(detail.set, current),
      items: detail.items,
    };
    return WebNovelCandidateSetSchema.parse(view);
  }

  private isFresh(
    set: ReturnType<SqliteWebNovelCandidateRepository["require"]>["set"],
    current: CurrentState,
  ): boolean {
    return (
      current.fingerprint === set.baseFingerprint &&
      current.profileVersion === set.sourceProfileVersion &&
      current.briefVersion === set.sourceBriefVersion &&
      current.documentVersionId === set.sourceDocumentVersionId &&
      current.outlineUpdatedAt === set.sourceOutlineUpdatedAt
    );
  }

  private assertFresh(
    set: ReturnType<SqliteWebNovelCandidateRepository["require"]>["set"],
    current: CurrentState,
  ): void {
    if (!this.isFresh(set, current)) {
      throw new WebNovelCandidateError(
        "web_novel_candidate.source.stale",
        "The profile, brief, manuscript version, or outline changed after this candidate was generated; refresh and regenerate",
        409,
      );
    }
  }

  private currentState(
    projectId: string,
    kind: "profile" | "brief",
    outlineNodeId: string | null,
  ): CurrentState {
    const profile = this.webNovel.getBookProfile(projectId);
    if (kind === "profile") {
      return {
        fingerprint: sha256Hex(stableJson(profileEditable(profile))),
        profileVersion: profile?.version ?? null,
        briefVersion: null,
        documentVersionId: null,
        outlineUpdatedAt: null,
      };
    }
    if (!outlineNodeId) {
      return {
        fingerprint: sha256Hex("null"),
        profileVersion: profile?.version ?? null,
        briefVersion: null,
        documentVersionId: null,
        outlineUpdatedAt: null,
      };
    }
    const brief = this.webNovel.getChapterBrief(projectId, outlineNodeId);
    const node = this.story.getOutlineNode(projectId, outlineNodeId);
    const promiseState = this.readerPromises.listViews(projectId, {
      view: "open",
      currentChapterIndex: this.readerPromises.chapterIndex(
        projectId,
        outlineNodeId,
      ),
    });
    const document = this.documents
      .list(projectId)
      .find((item) => item.outlineNodeId === outlineNodeId);
    return {
      fingerprint: sha256Hex(
        stableJson({
          current: briefEditable(brief),
          openReaderPromises: promiseState.promises,
        }),
      ),
      profileVersion: profile?.version ?? null,
      briefVersion: brief?.version ?? null,
      documentVersionId:
        brief?.documentVersionId ?? document?.currentVersionId ?? null,
      outlineUpdatedAt: node?.updatedAt ?? null,
    };
  }
}

interface CurrentState {
  fingerprint: string;
  profileVersion: number | null;
  briefVersion: number | null;
  documentVersionId: string | null;
  outlineUpdatedAt: string | null;
}

function profileEditable(
  profile: ReturnType<SqliteWebNovelRepository["getBookProfile"]>,
): Record<string, unknown> {
  if (!profile) return profileInput({});
  const { projectId, version, updatedAt, ...editable } = profile;
  void projectId;
  void version;
  void updatedAt;
  return editable;
}

function briefEditable(
  brief: ReturnType<SqliteWebNovelRepository["getChapterBrief"]>,
): Record<string, unknown> {
  if (!brief) return briefInput({});
  const {
    id,
    projectId,
    outlineNodeId,
    documentVersionId,
    version,
    createdAt,
    updatedAt,
    ...editable
  } = brief;
  void id;
  void projectId;
  void outlineNodeId;
  void documentVersionId;
  void version;
  void createdAt;
  void updatedAt;
  return editable;
}

function profileInput(value: Record<string, unknown>) {
  return {
    presetId: nullableString(value.presetId),
    genre: nullableString(value.genre),
    audience: nullableString(value.audience),
    promise: nullableString(value.promise),
    tone: nullableString(value.tone),
    endingDirection: nullableString(value.endingDirection),
    pov: nullableString(value.pov),
    updateCadence: nullableString(value.updateCadence),
    targetWordsPerChapter: nullableNumber(value.targetWordsPerChapter),
    boundaries: stringArray(value.boundaries),
    worldRules: stringArray(value.worldRules),
    arcNotes: stringArray(value.arcNotes),
  };
}

function briefInput(value: Record<string, unknown>) {
  return {
    purpose: enumValue(
      value.purpose,
      [
        "setup",
        "progress",
        "conflict",
        "reveal",
        "payoff",
        "turning_point",
        "relationship",
        "worldbuilding",
        "transition",
        "climax",
      ] as const,
      "progress",
    ),
    secondaryPurposes: stringEnumArray(value.secondaryPurposes, [
      "setup",
      "progress",
      "conflict",
      "reveal",
      "payoff",
      "turning_point",
      "relationship",
      "worldbuilding",
      "transition",
      "climax",
    ] as const).slice(0, 3),
    goal: nullableString(value.goal),
    readerExpectation: nullableString(value.readerExpectation),
    emotionTarget: nullableEnumValue(value.emotionTarget, [
      "爽",
      "紧张",
      "期待",
      "惊讶",
      "压迫",
      "感动",
      "暧昧",
      "恐惧",
      "轻松",
    ] as const),
    emotionCurve: objectList(value.emotionCurve)
      .map((entry) => ({
        label: typeof entry.label === "string" ? entry.label : "",
        intensity: strengthValue(entry.intensity),
      }))
      .filter((entry) => entry.label.trim().length > 0)
      .slice(0, 8),
    conflict: nullableString(value.conflict),
    readerPromiseOperations: objectList(value.readerPromiseOperations)
      .map((entry) => ({
        action: enumValue(
          entry.action,
          ["OPEN", "ADVANCE", "PAYOFF"] as const,
          "OPEN",
        ),
        promiseId: nullableString(entry.promiseId),
        title: nullableString(entry.title),
        note: nullableString(entry.note),
      }))
      .filter(
        (entry) =>
          (entry.action === "OPEN" &&
            (entry.promiseId !== null || entry.title !== null)) ||
          (entry.action !== "OPEN" && entry.promiseId !== null),
      )
      .slice(0, 30),
    payoff: nullableString(value.payoff),
    payoffStrength: strengthValue(value.payoffStrength),
    hook: nullableString(value.hook),
    hookType: nullableEnumValue(value.hookType, [
      "question",
      "reveal",
      "danger",
      "decision",
      "arrival",
      "identity",
      "information_gap",
      "emotional",
      "reward",
      "reverse",
    ] as const),
    hookStrength: strengthValue(value.hookStrength),
    informationGain: strengthValue(value.informationGain),
    endingPull: strengthValue(value.endingPull),
    sceneStructure: objectList(value.sceneStructure)
      .map((entry, index) => ({
        order:
          typeof entry.order === "number" && Number.isInteger(entry.order)
            ? Math.max(1, Math.min(20, entry.order))
            : index + 1,
        purpose: enumValue(
          entry.purpose,
          [
            "setup",
            "progress",
            "conflict",
            "reveal",
            "payoff",
            "turning_point",
            "relationship",
            "worldbuilding",
            "transition",
            "climax",
          ] as const,
          "progress",
        ),
        beat: typeof entry.beat === "string" ? entry.beat : "",
        payoff: nullableString(entry.payoff),
      }))
      .filter((entry) => entry.beat.trim().length > 0)
      .slice(0, 20),
    characterIds: stringArray(value.characterIds),
    foreshadowIds: stringArray(value.foreshadowIds),
    timelineIds: stringArray(value.timelineIds),
    targetWords: nullableNumber(value.targetWords),
    pacing: enumValue(
      value.pacing,
      ["slow", "steady", "fast", "cliffhanger"] as const,
      "steady",
    ),
  };
}

function nullableEnumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | null {
  return typeof value === "string" && allowed.includes(value as T)
    ? (value as T)
    : null;
}

function stringEnumArray<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is T =>
          typeof item === "string" && allowed.includes(item as T),
      )
    : [];
}

function objectList(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}

function strengthValue(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value)
    ? Math.max(0, Math.min(5, value))
    : 0;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is string =>
          typeof item === "string" && item.trim().length > 0,
      )
    : [];
}

function enumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === "string" && allowed.includes(value as T)
    ? (value as T)
    : fallback;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
    .join(",")}}`;
}
