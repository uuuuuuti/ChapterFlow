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
  goal: string | null;
  conflict: string | null;
  payoff: string | null;
  hook: string | null;
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
  goal: string | null;
  conflict: string | null;
  payoff: string | null;
  hook: string | null;
  characterIds: string[];
  foreshadowIds: string[];
  timelineIds: string[];
  targetWords: number | null;
  pacing: CreativePacing;
}

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
    | "brief";
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
