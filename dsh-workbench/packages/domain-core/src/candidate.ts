import { DomainError } from './errors.js'
import { assertJsonValue, isRecord } from './json.js'
import { artifactStageFor, deriveLifecycle } from './lifecycle.js'
import { systemDomainFactory } from './project.js'
import {
  BOOK_ARTIFACT_TYPES,
  type AcceptCandidateResult,
  type BookArtifactCandidatePayload,
  type BookArtifactType,
  type BookProject,
  type Candidate,
  type DomainFactory,
  type ProjectArtifact,
  type ProjectMetadataCandidatePayload,
  type StageCandidateInput,
} from './types.js'

function isArtifactType(value: unknown): value is BookArtifactType {
  return typeof value === 'string'
    && (BOOK_ARTIFACT_TYPES as readonly string[]).includes(value)
}

function parseArtifactPayload(payload: unknown): BookArtifactCandidatePayload {
  if (!isRecord(payload) || !isArtifactType(payload.artifactType) || !('value' in payload)) {
    throw new DomainError(
      'INVALID_CANDIDATE',
      'book_artifact candidate payload requires artifactType and value',
    )
  }
  assertJsonValue(payload.value, 'payload.value')
  return {
    artifactType: payload.artifactType,
    value: payload.value,
  }
}

function parseMetadataPayload(payload: unknown): ProjectMetadataCandidatePayload {
  if (!isRecord(payload)) {
    throw new DomainError('INVALID_CANDIDATE', 'project_metadata payload must be an object')
  }
  const allowed = new Set(['title', 'genre', 'platformTarget'])
  for (const key of Object.keys(payload)) {
    if (!allowed.has(key)) {
      throw new DomainError('INVALID_CANDIDATE', `unsupported metadata field: ${key}`)
    }
  }

  const parsed: ProjectMetadataCandidatePayload = {}
  if ('title' in payload) {
    if (typeof payload.title !== 'string' || !payload.title.trim()) {
      throw new DomainError('INVALID_CANDIDATE', 'title must be a non-empty string')
    }
    parsed.title = payload.title.trim()
  }
  for (const key of ['genre', 'platformTarget'] as const) {
    if (!(key in payload)) continue
    const value = payload[key]
    if (value !== null && typeof value !== 'string') {
      throw new DomainError('INVALID_CANDIDATE', `${key} must be a string or null`)
    }
    parsed[key] = typeof value === 'string' ? value.trim() || null : null
  }
  if (Object.keys(parsed).length === 0) {
    throw new DomainError('INVALID_CANDIDATE', 'project_metadata payload is empty')
  }
  return parsed
}

export function validateCandidatePayload(kind: Candidate['kind'], payload: unknown): void {
  assertJsonValue(payload)
  if (kind === 'book_artifact') {
    parseArtifactPayload(payload)
    return
  }
  if (kind === 'project_metadata') {
    parseMetadataPayload(payload)
    return
  }
  throw new DomainError('UNSUPPORTED_CANDIDATE_KIND', `unsupported candidate kind: ${kind}`)
}

export function stageCandidate(
  project: BookProject,
  input: StageCandidateInput,
  factory: DomainFactory = systemDomainFactory,
): Candidate {
  if (!input.summary.trim()) {
    throw new DomainError('INVALID_CANDIDATE', 'candidate summary must not be empty')
  }
  if (input.targetId) {
    throw new DomainError(
      'INVALID_CANDIDATE',
      'targetId is reserved for later candidate kinds and is not supported in Domain Core V0.1',
    )
  }
  validateCandidatePayload(input.kind, input.payload)

  return {
    id: factory.id('cand'),
    kind: input.kind,
    ...(input.targetId ? { targetId: input.targetId } : {}),
    baseProjectRevision: project.revision,
    payload: input.payload,
    summary: input.summary.trim(),
    ...(input.sourceRun ? { sourceRun: input.sourceRun } : {}),
    sourceRefs: [...(input.sourceRefs ?? [])],
    status: 'staged',
    createdAt: factory.now(),
  }
}

function requireStaged(candidate: Candidate): void {
  if (candidate.status !== 'staged') {
    throw new DomainError(
      'CANDIDATE_NOT_STAGED',
      `candidate ${candidate.id} is ${candidate.status}, not staged`,
    )
  }
}

export function acceptCandidate(
  project: BookProject,
  candidate: Candidate,
  factory: DomainFactory = systemDomainFactory,
): AcceptCandidateResult {
  requireStaged(candidate)

  if (candidate.baseProjectRevision !== project.revision) {
    return {
      status: 'stale',
      project,
      candidate: {
        ...candidate,
        status: 'stale',
      },
    }
  }

  const now = factory.now()
  const nextRevision = project.revision + 1
  let artifact: ProjectArtifact | undefined
  let nextProject: BookProject = {
    ...project,
    revision: nextRevision,
    updatedAt: now,
    artifacts: [...project.artifacts],
    acceptedArtifactRefs: [...project.acceptedArtifactRefs],
    activeArtifactRefs: { ...project.activeArtifactRefs },
  }

  if (candidate.kind === 'book_artifact') {
    const payload = parseArtifactPayload(candidate.payload)
    const currentStage = deriveLifecycle(project).currentStage
    const artifactStage = artifactStageFor(payload.artifactType)
    if (artifactStage !== currentStage) {
      throw new DomainError(
        'INVALID_CANDIDATE',
        `cannot accept ${payload.artifactType} while current lifecycle stage is ${currentStage}`,
      )
    }
    artifact = {
      id: factory.id('artifact'),
      type: payload.artifactType,
      value: payload.value,
      acceptedCandidateId: candidate.id,
      acceptedAt: now,
      projectRevision: nextRevision,
    }
    nextProject.artifacts.push(artifact)
    nextProject.acceptedArtifactRefs.push(artifact.id)
    nextProject.activeArtifactRefs[payload.artifactType] = artifact.id
  } else if (candidate.kind === 'project_metadata') {
    const payload = parseMetadataPayload(candidate.payload)
    if (payload.title !== undefined) nextProject.title = payload.title
    if (payload.genre !== undefined) {
      if (payload.genre === null) delete nextProject.genre
      else nextProject.genre = payload.genre
    }
    if (payload.platformTarget !== undefined) {
      if (payload.platformTarget === null) delete nextProject.platformTarget
      else nextProject.platformTarget = payload.platformTarget
    }
  } else {
    throw new DomainError(
      'UNSUPPORTED_CANDIDATE_KIND',
      `unsupported candidate kind: ${candidate.kind}`,
    )
  }

  nextProject.lifecycle = deriveLifecycle(nextProject)
  const accepted: Candidate = {
    ...candidate,
    status: 'accepted',
    decidedAt: now,
  }

  return {
    status: 'accepted',
    project: nextProject,
    candidate: accepted,
    ...(artifact ? { artifact } : {}),
  }
}

export function rejectCandidate(
  candidate: Candidate,
  decisionNote: string | undefined,
  factory: DomainFactory = systemDomainFactory,
): Candidate {
  if (candidate.status !== 'staged' && candidate.status !== 'stale') {
    throw new DomainError(
      'CANDIDATE_NOT_STAGED',
      `candidate ${candidate.id} is ${candidate.status} and cannot be rejected`,
    )
  }
  return {
    ...candidate,
    status: 'rejected',
    decidedAt: factory.now(),
    ...(decisionNote?.trim() ? { decisionNote: decisionNote.trim() } : {}),
  }
}
