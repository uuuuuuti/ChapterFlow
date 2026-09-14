export type CreativePresetStatus = "active" | "archived";
export type CreativePacing = "slow" | "steady" | "fast" | "cliffhanger";

export interface CreativePreset {
  id: string;
  projectId: string | null;
  name: string;
  genre: string | null;
  audience: string | null;
  promise: string | null;
  pacing: CreativePacing;
  targetWordsPerChapter: number;
  updateCadence: string | null;
  boundaries: string[];
  checkRules: string[];
  defaultTemplate: string | null;
  status: CreativePresetStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** Editable snapshot captured before a creative preset revision. */
export interface CreativePresetSnapshot {
  name: string;
  genre: string | null;
  audience: string | null;
  promise: string | null;
  pacing: CreativePacing;
  targetWordsPerChapter: number;
  updateCadence: string | null;
  boundaries: string[];
  checkRules: string[];
  defaultTemplate: string | null;
  status: CreativePresetStatus;
}

export interface CreativePresetHistory {
  id: string;
  presetId: string;
  presetVersion: number;
  snapshot: CreativePresetSnapshot;
  createdAt: string;
}

export interface BookProfile {
  projectId: string;
  presetId: string | null;
  genre: string | null;
  audience: string | null;
  promise: string | null;
  tone: string | null;
  endingDirection: string | null;
  pov: string | null;
  updateCadence: string | null;
  targetWordsPerChapter: number | null;
  boundaries: string[];
  worldRules: string[];
  arcNotes: string[];
  version: number;
  updatedAt: string;
}

/**
 * A restorable snapshot of a book profile.  The project id and optimistic
 * concurrency fields belong to the live row and are intentionally excluded
 * from the snapshot so a restore always targets the current project version.
 */
export interface BookProfileSnapshot {
  presetId: string | null;
  genre: string | null;
  audience: string | null;
  promise: string | null;
  tone: string | null;
  endingDirection: string | null;
  pov: string | null;
  updateCadence: string | null;
  targetWordsPerChapter: number | null;
  boundaries: string[];
  worldRules: string[];
  arcNotes: string[];
}

export interface BookProfileHistory {
  id: string;
  projectId: string;
  profileVersion: number;
  snapshot: BookProfileSnapshot;
  createdAt: string;
}

export interface ChapterBrief {
  id: string;
  projectId: string;
  outlineNodeId: string;
  /** Immutable manuscript version used when the brief was last saved. */
  documentVersionId: string | null;
  /** Primary narrative job of this chapter. */
  purpose: ChapterPurpose;
  /** Optional secondary jobs; kept intentionally small for author usability. */
  secondaryPurposes: ChapterPurpose[];
  goal: string | null;
  readerExpectation: string | null;
  emotionTarget: ChapterEmotionTarget | null;
  emotionCurve: ChapterEmotionCurvePoint[];
  conflict: string | null;
  readerPromiseOperations: ReaderPromiseOperation[];
  payoff: string | null;
  payoffStrength: number;
  hook: string | null;
  hookType: ChapterHookType | null;
  hookStrength: number;
  informationGain: number;
  endingPull: number;
  sceneStructure: ChapterSceneStructure[];
  characterIds: string[];
  foreshadowIds: string[];
  timelineIds: string[];
  targetWords: number | null;
  pacing: CreativePacing;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** Editable fields captured before each chapter brief revision. */
export interface ChapterBriefSnapshot {
  purpose: ChapterPurpose;
  secondaryPurposes: ChapterPurpose[];
  goal: string | null;
  readerExpectation: string | null;
  emotionTarget: ChapterEmotionTarget | null;
  emotionCurve: ChapterEmotionCurvePoint[];
  conflict: string | null;
  readerPromiseOperations: ReaderPromiseOperation[];
  payoff: string | null;
  payoffStrength: number;
  hook: string | null;
  hookType: ChapterHookType | null;
  hookStrength: number;
  informationGain: number;
  endingPull: number;
  sceneStructure: ChapterSceneStructure[];
  characterIds: string[];
  foreshadowIds: string[];
  timelineIds: string[];
  targetWords: number | null;
  pacing: CreativePacing;
}

/**
 * The small, author-facing vocabulary for a chapter's primary job.  These
 * values are deliberately narrative jobs rather than a full quality rubric.
 */
export type ChapterPurpose =
  | "setup"
  | "progress"
  | "conflict"
  | "reveal"
  | "payoff"
  | "turning_point"
  | "relationship"
  | "worldbuilding"
  | "transition"
  | "climax";

export type ChapterEmotionTarget =
  "爽" | "紧张" | "期待" | "惊讶" | "压迫" | "感动" | "暧昧" | "恐惧" | "轻松";

export type ChapterHookType =
  | "question"
  | "reveal"
  | "danger"
  | "decision"
  | "arrival"
  | "identity"
  | "information_gap"
  | "emotional"
  | "reward"
  | "reverse";

export interface ChapterEmotionCurvePoint {
  label: string;
  intensity: number;
}

export interface ChapterSceneStructure {
  order: number;
  purpose: ChapterPurpose;
  beat: string;
  payoff: string | null;
}

export type ReaderPromiseAction = "OPEN" | "ADVANCE" | "PAYOFF";
export type ReaderPromiseStatus = "open" | "paid_off" | "abandoned";

/** A typed operation in a Chapter Intent, not an unstructured note. */
export interface ReaderPromiseOperation {
  action: ReaderPromiseAction;
  promiseId: string | null;
  title: string | null;
  note: string | null;
}

export interface ReaderPromise {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: ReaderPromiseStatus;
  openedChapterId: string | null;
  openedChapterIndex: number;
  targetChapterId: string | null;
  paidOffChapterId: string | null;
  lastAdvancedChapterId: string | null;
  lastAdvancedChapterIndex: number | null;
  advanceCount: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ReaderPromiseEvent {
  id: string;
  projectId: string;
  promiseId: string;
  action: ReaderPromiseAction;
  chapterId: string | null;
  chapterIndex: number;
  note: string | null;
  source: "author" | "ai" | "settlement" | "restore";
  createdAt: string;
}

export interface ReaderPromiseView extends ReaderPromise {
  openForChapters: number;
  lastAction: ReaderPromiseAction;
  warningCodes: string[];
}

export interface ReaderPromiseHealth {
  openCount: number;
  longUnadvancedCount: number;
  overloaded: boolean;
  warningCodes: string[];
}

export interface CreateReaderPromiseInput {
  id: string;
  projectId: string;
  title: string;
  description?: string | null;
  openedChapterId: string;
  openedChapterIndex: number;
  targetChapterId?: string | null;
  now: string;
}

export function createReaderPromise(
  input: CreateReaderPromiseInput,
): ReaderPromise {
  const title = input.title.trim();
  if (!title) throw new Error("Reader promise title must not be empty");
  if (
    !Number.isInteger(input.openedChapterIndex) ||
    input.openedChapterIndex < 1
  ) {
    throw new Error("Reader promise opening chapter index must be positive");
  }
  return {
    id: input.id,
    projectId: input.projectId,
    title,
    description: input.description?.trim() || null,
    status: "open",
    openedChapterId: input.openedChapterId,
    openedChapterIndex: input.openedChapterIndex,
    targetChapterId: input.targetChapterId ?? null,
    paidOffChapterId: null,
    lastAdvancedChapterId: null,
    lastAdvancedChapterIndex: null,
    advanceCount: 0,
    version: 0,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

export function transitionReaderPromise(
  promise: ReaderPromise,
  action: Exclude<ReaderPromiseAction, "OPEN">,
  chapterId: string,
  chapterIndex: number,
  now: string,
): ReaderPromise {
  if (promise.status !== "open") {
    throw new Error(
      `Reader promise ${promise.id} is ${promise.status} and cannot receive ${action}`,
    );
  }
  if (
    !chapterId.trim() ||
    !Number.isInteger(chapterIndex) ||
    chapterIndex < 1
  ) {
    throw new Error("Reader promise action requires a valid chapter");
  }
  return {
    ...promise,
    status: action === "PAYOFF" ? "paid_off" : "open",
    paidOffChapterId:
      action === "PAYOFF" ? chapterId : promise.paidOffChapterId,
    lastAdvancedChapterId: chapterId,
    lastAdvancedChapterIndex: chapterIndex,
    advanceCount:
      action === "ADVANCE" ? promise.advanceCount + 1 : promise.advanceCount,
    version: promise.version + 1,
    updatedAt: now,
  };
}

/** Chapter Intent is the product term; ChapterBrief remains the wire/storage
 * name so existing projects and clients continue to work. */
export type ChapterIntent = ChapterBrief;
export type ChapterIntentSnapshot = ChapterBriefSnapshot;

export interface ChapterBriefHistory {
  id: string;
  projectId: string;
  outlineNodeId: string;
  briefVersion: number;
  snapshot: ChapterBriefSnapshot;
  createdAt: string;
}

export type WebNovelCandidateKind = "profile" | "brief";
export type WebNovelCandidateStatus =
  "candidate" | "partially_applied" | "applied" | "rejected";
export type WebNovelCandidateOperation = "update";

export interface WebNovelCandidateEvidence {
  sourceType:
    | "outline"
    | "entity"
    | "fact"
    | "relation"
    | "timeline"
    | "foreshadow"
    | "document"
    | "profile"
    | "brief"
    | "reader_promise";
  sourceId: string;
  label: string;
  quote: string;
  versionId: string | null;
}

export interface WebNovelCandidateItem {
  id: string;
  operation: WebNovelCandidateOperation;
  title: string;
  rationale: string;
  impact: string[];
  before: Record<string, unknown> | null;
  after: Record<string, unknown>;
  evidence: WebNovelCandidateEvidence[];
  requiresLockedConfirmation: boolean;
  decision: {
    action: "apply" | "reject";
    result: Record<string, unknown> | null;
    decidedAt: string;
  } | null;
}

export interface WebNovelCandidateSet {
  id: string;
  projectId: string;
  runId: string;
  stepId: string;
  kind: WebNovelCandidateKind;
  outlineNodeId: string | null;
  instruction: string;
  summary: string;
  sourceProfileVersion: number | null;
  sourceBriefVersion: number | null;
  sourceDocumentId: string | null;
  sourceDocumentVersionId: string | null;
  sourceOutlineUpdatedAt: string | null;
  baseFingerprint: string;
  currentFingerprint: string;
  stale: boolean;
  status: WebNovelCandidateStatus;
  items: WebNovelCandidateItem[];
  createdAt: string;
  decidedAt: string | null;
}

export type NovelCheckIssueStatus = "open" | "ignored" | "resolved";

export interface NovelCheckIssueState {
  projectId: string;
  issueId: string;
  status: NovelCheckIssueStatus;
  note: string | null;
  updatedAt: string;
}

/** A durable snapshot of one 网文 opening check run. */
export interface OpeningCheckReportRecord {
  id: string;
  projectId: string;
  scope: "opening-three";
  generatedAt: string;
  report: Record<string, unknown>;
  createdAt: string;
}

export type OpeningCheckAuditEventType =
  "report_generated" | "issue_decided" | "candidate_decided";

export interface OpeningCheckAuditRecord {
  id: string;
  projectId: string;
  reportId: string | null;
  issueId: string | null;
  proposalId: string | null;
  runId: string | null;
  eventType: OpeningCheckAuditEventType;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
}
