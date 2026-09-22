import {
  BOOK_ARTIFACT_TYPES,
  type BookArtifactType,
  type JsonValue,
  type ProjectSnapshot,
} from '@chapterflow/domain-core'

export type StartBookStage = BookArtifactType

export const START_BOOK_STAGES = [...BOOK_ARTIFACT_TYPES] as const

const STAGE_GUIDANCE: Record<StartBookStage, string> = {
  idea: [
    'Return one JSON object with exactly these keys:',
    'premise, protagonist, disruption, coreHook, stakes.',
    'Each value must be a non-empty string.',
    'Keep the idea specific enough to drive a serialized web novel.',
  ].join(' '),
  direction: [
    'Return one JSON object with exactly these keys:',
    'genre, subGenre, protagonistPath, coreConflict, emotionalTone,',
    'serializationPotential, differentiation, boundaries.',
    'subGenre and boundaries are arrays of non-empty strings; all other fields are non-empty strings.',
  ].join(' '),
  positioning: [
    'Return one JSON object with exactly these keys:',
    'premise, genre, subGenre, targetReader, coreFantasy, protagonistHook,',
    'centralConflict, emotionalValue, differentiation, readerPromise, boundaries.',
    'subGenre and boundaries are arrays of non-empty strings; all other fields are non-empty strings.',
  ].join(' '),
  story_engine: [
    'Return one JSON object with these required keys:',
    'protagonist, desire, lack, externalGoal, primaryOpposition, escalationMechanism,',
    'repeatableStoryLoop, firstArcGoal, failureConsequences.',
    'Optional keys: coreAbilityOrAdvantage, abilityCost, longTermMystery, relationshipEngine.',
    'Every present value is a non-empty string.',
  ].join(' '),
  packaging: [
    'Return one JSON object with exactly these keys:',
    'title, introduction, tags, sellingPoints, promiseAlignment, openingAlignment, samenessRisks.',
    'tags, sellingPoints and samenessRisks are arrays of non-empty strings;',
    'all other fields are non-empty strings.',
    'Do not invent CTR, signing probability, ranking, or platform guarantees.',
  ].join(' '),
  opening_blueprint: [
    'Return one JSON object with exactly these keys:',
    'corePromise, incitingEvent, protagonistPredicament, firstPayoff, firstMajorQuestion,',
    'chapterIntents, firstArcMilestones.',
    'chapterIntents must contain exactly three objects for chapters 1, 2 and 3.',
    'Each chapter intent must contain chapter, purpose, readerExpectation, emotionTarget,',
    'goal, conflict, payoff and hook. chapter is an integer; the other fields are non-empty strings.',
    'firstArcMilestones is an array of non-empty strings.',
  ].join(' '),
}

function fail(message: string): never {
  throw new Error(`Invalid StartBook artifact: ${message}`)
}

function record(value: unknown, label = 'artifact'): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be a JSON object`)
  }
  return value as Record<string, unknown>
}

function nonEmptyString(
  value: Record<string, unknown>,
  key: string,
  label = 'artifact',
): string {
  const raw = value[key]
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    fail(`${label}.${key} must be a non-empty string`)
  }
  return raw.trim()
}

function optionalString(
  value: Record<string, unknown>,
  key: string,
  label = 'artifact',
): string | undefined {
  if (!(key in value)) return undefined
  return nonEmptyString(value, key, label)
}

function stringArray(
  value: Record<string, unknown>,
  key: string,
  label = 'artifact',
): string[] {
  const raw = value[key]
  if (!Array.isArray(raw)) {
    fail(`${label}.${key} must be an array`)
  }
  const parsed = raw.map((item, index) => {
    if (typeof item !== 'string' || item.trim().length === 0) {
      fail(`${label}.${key}[${index}] must be a non-empty string`)
    }
    return item.trim()
  })
  return parsed
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label = 'artifact',
): void {
  const allowedSet = new Set(allowed)
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) fail(`${label} contains unsupported field ${key}`)
  }
  for (const key of allowed) {
    if (!(key in value)) fail(`${label} is missing required field ${key}`)
  }
}

function validateIdea(value: unknown): JsonValue {
  const obj = record(value)
  const keys = ['premise', 'protagonist', 'disruption', 'coreHook', 'stakes'] as const
  exactKeys(obj, keys)
  return Object.fromEntries(keys.map((key) => [key, nonEmptyString(obj, key)])) as JsonValue
}

function validateDirection(value: unknown): JsonValue {
  const obj = record(value)
  const keys = [
    'genre',
    'subGenre',
    'protagonistPath',
    'coreConflict',
    'emotionalTone',
    'serializationPotential',
    'differentiation',
    'boundaries',
  ] as const
  exactKeys(obj, keys)
  return {
    genre: nonEmptyString(obj, 'genre'),
    subGenre: stringArray(obj, 'subGenre'),
    protagonistPath: nonEmptyString(obj, 'protagonistPath'),
    coreConflict: nonEmptyString(obj, 'coreConflict'),
    emotionalTone: nonEmptyString(obj, 'emotionalTone'),
    serializationPotential: nonEmptyString(obj, 'serializationPotential'),
    differentiation: nonEmptyString(obj, 'differentiation'),
    boundaries: stringArray(obj, 'boundaries'),
  }
}

function validatePositioning(value: unknown): JsonValue {
  const obj = record(value)
  const keys = [
    'premise',
    'genre',
    'subGenre',
    'targetReader',
    'coreFantasy',
    'protagonistHook',
    'centralConflict',
    'emotionalValue',
    'differentiation',
    'readerPromise',
    'boundaries',
  ] as const
  exactKeys(obj, keys)
  return {
    premise: nonEmptyString(obj, 'premise'),
    genre: nonEmptyString(obj, 'genre'),
    subGenre: stringArray(obj, 'subGenre'),
    targetReader: nonEmptyString(obj, 'targetReader'),
    coreFantasy: nonEmptyString(obj, 'coreFantasy'),
    protagonistHook: nonEmptyString(obj, 'protagonistHook'),
    centralConflict: nonEmptyString(obj, 'centralConflict'),
    emotionalValue: nonEmptyString(obj, 'emotionalValue'),
    differentiation: nonEmptyString(obj, 'differentiation'),
    readerPromise: nonEmptyString(obj, 'readerPromise'),
    boundaries: stringArray(obj, 'boundaries'),
  }
}

function validateStoryEngine(value: unknown): JsonValue {
  const obj = record(value)
  const required = [
    'protagonist',
    'desire',
    'lack',
    'externalGoal',
    'primaryOpposition',
    'escalationMechanism',
    'repeatableStoryLoop',
    'firstArcGoal',
    'failureConsequences',
  ] as const
  const optional = [
    'coreAbilityOrAdvantage',
    'abilityCost',
    'longTermMystery',
    'relationshipEngine',
  ] as const
  const allowed = new Set([...required, ...optional])
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key as typeof required[number] | typeof optional[number])) {
      fail(`artifact contains unsupported field ${key}`)
    }
  }
  const result: Record<string, JsonValue> = {}
  for (const key of required) result[key] = nonEmptyString(obj, key)
  for (const key of optional) {
    const parsed = optionalString(obj, key)
    if (parsed !== undefined) result[key] = parsed
  }
  return result
}

function validatePackaging(value: unknown): JsonValue {
  const obj = record(value)
  const keys = [
    'title',
    'introduction',
    'tags',
    'sellingPoints',
    'promiseAlignment',
    'openingAlignment',
    'samenessRisks',
  ] as const
  exactKeys(obj, keys)
  return {
    title: nonEmptyString(obj, 'title'),
    introduction: nonEmptyString(obj, 'introduction'),
    tags: stringArray(obj, 'tags'),
    sellingPoints: stringArray(obj, 'sellingPoints'),
    promiseAlignment: nonEmptyString(obj, 'promiseAlignment'),
    openingAlignment: nonEmptyString(obj, 'openingAlignment'),
    samenessRisks: stringArray(obj, 'samenessRisks'),
  }
}

function validateOpeningBlueprint(value: unknown): JsonValue {
  const obj = record(value)
  const keys = [
    'corePromise',
    'incitingEvent',
    'protagonistPredicament',
    'firstPayoff',
    'firstMajorQuestion',
    'chapterIntents',
    'firstArcMilestones',
  ] as const
  exactKeys(obj, keys)

  const rawIntents = obj.chapterIntents
  if (!Array.isArray(rawIntents) || rawIntents.length !== 3) {
    fail('artifact.chapterIntents must contain exactly three chapter intents')
  }
  const intents = rawIntents.map((raw, index) => {
    const intent = record(raw, `artifact.chapterIntents[${index}]`)
    const intentKeys = [
      'chapter',
      'purpose',
      'readerExpectation',
      'emotionTarget',
      'goal',
      'conflict',
      'payoff',
      'hook',
    ] as const
    exactKeys(intent, intentKeys, `artifact.chapterIntents[${index}]`)
    const chapter = intent.chapter
    if (!Number.isInteger(chapter) || chapter !== index + 1) {
      fail(`artifact.chapterIntents[${index}].chapter must equal ${index + 1}`)
    }
    return {
      chapter,
      purpose: nonEmptyString(intent, 'purpose', `artifact.chapterIntents[${index}]`),
      readerExpectation: nonEmptyString(intent, 'readerExpectation', `artifact.chapterIntents[${index}]`),
      emotionTarget: nonEmptyString(intent, 'emotionTarget', `artifact.chapterIntents[${index}]`),
      goal: nonEmptyString(intent, 'goal', `artifact.chapterIntents[${index}]`),
      conflict: nonEmptyString(intent, 'conflict', `artifact.chapterIntents[${index}]`),
      payoff: nonEmptyString(intent, 'payoff', `artifact.chapterIntents[${index}]`),
      hook: nonEmptyString(intent, 'hook', `artifact.chapterIntents[${index}]`),
    }
  })

  return {
    corePromise: nonEmptyString(obj, 'corePromise'),
    incitingEvent: nonEmptyString(obj, 'incitingEvent'),
    protagonistPredicament: nonEmptyString(obj, 'protagonistPredicament'),
    firstPayoff: nonEmptyString(obj, 'firstPayoff'),
    firstMajorQuestion: nonEmptyString(obj, 'firstMajorQuestion'),
    chapterIntents: intents,
    firstArcMilestones: stringArray(obj, 'firstArcMilestones'),
  }
}

export function isStartBookStage(stage: string): stage is StartBookStage {
  return (START_BOOK_STAGES as readonly string[]).includes(stage)
}

export function guidanceForStartBookStage(stage: StartBookStage): string {
  return STAGE_GUIDANCE[stage]
}

export function validateStartBookArtifact(
  stage: StartBookStage,
  value: unknown,
): JsonValue {
  if (stage === 'idea') return validateIdea(value)
  if (stage === 'direction') return validateDirection(value)
  if (stage === 'positioning') return validatePositioning(value)
  if (stage === 'story_engine') return validateStoryEngine(value)
  if (stage === 'packaging') return validatePackaging(value)
  return validateOpeningBlueprint(value)
}

export function parseStartBookArtifact(
  stage: StartBookStage,
  modelText: string,
): JsonValue {
  const trimmed = modelText.trim()
  if (!trimmed) fail('model output is empty')

  const withoutFence = trimmed
    .replace(/^\`\`\`(?:json)?\s*/i, '')
    .replace(/\s*\`\`\`$/, '')

  let parsed: unknown
  try {
    parsed = JSON.parse(withoutFence)
  } catch {
    const start = withoutFence.indexOf('{')
    const end = withoutFence.lastIndexOf('}')
    if (start < 0 || end <= start) {
      fail('model output does not contain a JSON object')
    }
    try {
      parsed = JSON.parse(withoutFence.slice(start, end + 1))
    } catch {
      fail('model output contains invalid JSON')
    }
  }
  return validateStartBookArtifact(stage, parsed)
}

export function buildStartBookContext(snapshot: ProjectSnapshot): JsonValue {
  const activeArtifacts: Record<string, JsonValue> = {}
  for (const [type, artifactId] of Object.entries(snapshot.project.activeArtifactRefs)) {
    if (!artifactId) continue
    const artifact = snapshot.project.artifacts.find((item) => item.id === artifactId)
    if (artifact) activeArtifacts[type] = artifact.value
  }

  return {
    project: {
      id: snapshot.project.id,
      title: snapshot.project.title,
      ...(snapshot.project.genre ? { genre: snapshot.project.genre } : {}),
      ...(snapshot.project.platformTarget
        ? { platformTarget: snapshot.project.platformTarget }
        : {}),
      revision: snapshot.project.revision,
      currentStage: snapshot.project.lifecycle.currentStage,
    },
    acceptedArtifacts: activeArtifacts,
  }
}

export function startBookSourceRefs(snapshot: ProjectSnapshot): string[] {
  return Object.values(snapshot.project.activeArtifactRefs)
    .filter((value): value is string => typeof value === 'string')
}
