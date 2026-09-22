import type {
  WorkflowEngine,
  WorkflowMeta,
  WorkflowResult,
  WorkflowStartRequest,
} from '@deepseek-ai/dsh-workflow'
import type { JsonValue as HarnessJsonValue } from '@deepseek-ai/dsh-util-values'
import { nextPendingChapter, type Candidate } from '@chapterflow/domain-core'
import { LocalProjectStore } from '@chapterflow/project-store'
import {
  compileChapterContext,
  contextSourceRefs,
  type ChapterContextPacket,
} from '@chapterflow/context-compiler'
import {
  CHAPTER_DRAFT_GUIDANCE,
  parseGeneratedChapterDraft,
} from '@chapterflow/chapter-writing'

export const WRITE_CHAPTER_WORKFLOW_META: WorkflowMeta = {
  name: 'chapterflow-write-chapter',
  description: 'Generate one reviewable chapter draft from committed ChapterFlow context.',
  whenToUse: 'Use for the next unaccepted chapter while lifecycle stage is first_3_chapters.',
  phases: [
    { title: 'draft', detail: 'A chapter writer produces the first prose draft.' },
    { title: 'review', detail: 'An editor audits continuity, pacing, intent delivery, and AI voice risk.' },
    { title: 'rewrite', detail: 'A rewriter produces the final reviewable chapter draft.' },
  ],
}

export const WRITE_CHAPTER_WORKFLOW_SCRIPT = [
  "phase('draft')",
  'const draft = await agent(',
  '  [',
  "    'You are the ChapterFlow chapter writer for a Chinese serialized web novel.',",
  "    'Write the complete next chapter from the committed CONTEXT PACKET.',",
  "    'The Chapter Intent is binding for purpose, conflict, payoff, and ending hook.',",
  "    'Preserve every committed upstream fact. Never add editorial explanation or platform claims.',",
  "    'AUTHOR NOTE:\\n' + String(args.userBrief ?? ''),",
  "    'CONTEXT PACKET:\\n' + String(args.contextJson ?? '{}'),",
  "    'OUTPUT CONTRACT:\\n' + String(args.outputGuidance ?? ''),",
  "    'Return ONLY the JSON object.'",
  "  ].join('\\n\\n'),",
  "  { label: 'chapter-writer', phase: 'draft' }",
  ')',
  '',
  "phase('review')",
  'const review = await agent(',
  '  [',
  "    'You are a strict serialized-fiction editor.',",
  "    'Review the draft against the committed context and Chapter Intent.',",
  "    'Check continuity, scene causality, pacing, information load, character motivation,',",
  "    'reader expectation, planned payoff, ending hook, repetition, and generic AI voice.',",
  "    'Do not rewrite the chapter. Return concise actionable revision notes.',",
  "    'CONTEXT PACKET:\\n' + String(args.contextJson ?? '{}'),",
  "    'DRAFT:\\n' + String(draft ?? '')",
  "  ].join('\\n\\n'),",
  "  { label: 'chapter-editor', phase: 'review' }",
  ')',
  '',
  "phase('rewrite')",
  'const finalDraft = await agent(',
  '  [',
  "    'You are the ChapterFlow final chapter rewriter.',",
  "    'Rewrite the draft using the editor notes while preserving all committed facts and the Chapter Intent.',",
  "    'Return a complete chapter, not analysis or an outline.',",
  "    'CONTEXT PACKET:\\n' + String(args.contextJson ?? '{}'),",
  "    'DRAFT:\\n' + String(draft ?? ''),",
  "    'EDITOR NOTES:\\n' + String(review ?? ''),",
  "    'OUTPUT CONTRACT:\\n' + String(args.outputGuidance ?? ''),",
  "    'Return ONLY the JSON object.'",
  "  ].join('\\n\\n'),",
  "  { label: 'chapter-rewriter', phase: 'rewrite' }",
  ')',
  '',
  'return {',
  '  chapterIndex: Number(args.chapterIndex),',
  '  draft,',
  '  review,',
  '  finalDraft',
  '}',
].join('\n')

export interface WriteChapterRunResult {
  projectId: string
  projectRevision: number
  chapterIndex: number
  workflowRunId: string
  agentsStarted: number
  candidate: Candidate
  review: string
  effectiveCharacters: number
  contextManifest: ChapterContextPacket['manifest']
  requiresAcceptance: true
  nextAction: string
}

function workflowFailure(result: WorkflowResult): Error | undefined {
  if (result.stopReason === 'completed') return undefined
  if (result.stopReason === 'cancelled') {
    return new Error(
      'WriteChapter workflow was cancelled' + (result.error ? ': ' + result.error : ''),
    )
  }
  return new Error(
    'WriteChapter workflow failed: ' + (result.error ?? 'unknown workflow error'),
  )
}

function workflowOutput(value: unknown): { finalDraft: string; review: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('WriteChapter workflow returned an invalid result object')
  }
  const record = value as Record<string, unknown>
  if (typeof record.finalDraft !== 'string' || !record.finalDraft.trim()) {
    throw new Error('WriteChapter workflow did not return a final draft')
  }
  return {
    finalDraft: record.finalDraft,
    review: typeof record.review === 'string' ? record.review : '',
  }
}

async function prepareContext(
  store: LocalProjectStore,
  projectId: string,
  requestedChapterIndex?: number,
): Promise<{ packet: ChapterContextPacket; chapterIndex: number }> {
  const snapshot = await store.getSnapshot(projectId)
  if (snapshot.project.lifecycle.currentStage !== 'first_3_chapters') {
    throw new Error(
      'WriteChapter requires lifecycle stage first_3_chapters; current stage is '
      + snapshot.project.lifecycle.currentStage,
    )
  }

  const pending = nextPendingChapter(snapshot.project)
  if (!pending) throw new Error('No pending opening chapter remains')
  const chapterIndex = requestedChapterIndex ?? pending.index
  if (chapterIndex !== pending.index) {
    throw new Error(
      'Chapter ' + chapterIndex + ' cannot be written before chapter ' + pending.index,
    )
  }

  let previousChapterContent: string | undefined
  if (chapterIndex > 1) {
    const previous = snapshot.project.chapters.find(
      (item) => item.index === chapterIndex - 1,
    )
    if (!previous?.acceptedDraftVersion) {
      throw new Error('Previous chapter ' + (chapterIndex - 1) + ' is not accepted')
    }
    if (previous.settledDraftVersion !== previous.acceptedDraftVersion) {
      throw new Error(
        'Previous chapter '
        + (chapterIndex - 1)
        + ' must be settled before writing chapter '
        + chapterIndex,
      )
    }

    const handoff = snapshot.project.storyMemory.latestHandoff
    const canUseHandoff = handoff?.chapterIndex === previous.index
      && handoff.chapterVersionId === previous.acceptedDraftVersion

    if (!canUseHandoff) {
      previousChapterContent = await store.getAcceptedChapterContent(
        projectId,
        chapterIndex - 1,
      )
    }
  }

  return {
    chapterIndex,
    packet: compileChapterContext(snapshot, chapterIndex, previousChapterContent),
  }
}

export async function compileProjectChapterContext(
  store: LocalProjectStore,
  projectId: string,
  chapterIndex?: number,
): Promise<ChapterContextPacket> {
  return (await prepareContext(store, projectId, chapterIndex)).packet
}

export function toWriteChapterHarnessJson(value: WriteChapterRunResult): HarnessJsonValue {
  return JSON.parse(JSON.stringify(value)) as HarnessJsonValue
}

export async function runWriteChapterWorkflow(
  store: LocalProjectStore,
  engine: WorkflowEngine,
  parent: WorkflowStartRequest['parent'],
  signal: AbortSignal,
  projectId: string,
  requestedChapterIndex?: number,
  userBrief?: string,
): Promise<WriteChapterRunResult> {
  const { packet, chapterIndex } = await prepareContext(
    store,
    projectId,
    requestedChapterIndex,
  )

  const run = engine.start({
    script: WRITE_CHAPTER_WORKFLOW_SCRIPT,
    meta: WRITE_CHAPTER_WORKFLOW_META,
    args: {
      chapterIndex,
      userBrief: userBrief?.trim() ?? '',
      contextJson: JSON.stringify(packet),
      outputGuidance: CHAPTER_DRAFT_GUIDANCE,
    },
    parent,
    signal,
  })

  const onAbort = (): void => {
    run.cancel('chapterflow parent turn aborted')
  }
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
  const generated = workflowOutput(result.value)
  const draft = parseGeneratedChapterDraft(generated.finalDraft)

  const candidate = await store.stageCandidate(
    projectId,
    {
      kind: 'chapter_draft',
      payload: {
        chapterIndex,
        title: draft.title,
        content: draft.content,
      },
      summary: 'Chapter ' + chapterIndex + ' draft generated by writer/editor/rewrite workflow',
      sourceRun: run.id,
      sourceRefs: contextSourceRefs(packet),
    },
    { expectedProjectRevision: packet.bookRevision },
  )

  return {
    projectId,
    projectRevision: packet.bookRevision,
    chapterIndex,
    workflowRunId: run.id,
    agentsStarted: result.agentsStarted,
    candidate,
    review: generated.review,
    effectiveCharacters: draft.effectiveCharacters,
    contextManifest: packet.manifest,
    requiresAcceptance: true,
    nextAction:
      'Review the chapter draft with the user. Accept or reject the candidate explicitly before writing the next chapter.',
  }
}