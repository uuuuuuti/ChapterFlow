export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

export const BOOK_LIFECYCLE_STAGES = [
  'idea',
  'direction',
  'positioning',
  'story_engine',
  'packaging',
  'opening_blueprint',
  'first_3_chapters',
  'opening_review',
  'revision',
  'signing_ready',
  'serialization',
] as const

export type BookLifecycleStage = typeof BOOK_LIFECYCLE_STAGES[number]
export type LifecycleStageStatus = 'not_started' | 'active' | 'complete' | 'blocked'

export interface LifecycleStageState {
  stage: BookLifecycleStage
  status: LifecycleStageStatus
  artifactRefs: string[]
  candidateRefs: string[]
  findingRefs: string[]
  startedAt?: string
  completedAt?: string
}

export interface BookLifecycle {
  currentStage: BookLifecycleStage
  stages: LifecycleStageState[]
  nextAction: string
  blockers: string[]
}

export const BOOK_ARTIFACT_TYPES = [
  'idea',
  'direction',
  'positioning',
  'story_engine',
  'packaging',
  'opening_blueprint',
] as const

export type BookArtifactType = typeof BOOK_ARTIFACT_TYPES[number]

export interface ProjectArtifact {
  id: string
  type: BookArtifactType
  value: JsonValue
  acceptedCandidateId: string
  acceptedAt: string
  projectRevision: number
}

export interface ChapterIntent {
  chapter: number
  purpose: string
  readerExpectation: string
  emotionTarget: string
  goal: string
  conflict: string
  payoff: string
  hook: string
}

export type ChapterStatus = 'planned' | 'accepted'

export interface Chapter {
  id: string
  index: number
  title?: string
  intent: ChapterIntent
  status: ChapterStatus
  acceptedDraftVersion?: string
  settledDraftVersion?: string
}

export interface CharacterMemoryState {
  characterKey: string
  name: string
  physicalState?: string
  emotionalState?: string
  location?: string
  knows: string[]
  believes: string[]
  hides: string[]
  possessions: string[]
  unresolvedConflicts: string[]
  chapterIndex?: number
  chapterVersionId?: string
  settlementId?: string
}

export interface RelationshipMemoryEvent {
  id?: string
  fromCharacterKey: string
  toCharacterKey: string
  type: string
  change: string
  evidence: string
  tension?: string
  trust?: string
  affinity?: string
  chapterIndex?: number
  chapterVersionId?: string
  settlementId?: string
}

export interface StoryEvent {
  id?: string
  title: string
  summary: string
  storyOrder: number
  characterKeys: string[]
  location?: string
  chapterIndex?: number
  chapterVersionId?: string
  settlementId?: string
}

export type ReaderPromiseAction = 'OPEN' | 'ADVANCE' | 'PAYOFF'

export interface ReaderPromiseEvent {
  action: ReaderPromiseAction
  chapterIndex: number
  evidence: string
  note?: string
}

export interface ReaderPromise {
  key: string
  title: string
  description: string
  status: 'open' | 'paid_off' | 'abandoned'
  openedChapterIndex: number
  events: ReaderPromiseEvent[]
}

export interface ReaderPromiseOperation {
  action: ReaderPromiseAction
  key: string
  title?: string
  description?: string
  evidence: string
  note?: string
}

export interface ChapterHandoff {
  chapterIndex?: number
  chapterVersionId?: string
  settlementId?: string
  endingSituation: string
  unresolvedConflicts: string[]
  immediateQuestions: string[]
  activeCharacterKeys: string[]
  nextChapterPressures: string[]
  continuityWarnings: string[]
}

export interface ChapterSettlement {
  id: string
  chapterIndex: number
  chapterVersionId: string
  summary: string
  characterKeys: string[]
  relationshipEventIds: string[]
  timelineEventIds: string[]
  readerPromiseKeys: string[]
  handoff: ChapterHandoff
  acceptedCandidateId: string
  acceptedAt: string
  projectRevision: number
}

export interface StoryMemory {
  characterStates: CharacterMemoryState[]
  relationshipEvents: RelationshipMemoryEvent[]
  timelineEvents: StoryEvent[]
  settlements: ChapterSettlement[]
  latestHandoff?: ChapterHandoff
}

export interface ReaderMemory {
  promises: ReaderPromise[]
}

export interface ChapterVersion {
  id: string
  chapterId: string
  contentHash: string
  wordCount: number
  createdAt: string
  candidateId: string
  acceptedAt: string
  projectRevision: number
}

export interface BookProject {
  id: string
  schemaVersion: 1
  title: string
  genre?: string
  platformTarget?: string
  createdAt: string
  updatedAt: string
  revision: number
  lifecycle: BookLifecycle
  artifacts: ProjectArtifact[]
  acceptedArtifactRefs: string[]
  activeArtifactRefs: Partial<Record<BookArtifactType, string>>
  chapters: Chapter[]
  chapterVersions: ChapterVersion[]
  storyMemory: StoryMemory
  readerMemory: ReaderMemory
}

export type CandidateKind = 'book_artifact' | 'project_metadata' | 'chapter_draft' | 'chapter_settlement'
export type CandidateStatus = 'staged' | 'accepted' | 'rejected' | 'stale'

export interface Candidate {
  id: string
  kind: CandidateKind
  targetId?: string
  baseProjectRevision: number
  payload: JsonValue
  summary: string
  sourceRun?: string
  sourceRefs: string[]
  status: CandidateStatus
  createdAt: string
  decidedAt?: string
  decisionNote?: string
}

export interface BookArtifactCandidatePayload {
  artifactType: BookArtifactType
  value: JsonValue
}

export interface ProjectMetadataCandidatePayload {
  title?: string
  genre?: string | null
  platformTarget?: string | null
}

export interface ChapterDraftCandidatePayload {
  chapterIndex: number
  title?: string
  content: string
}

export interface ChapterSettlementCandidatePayload {
  chapterIndex: number
  chapterVersionId: string
  summary: string
  characterStates: CharacterMemoryState[]
  relationshipEvents: RelationshipMemoryEvent[]
  timelineEvents: StoryEvent[]
  readerPromiseOperations: ReaderPromiseOperation[]
  handoff: ChapterHandoff
}

export interface ProjectSnapshot {
  schemaVersion: 1
  project: BookProject
  candidates: Candidate[]
}

export interface CreateBookProjectInput {
  title: string
  genre?: string
  platformTarget?: string
}

export interface StageCandidateInput {
  kind: CandidateKind
  targetId?: string
  payload: JsonValue
  summary: string
  sourceRun?: string
  sourceRefs?: string[]
}

export interface DomainFactory {
  id(prefix: string): string
  now(): string
}

export type AcceptCandidateResult =
  | {
      status: 'accepted'
      project: BookProject
      candidate: Candidate
      artifact?: ProjectArtifact
      chapterVersion?: ChapterVersion
      chapterContent?: string
      settlement?: ChapterSettlement
    }
  | {
      status: 'stale'
      project: BookProject
      candidate: Candidate
    }
