import { createHash } from 'node:crypto'
import { DomainError } from './errors.js'
import { isRecord } from './json.js'
import type {
  BookProject,
  Chapter,
  ChapterDraftCandidatePayload,
  ChapterIntent,
  ChapterVersion,
  DomainFactory,
  JsonValue,
} from './types.js'

function requiredString(
  value: Record<string, unknown>,
  key: keyof ChapterIntent,
  label: string,
): string {
  const raw = value[key]
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new DomainError(
      'INVALID_CANDIDATE',
      `${label}.${String(key)} must be a non-empty string`,
    )
  }
  return raw.trim()
}

export function parseOpeningChapterIntents(value: JsonValue): ChapterIntent[] {
  if (!isRecord(value) || !Array.isArray(value.chapterIntents)) {
    throw new DomainError(
      'INVALID_CANDIDATE',
      'opening_blueprint requires chapterIntents',
    )
  }
  if (value.chapterIntents.length !== 3) {
    throw new DomainError(
      'INVALID_CANDIDATE',
      'opening_blueprint must contain exactly three chapter intents',
    )
  }

  return value.chapterIntents.map((raw, index) => {
    if (!isRecord(raw)) {
      throw new DomainError(
        'INVALID_CANDIDATE',
        `chapterIntents[${index}] must be an object`,
      )
    }
    const chapter = raw.chapter
    if (!Number.isInteger(chapter) || chapter !== index + 1) {
      throw new DomainError(
        'INVALID_CANDIDATE',
        `chapterIntents[${index}].chapter must equal ${index + 1}`,
      )
    }
    const label = `chapterIntents[${index}]`
    return {
      chapter,
      purpose: requiredString(raw, 'purpose', label),
      readerExpectation: requiredString(raw, 'readerExpectation', label),
      emotionTarget: requiredString(raw, 'emotionTarget', label),
      goal: requiredString(raw, 'goal', label),
      conflict: requiredString(raw, 'conflict', label),
      payoff: requiredString(raw, 'payoff', label),
      hook: requiredString(raw, 'hook', label),
    }
  })
}

export function materializeOpeningChapters(
  project: BookProject,
  openingBlueprint: JsonValue,
  factory: DomainFactory,
): BookProject {
  if (project.chapters.length > 0) {
    throw new DomainError(
      'INVALID_PROJECT',
      'opening chapters are already materialized',
    )
  }

  const intents = parseOpeningChapterIntents(openingBlueprint)
  const chapters: Chapter[] = intents.map((intent) => ({
    id: factory.id('chapter'),
    index: intent.chapter,
    intent,
    status: 'planned',
  }))

  return {
    ...project,
    chapters,
  }
}

export function parseChapterDraftPayload(payload: unknown): ChapterDraftCandidatePayload {
  if (!isRecord(payload)) {
    throw new DomainError(
      'INVALID_CANDIDATE',
      'chapter_draft payload must be an object',
    )
  }
  const allowed = new Set(['chapterIndex', 'title', 'content'])
  for (const key of Object.keys(payload)) {
    if (!allowed.has(key)) {
      throw new DomainError(
        'INVALID_CANDIDATE',
        `unsupported chapter_draft field: ${key}`,
      )
    }
  }

  if (!Number.isInteger(payload.chapterIndex) || (payload.chapterIndex as number) <= 0) {
    throw new DomainError(
      'INVALID_CANDIDATE',
      'chapterIndex must be a positive integer',
    )
  }
  if (typeof payload.content !== 'string' || !payload.content.trim()) {
    throw new DomainError(
      'INVALID_CANDIDATE',
      'chapter_draft content must be a non-empty string',
    )
  }
  if (
    payload.title !== undefined
    && (typeof payload.title !== 'string' || !payload.title.trim())
  ) {
    throw new DomainError(
      'INVALID_CANDIDATE',
      'chapter_draft title must be a non-empty string when present',
    )
  }

  return {
    chapterIndex: payload.chapterIndex as number,
    ...(typeof payload.title === 'string' ? { title: payload.title.trim() } : {}),
    content: payload.content.trim(),
  }
}

export function nextPendingChapter(project: BookProject): Chapter | undefined {
  return [...project.chapters]
    .sort((a, b) => a.index - b.index)
    .find((chapter) => !chapter.acceptedDraftVersion)
}

export interface AcceptedChapterDraft {
  project: BookProject
  version: ChapterVersion
  content: string
}

export function acceptChapterDraft(
  project: BookProject,
  candidateId: string,
  payload: ChapterDraftCandidatePayload,
  nextRevision: number,
  now: string,
  factory: DomainFactory,
): AcceptedChapterDraft {
  if (project.lifecycle.currentStage !== 'first_3_chapters') {
    throw new DomainError(
      'INVALID_CANDIDATE',
      `cannot accept chapter draft while current lifecycle stage is ${project.lifecycle.currentStage}`,
    )
  }

  const pending = nextPendingChapter(project)
  if (!pending) {
    throw new DomainError(
      'INVALID_CANDIDATE',
      'the first three chapters are already accepted',
    )
  }
  if (pending.index !== payload.chapterIndex) {
    throw new DomainError(
      'INVALID_CANDIDATE',
      `chapter ${payload.chapterIndex} cannot be accepted before chapter ${pending.index}`,
    )
  }

  const content = payload.content.trim()
  const version: ChapterVersion = {
    id: factory.id('chapter_version'),
    chapterId: pending.id,
    contentHash: createHash('sha256').update(content, 'utf8').digest('hex'),
    wordCount: content.replace(/\s+/g, '').length,
    createdAt: now,
    candidateId,
    acceptedAt: now,
    projectRevision: nextRevision,
  }

  const chapters = project.chapters.map((chapter) => {
    if (chapter.id !== pending.id) return chapter
    return {
      ...chapter,
      ...(payload.title ? { title: payload.title } : {}),
      status: 'accepted' as const,
      acceptedDraftVersion: version.id,
    }
  })

  return {
    project: {
      ...project,
      chapters,
      chapterVersions: [...project.chapterVersions, version],
    },
    version,
    content,
  }
}
