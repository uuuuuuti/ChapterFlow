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
}

export type CandidateKind = 'book_artifact' | 'project_metadata'
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
    }
  | {
      status: 'stale'
      project: BookProject
      candidate: Candidate
    }
