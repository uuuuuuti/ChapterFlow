import type {
  WorkflowEngine,
  WorkflowMeta,
  WorkflowResult,
  WorkflowStartRequest,
} from '@deepseek-ai/dsh-workflow'
import type { JsonValue as HarnessJsonValue } from '@deepseek-ai/dsh-util-values'
import {
  parseChapterSettlementPayload,
  type Candidate,
  type ChapterSettlementCandidatePayload,
} from '@chapterflow/domain-core'
import { LocalProjectStore } from '@chapterflow/project-store'

export const SETTLE_CHAPTER_WORKFLOW_META: WorkflowMeta = {
  name: 'chapterflow-settle-chapter',
  description: 'Extract reviewable Story Memory and Reader Memory from one accepted chapter version.',
  whenToUse: 'Run immediately after a chapter draft is accepted and before writing the next chapter.',
  phases: [
    { title: 'extract', detail: 'A continuity analyst extracts durable story and reader-memory changes.' },
    { title: 'verify', detail: 'A memory editor removes unsupported claims and normalizes the final settlement.' },
  ],
}

export const SETTLEMENT_OUTPUT_GUIDANCE = [
  'Return one JSON object with exactly these top-level keys:',
  'chapterIndex, chapterVersionId, summary, characterStates, relationshipEvents, timelineEvents, readerPromiseOperations, handoff.',
  'characterStates: array of {characterKey,name,physicalState?,emotionalState?,location?,knows[],believes[],hides[],possessions[],unresolvedConflicts[]}.',
  'Use stable lowercase ASCII characterKey values such as protagonist or zhang_wei and reuse keys already present in EXISTING MEMORY.',
  'relationshipEvents: only meaningful relationship changes in this chapter; each item {fromCharacterKey,toCharacterKey,type,change,evidence,tension?,trust?,affinity?}.',
  'timelineEvents: only durable plot events; each item {title,summary,storyOrder,characterKeys[],location?}.',
  'readerPromiseOperations: OPEN / ADVANCE / PAYOFF only when supported by chapter evidence.',
  'OPEN requires {action,key,title,description,evidence,note?}; ADVANCE/PAYOFF use an existing open key and require evidence.',
  'handoff: {endingSituation,unresolvedConflicts[],immediateQuestions[],activeCharacterKeys[],nextChapterPressures[],continuityWarnings[]}.',
  'Do not invent facts not present in the accepted chapter or committed context.',
  'Evidence must be concise paraphrase, not long verbatim quotations.',
].join(' ')

export const SETTLE_CHAPTER_WORKFLOW_SCRIPT = [
  "phase('extract')",
  'const extracted = await agent(',
  '  [',
  "    'You are the ChapterFlow continuity and memory analyst.',",
  "    'Extract only durable story state created or changed by this ACCEPTED chapter.',",
  "    'Distinguish story facts from temporary prose texture. Reader promises are reader-facing expectations, not generic plot facts.',",
  "    'CURRENT COMMITTED MEMORY:\\n' + String(args.memoryJson ?? '{}'),",
  "    'ACCEPTED CHAPTER:\\n' + String(args.chapterContent ?? ''),",
  "    'OUTPUT CONTRACT:\\n' + String(args.outputGuidance ?? ''),",
  "    'The output chapterIndex and chapterVersionId must exactly match the supplied values.',",
  "    'chapterIndex=' + String(args.chapterIndex) + '; chapterVersionId=' + String(args.chapterVersionId),",
  "    'Return ONLY the JSON object.'",
  "  ].join('\\n\\n'),",
  "  { label: 'memory-analyst', phase: 'extract' }",
  ')',
  '',
  "phase('verify')",
  'const finalSettlement = await agent(',
  '  [',
  "    'You are the ChapterFlow memory editor.',",
  "    'Audit the proposed settlement against the accepted chapter and existing memory.',",
  "    'Remove unsupported facts, duplicate timeline events, fake relationship changes, and invalid promise operations.',",
  "    'Preserve existing stable character keys. Never PAYOFF or ADVANCE a promise that is not already open or opened earlier in this same settlement.',",
  "    'CURRENT COMMITTED MEMORY:\\n' + String(args.memoryJson ?? '{}'),",
  "    'ACCEPTED CHAPTER:\\n' + String(args.chapterContent ?? ''),",
  "    'PROPOSED SETTLEMENT:\\n' + String(extracted ?? ''),",
  "    'OUTPUT CONTRACT:\\n' + String(args.outputGuidance ?? ''),",
  "    'chapterIndex=' + String(args.chapterIndex) + '; chapterVersionId=' + String(args.chapterVersionId),",
  "    'Return ONLY the corrected JSON object.'",
  "  ].join('\\n\\n'),",
  "  { label: 'memory-editor', phase: 'verify' }",
  ')',
  '',
  'return { extracted, finalSettlement }',
].join('\n')

function parseObject(text: string): unknown {
  const trimmed = text.trim()
    .replace(/^(?:```|~~~)(?:json)?\s*/i, '')
    .replace(/\s*(?:```|~~~)$/, '')
  try {
    return JSON.parse(trimmed)
  } catch {
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start < 0 || end <= start) {
      throw new Error('SettleChapter workflow output does not contain a JSON object')
    }
    return JSON.parse(trimmed.slice(start, end + 1))
  }
}

function workflowFailure(result: WorkflowResult): Error | undefined {
  if (result.stopReason === 'completed') return undefined
  if (result.stopReason === 'cancelled') {
    return new Error(
      'SettleChapter workflow was cancelled' + (result.error ? ': ' + result.error : ''),
    )
  }
  return new Error(
    'SettleChapter workflow failed: ' + (result.error ?? 'unknown workflow error'),
  )
}

function workflowOutput(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('SettleChapter workflow returned an invalid result object')
  }
  const record = value as Record<string, unknown>
  if (typeof record.finalSettlement !== 'string' || !record.finalSettlement.trim()) {
    throw new Error('SettleChapter workflow did not return a final settlement')
  }
  return record.finalSettlement
}

export interface SettleChapterRunResult {
  projectId: string
  projectRevision: number
  chapterIndex: number
  chapterVersionId: string
  workflowRunId: string
  agentsStarted: number
  candidate: Candidate
  preview: ChapterSettlementCandidatePayload
  requiresAcceptance: true
  nextAction: string
}

export function toSettleChapterHarnessJson(
  value: SettleChapterRunResult,
): HarnessJsonValue {
  return JSON.parse(JSON.stringify(value)) as HarnessJsonValue
}

export async function runSettleChapterWorkflow(
  store: LocalProjectStore,
  engine: WorkflowEngine,
  parent: WorkflowStartRequest['parent'],
  signal: AbortSignal,
  projectId: string,
  chapterIndex: number,
): Promise<SettleChapterRunResult> {
  const snapshot = await store.getSnapshot(projectId)
  const chapter = snapshot.project.chapters.find((item) => item.index === chapterIndex)
  if (!chapter?.acceptedDraftVersion) {
    throw new Error('Chapter ' + chapterIndex + ' must be accepted before settlement')
  }
  if (chapter.settledDraftVersion === chapter.acceptedDraftVersion) {
    throw new Error('Chapter ' + chapterIndex + ' accepted version is already settled')
  }
  const version = snapshot.project.chapterVersions.find(
    (item) => item.id === chapter.acceptedDraftVersion,
  )
  if (!version) {
    throw new Error('Accepted chapter version metadata is missing')
  }

  const chapterContent = await store.getAcceptedChapterContent(projectId, chapterIndex)
  const memoryJson = JSON.stringify({
    characterStates: snapshot.project.storyMemory.characterStates,
    relationshipEvents: snapshot.project.storyMemory.relationshipEvents,
    timelineEvents: snapshot.project.storyMemory.timelineEvents,
    readerPromises: snapshot.project.readerMemory.promises,
    previousHandoff: snapshot.project.storyMemory.latestHandoff,
  })

  const run = engine.start({
    script: SETTLE_CHAPTER_WORKFLOW_SCRIPT,
    meta: SETTLE_CHAPTER_WORKFLOW_META,
    args: {
      chapterIndex,
      chapterVersionId: version.id,
      chapterContent,
      memoryJson,
      outputGuidance: SETTLEMENT_OUTPUT_GUIDANCE,
    },
    parent,
    signal,
  })

  const onAbort = (): void => run.cancel('chapterflow parent turn aborted')
  signal.addEventListener('abort', onAbort, { once: true })

  let result: WorkflowResult
  try {
    result = await run.result
  } finally {
    signal.removeEventListener('abort', onAbort)
    await run.dispose()
  }

  const failure = workflowFailure(result)
  if (failure) throw failure

  const parsed = parseChapterSettlementPayload(
    parseObject(workflowOutput(result.value)) as HarnessJsonValue,
  )
  if (
    parsed.chapterIndex !== chapterIndex
    || parsed.chapterVersionId !== version.id
  ) {
    throw new Error('SettleChapter workflow returned a settlement for the wrong chapter version')
  }

  const candidate = await store.stageCandidate(
    projectId,
    {
      kind: 'chapter_settlement',
      payload: parsed as unknown as HarnessJsonValue,
      summary: 'Chapter ' + chapterIndex + ' Story/Reader Memory settlement',
      sourceRun: run.id,
      sourceRefs: [version.id],
    },
    { expectedProjectRevision: snapshot.project.revision },
  )

  return {
    projectId,
    projectRevision: snapshot.project.revision,
    chapterIndex,
    chapterVersionId: version.id,
    workflowRunId: run.id,
    agentsStarted: result.agentsStarted,
    candidate,
    preview: parsed,
    requiresAcceptance: true,
    nextAction:
      'Review the extracted Story Memory, Reader Memory, and handoff. Accept the settlement candidate before writing the next chapter.',
  }
}
