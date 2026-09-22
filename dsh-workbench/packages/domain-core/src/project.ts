import { randomUUID } from 'node:crypto'
import { DomainError } from './errors.js'
import { deriveLifecycle } from './lifecycle.js'
import type {
  BookProject,
  CreateBookProjectInput,
  DomainFactory,
  ProjectSnapshot,
} from './types.js'

export const systemDomainFactory: DomainFactory = {
  id(prefix: string) {
    return `${prefix}_${randomUUID()}`
  },
  now() {
    return new Date().toISOString()
  },
}

function cleanOptional(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  const cleaned = value.trim()
  return cleaned.length > 0 ? cleaned : undefined
}

export function createBookProject(
  input: CreateBookProjectInput,
  factory: DomainFactory = systemDomainFactory,
): ProjectSnapshot {
  const title = input.title.trim()
  if (!title) {
    throw new DomainError('INVALID_PROJECT', 'book title must not be empty')
  }

  const now = factory.now()
  const project: BookProject = {
    id: factory.id('book'),
    schemaVersion: 1,
    title,
    ...(cleanOptional(input.genre) ? { genre: cleanOptional(input.genre) } : {}),
    ...(cleanOptional(input.platformTarget)
      ? { platformTarget: cleanOptional(input.platformTarget) }
      : {}),
    createdAt: now,
    updatedAt: now,
    revision: 0,
    lifecycle: {
      currentStage: 'idea',
      stages: [],
      nextAction: '',
      blockers: [],
    },
    artifacts: [],
    acceptedArtifactRefs: [],
    activeArtifactRefs: {},
    chapters: [],
    chapterVersions: [],
  }
  project.lifecycle = deriveLifecycle(project)

  return {
    schemaVersion: 1,
    project,
    candidates: [],
  }
}
