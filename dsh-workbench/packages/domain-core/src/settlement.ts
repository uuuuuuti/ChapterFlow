import { DomainError } from './errors.js'
import { isRecord } from './json.js'
import type {
  BookProject,
  ChapterHandoff,
  ChapterSettlement,
  ChapterSettlementCandidatePayload,
  CharacterMemoryState,
  DomainFactory,
  JsonValue,
  ReaderPromise,
  ReaderPromiseOperation,
  RelationshipMemoryEvent,
  StoryEvent,
} from './types.js'

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new DomainError('INVALID_CANDIDATE', label + ' must be a non-empty string')
  }
  return value.trim()
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new DomainError('INVALID_CANDIDATE', label + ' must be an array of strings')
  }
  return value.map((item) => item.trim()).filter(Boolean)
}

function optionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined
  return requiredString(value, label)
}

function parseCharacterStates(value: unknown): CharacterMemoryState[] {
  if (!Array.isArray(value)) {
    throw new DomainError('INVALID_CANDIDATE', 'characterStates must be an array')
  }
  const seen = new Set<string>()
  return value.map((raw, index) => {
    if (!isRecord(raw)) {
      throw new DomainError('INVALID_CANDIDATE', 'characterStates[' + index + '] must be an object')
    }
    const characterKey = requiredString(raw.characterKey, 'characterKey')
    if (seen.has(characterKey)) {
      throw new DomainError('INVALID_CANDIDATE', 'duplicate characterKey ' + characterKey)
    }
    seen.add(characterKey)
    return {
      characterKey,
      name: requiredString(raw.name, 'name'),
      ...(optionalString(raw.physicalState, 'physicalState') ? { physicalState: optionalString(raw.physicalState, 'physicalState') } : {}),
      ...(optionalString(raw.emotionalState, 'emotionalState') ? { emotionalState: optionalString(raw.emotionalState, 'emotionalState') } : {}),
      ...(optionalString(raw.location, 'location') ? { location: optionalString(raw.location, 'location') } : {}),
      knows: stringArray(raw.knows ?? [], 'knows'),
      believes: stringArray(raw.believes ?? [], 'believes'),
      hides: stringArray(raw.hides ?? [], 'hides'),
      possessions: stringArray(raw.possessions ?? [], 'possessions'),
      unresolvedConflicts: stringArray(raw.unresolvedConflicts ?? [], 'unresolvedConflicts'),
    }
  })
}

function parseRelationshipEvents(value: unknown): RelationshipMemoryEvent[] {
  if (!Array.isArray(value)) {
    throw new DomainError('INVALID_CANDIDATE', 'relationshipEvents must be an array')
  }
  return value.map((raw, index) => {
    if (!isRecord(raw)) {
      throw new DomainError('INVALID_CANDIDATE', 'relationshipEvents[' + index + '] must be an object')
    }
    return {
      fromCharacterKey: requiredString(raw.fromCharacterKey, 'fromCharacterKey'),
      toCharacterKey: requiredString(raw.toCharacterKey, 'toCharacterKey'),
      type: requiredString(raw.type, 'type'),
      change: requiredString(raw.change, 'change'),
      evidence: requiredString(raw.evidence, 'evidence'),
      ...(optionalString(raw.tension, 'tension') ? { tension: optionalString(raw.tension, 'tension') } : {}),
      ...(optionalString(raw.trust, 'trust') ? { trust: optionalString(raw.trust, 'trust') } : {}),
      ...(optionalString(raw.affinity, 'affinity') ? { affinity: optionalString(raw.affinity, 'affinity') } : {}),
    }
  })
}

function parseTimelineEvents(value: unknown): StoryEvent[] {
  if (!Array.isArray(value)) {
    throw new DomainError('INVALID_CANDIDATE', 'timelineEvents must be an array')
  }
  return value.map((raw, index) => {
    if (!isRecord(raw)) {
      throw new DomainError('INVALID_CANDIDATE', 'timelineEvents[' + index + '] must be an object')
    }
    return {
      title: requiredString(raw.title, 'title'),
      summary: requiredString(raw.summary, 'summary'),
      storyOrder: Number.isInteger(raw.storyOrder) ? raw.storyOrder as number : index + 1,
      characterKeys: stringArray(raw.characterKeys ?? [], 'characterKeys'),
      ...(optionalString(raw.location, 'location') ? { location: optionalString(raw.location, 'location') } : {}),
    }
  })
}

function parsePromiseOperations(value: unknown): ReaderPromiseOperation[] {
  if (!Array.isArray(value)) {
    throw new DomainError('INVALID_CANDIDATE', 'readerPromiseOperations must be an array')
  }
  return value.map((raw, index) => {
    if (!isRecord(raw)) {
      throw new DomainError('INVALID_CANDIDATE', 'readerPromiseOperations[' + index + '] must be an object')
    }
    const action = raw.action
    if (action !== 'OPEN' && action !== 'ADVANCE' && action !== 'PAYOFF') {
      throw new DomainError('INVALID_CANDIDATE', 'readerPromiseOperations[' + index + '].action is invalid')
    }
    return {
      action,
      key: requiredString(raw.key, 'key'),
      ...(optionalString(raw.title, 'title') ? { title: optionalString(raw.title, 'title') } : {}),
      ...(optionalString(raw.description, 'description') ? { description: optionalString(raw.description, 'description') } : {}),
      evidence: requiredString(raw.evidence, 'evidence'),
      ...(optionalString(raw.note, 'note') ? { note: optionalString(raw.note, 'note') } : {}),
    }
  })
}

function parseHandoff(value: unknown): ChapterHandoff {
  if (!isRecord(value)) {
    throw new DomainError('INVALID_CANDIDATE', 'handoff must be an object')
  }
  return {
    endingSituation: requiredString(value.endingSituation, 'handoff.endingSituation'),
    unresolvedConflicts: stringArray(value.unresolvedConflicts ?? [], 'handoff.unresolvedConflicts'),
    immediateQuestions: stringArray(value.immediateQuestions ?? [], 'handoff.immediateQuestions'),
    activeCharacterKeys: stringArray(value.activeCharacterKeys ?? [], 'handoff.activeCharacterKeys'),
    nextChapterPressures: stringArray(value.nextChapterPressures ?? [], 'handoff.nextChapterPressures'),
    continuityWarnings: stringArray(value.continuityWarnings ?? [], 'handoff.continuityWarnings'),
  }
}

export function parseChapterSettlementPayload(payload: JsonValue): ChapterSettlementCandidatePayload {
  if (!isRecord(payload)) {
    throw new DomainError('INVALID_CANDIDATE', 'chapter_settlement payload must be an object')
  }
  const allowed = new Set([
    'chapterIndex',
    'chapterVersionId',
    'summary',
    'characterStates',
    'relationshipEvents',
    'timelineEvents',
    'readerPromiseOperations',
    'handoff',
  ])
  for (const key of Object.keys(payload)) {
    if (!allowed.has(key)) {
      throw new DomainError('INVALID_CANDIDATE', 'unsupported chapter_settlement field: ' + key)
    }
  }
  if (!Number.isInteger(payload.chapterIndex) || (payload.chapterIndex as number) <= 0) {
    throw new DomainError('INVALID_CANDIDATE', 'chapterIndex must be a positive integer')
  }
  return {
    chapterIndex: payload.chapterIndex as number,
    chapterVersionId: requiredString(payload.chapterVersionId, 'chapterVersionId'),
    summary: requiredString(payload.summary, 'summary'),
    characterStates: parseCharacterStates(payload.characterStates ?? []),
    relationshipEvents: parseRelationshipEvents(payload.relationshipEvents ?? []),
    timelineEvents: parseTimelineEvents(payload.timelineEvents ?? []),
    readerPromiseOperations: parsePromiseOperations(payload.readerPromiseOperations ?? []),
    handoff: parseHandoff(payload.handoff),
  }
}

function applyPromises(
  existing: ReaderPromise[],
  operations: ReaderPromiseOperation[],
  chapterIndex: number,
): ReaderPromise[] {
  const next = existing.map((item) => ({
    ...item,
    events: item.events.map((event) => ({ ...event })),
  }))

  for (const operation of operations) {
    const found = next.find((item) => item.key === operation.key)
    if (operation.action === 'OPEN') {
      if (found && found.status === 'open') {
        throw new DomainError('INVALID_CANDIDATE', 'reader promise ' + operation.key + ' is already open')
      }
      if (!operation.title || !operation.description) {
        throw new DomainError(
          'INVALID_CANDIDATE',
          'OPEN reader promise requires title and description',
        )
      }
      const event = {
        action: operation.action,
        chapterIndex,
        evidence: operation.evidence,
        ...(operation.note ? { note: operation.note } : {}),
      }
      if (found) {
        found.title = operation.title
        found.description = operation.description
        found.status = 'open'
        found.openedChapterIndex = chapterIndex
        found.events.push(event)
      } else {
        next.push({
          key: operation.key,
          title: operation.title,
          description: operation.description,
          status: 'open',
          openedChapterIndex: chapterIndex,
          events: [event],
        })
      }
      continue
    }

    if (!found || found.status !== 'open') {
      throw new DomainError(
        'INVALID_CANDIDATE',
        operation.action + ' requires an existing open reader promise: ' + operation.key,
      )
    }
    found.events.push({
      action: operation.action,
      chapterIndex,
      evidence: operation.evidence,
      ...(operation.note ? { note: operation.note } : {}),
    })
    if (operation.action === 'PAYOFF') found.status = 'paid_off'
  }

  return next
}

export interface AcceptedChapterSettlement {
  project: BookProject
  settlement: ChapterSettlement
}

export function acceptChapterSettlement(
  project: BookProject,
  candidateId: string,
  payload: ChapterSettlementCandidatePayload,
  nextRevision: number,
  now: string,
  factory: DomainFactory,
): AcceptedChapterSettlement {
  const chapter = project.chapters.find((item) => item.index === payload.chapterIndex)
  if (!chapter?.acceptedDraftVersion) {
    throw new DomainError('INVALID_CANDIDATE', 'chapter must be accepted before settlement')
  }
  if (chapter.acceptedDraftVersion !== payload.chapterVersionId) {
    throw new DomainError(
      'INVALID_CANDIDATE',
      'settlement chapterVersionId does not match the accepted chapter version',
    )
  }
  if (chapter.settledDraftVersion === payload.chapterVersionId) {
    throw new DomainError('INVALID_CANDIDATE', 'accepted chapter version is already settled')
  }

  const knownCharacterKeys = new Set([
    ...project.storyMemory.characterStates.map((item) => item.characterKey),
    ...payload.characterStates.map((item) => item.characterKey),
  ])
  for (const event of payload.relationshipEvents) {
    if (
      !knownCharacterKeys.has(event.fromCharacterKey)
      || !knownCharacterKeys.has(event.toCharacterKey)
    ) {
      throw new DomainError(
        'INVALID_CANDIDATE',
        'relationship event references an unknown character',
      )
    }
    if (event.fromCharacterKey === event.toCharacterKey) {
      throw new DomainError(
        'INVALID_CANDIDATE',
        'relationship event cannot reference the same character twice',
      )
    }
  }

  const settlementId = factory.id('settlement')
  const characterStates = [...project.storyMemory.characterStates]
  for (const state of payload.characterStates) {
    const index = characterStates.findIndex((item) => item.characterKey === state.characterKey)
    const accepted = {
      ...state,
      chapterIndex: payload.chapterIndex,
      chapterVersionId: payload.chapterVersionId,
      settlementId,
    }
    if (index >= 0) characterStates[index] = accepted
    else characterStates.push(accepted)
  }

  const relationshipEvents = payload.relationshipEvents.map((event) => ({
    ...event,
    id: factory.id('relationship_event'),
    chapterIndex: payload.chapterIndex,
    chapterVersionId: payload.chapterVersionId,
    settlementId,
  }))
  const timelineEvents = payload.timelineEvents.map((event) => ({
    ...event,
    id: factory.id('story_event'),
    chapterIndex: payload.chapterIndex,
    chapterVersionId: payload.chapterVersionId,
    settlementId,
  }))

  const settlement: ChapterSettlement = {
    id: settlementId,
    chapterIndex: payload.chapterIndex,
    chapterVersionId: payload.chapterVersionId,
    summary: payload.summary,
    characterKeys: payload.characterStates.map((item) => item.characterKey),
    relationshipEventIds: relationshipEvents.map((item) => item.id),
    timelineEventIds: timelineEvents.map((item) => item.id),
    readerPromiseKeys: payload.readerPromiseOperations.map((item) => item.key),
    handoff: {
      ...payload.handoff,
      chapterIndex: payload.chapterIndex,
      chapterVersionId: payload.chapterVersionId,
      settlementId,
    },
    acceptedCandidateId: candidateId,
    acceptedAt: now,
    projectRevision: nextRevision,
  }

  return {
    project: {
      ...project,
      chapters: project.chapters.map((item) =>
        item.id === chapter.id
          ? { ...item, settledDraftVersion: payload.chapterVersionId }
          : item,
      ),
      storyMemory: {
        characterStates,
        relationshipEvents: [...project.storyMemory.relationshipEvents, ...relationshipEvents],
        timelineEvents: [...project.storyMemory.timelineEvents, ...timelineEvents],
        settlements: [...project.storyMemory.settlements, settlement],
        latestHandoff: settlement.handoff,
      },
      readerMemory: {
        promises: applyPromises(
          project.readerMemory.promises,
          payload.readerPromiseOperations,
          payload.chapterIndex,
        ),
      },
    },
    settlement,
  }
}
