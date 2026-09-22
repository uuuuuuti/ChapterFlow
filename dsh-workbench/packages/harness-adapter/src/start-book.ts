import type {
  WorkflowEngine,
  WorkflowMeta,
  WorkflowResult,
  WorkflowStartRequest,
} from '@deepseek-ai/dsh-workflow'
import type { JsonValue as HarnessJsonValue } from '@deepseek-ai/dsh-util-values'
import type { Candidate } from '@chapterflow/domain-core'
import { LocalProjectStore } from '@chapterflow/project-store'
import {
  buildStartBookContext,
  guidanceForStartBookStage,
  isStartBookStage,
  parseStartBookArtifact,
  startBookSourceRefs,
  type StartBookStage,
} from '@chapterflow/start-book'

export const START_BOOK_WORKFLOW_META: WorkflowMeta = {
  name: 'chapterflow-start-book',
  description:
    'Generate one reviewable artifact for the current ChapterFlow opening lifecycle stage.',
  whenToUse:
    'Use while a book is between idea and opening_blueprint. Run one stage, then wait for candidate acceptance before continuing.',
  phases: [
    { title: 'draft', detail: 'A specialist proposes the current-stage artifact.' },
    {
      title: 'critique',
      detail: 'A second specialist audits the proposal for contradictions and weak web-fiction mechanics.',
    },
    {
      title: 'synthesize',
      detail: 'A lead editor produces the final schema-conformant artifact candidate.',
    },
  ],
}

export const START_BOOK_WORKFLOW_SCRIPT = [
  "phase('draft')",
  'const draft = await agent(',
  '  [',
  "    'You are the ChapterFlow StartBook specialist.',",
  "    'Develop exactly one artifact for lifecycle stage: ' + String(args.stage) + '.',",
  "    'Treat accepted upstream artifacts in CONTEXT as fixed facts. Do not silently rewrite them.',",
  "    'Do not invent platform rules, performance numbers, signing probability, CTR, rankings, or guarantees.',",
  "    'USER BRIEF:\\n' + String(args.userBrief ?? ''),",
  "    'CONTEXT JSON:\\n' + String(args.contextJson ?? '{}'),",
  "    'OUTPUT CONTRACT:\\n' + String(args.schemaGuidance ?? ''),",
  "    'Return ONLY the requested JSON object. No markdown fence and no commentary.'",
  "  ].join('\\n\\n'),",
  "  { label: 'start-book-drafter', phase: 'draft' }",
  ')',
  '',
  "phase('critique')",
  'const critique = await agent(',
  '  [',
  "    'You are a rigorous Chinese serialized web-fiction development editor.',",
  "    'Audit the proposed artifact for continuity with accepted upstream facts, specificity, sustainable conflict,',",
  "    'reader expectation, serializability, repetition risk, generic AI phrasing, and unsupported platform claims.',",
  "    'Lifecycle stage: ' + String(args.stage) + '.',",
  "    'ACCEPTED CONTEXT:\\n' + String(args.contextJson ?? '{}'),",
  "    'DRAFT:\\n' + String(draft ?? ''),",
  "    'Return concise actionable critique. Do not rewrite the artifact.'",
  "  ].join('\\n\\n'),",
  "  { label: 'start-book-critic', phase: 'critique' }",
  ')',
  '',
  "phase('synthesize')",
  'const finalArtifact = await agent(',
  '  [',
  "    'You are the ChapterFlow lead editor.',",
  "    'Produce the final artifact for lifecycle stage: ' + String(args.stage) + '.',",
  "    'Use the draft and critique, but preserve all accepted upstream facts.',",
  "    'Never claim platform guarantees or fictional metrics.',",
  "    'ACCEPTED CONTEXT:\\n' + String(args.contextJson ?? '{}'),",
  "    'DRAFT:\\n' + String(draft ?? ''),",
  "    'CRITIQUE:\\n' + String(critique ?? ''),",
  "    'OUTPUT CONTRACT:\\n' + String(args.schemaGuidance ?? ''),",
  "    'Return ONLY one valid JSON object. No markdown fence and no commentary.'",
  "  ].join('\\n\\n'),",
  "  { label: 'start-book-lead-editor', phase: 'synthesize' }",
  ')',
  '',
  'return {',
  '  stage: String(args.stage),',
  '  draft,',
  '  critique,',
  '  finalArtifact',
  '}',
].join('\n')

export interface StartBookRunResult {
  projectId: string
  projectRevision: number
  stage: StartBookStage
  workflowRunId: string
  agentsStarted: number
  candidate: Candidate
  critique: string
  requiresAcceptance: true
  nextAction: string
}

function workflowFailure(result: WorkflowResult): Error | undefined {
  if (result.stopReason === 'completed') return undefined
  if (result.stopReason === 'cancelled') {
    return new Error(
      'StartBook workflow was cancelled' + (result.error ? ': ' + result.error : ''),
    )
  }
  return new Error(
    'StartBook workflow failed: ' + (result.error ?? 'unknown workflow error'),
  )
}

function workflowOutput(value: unknown): { finalArtifact: string; critique: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('StartBook workflow returned an invalid result object')
  }
  const record = value as Record<string, unknown>
  if (typeof record.finalArtifact !== 'string' || !record.finalArtifact.trim()) {
    throw new Error('StartBook workflow did not return a final artifact')
  }
  return {
    finalArtifact: record.finalArtifact,
    critique: typeof record.critique === 'string' ? record.critique : '',
  }
}

export function toStartBookHarnessJson(value: StartBookRunResult): HarnessJsonValue {
  return JSON.parse(JSON.stringify(value)) as HarnessJsonValue
}

export async function runStartBookWorkflow(
  store: LocalProjectStore,
  engine: WorkflowEngine,
  parent: WorkflowStartRequest['parent'],
  signal: AbortSignal,
  projectId: string,
  userBrief?: string,
): Promise<StartBookRunResult> {
  const snapshot = await store.getSnapshot(projectId)
  const stage = snapshot.project.lifecycle.currentStage

  if (!isStartBookStage(stage)) {
    throw new Error(
      'StartBook is complete for project ' + projectId + '; current lifecycle stage is ' + stage,
    )
  }

  const cleanedBrief = userBrief?.trim() ?? ''
  if (stage === 'idea' && !cleanedBrief) {
    throw new Error(
      'StartBook idea stage requires the user brief or original story idea.',
    )
  }

  const contextJson = JSON.stringify(buildStartBookContext(snapshot))
  const run = engine.start({
    script: START_BOOK_WORKFLOW_SCRIPT,
    meta: START_BOOK_WORKFLOW_META,
    args: {
      stage,
      userBrief: cleanedBrief,
      contextJson,
      schemaGuidance: guidanceForStartBookStage(stage),
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
  const artifact = parseStartBookArtifact(stage, generated.finalArtifact)
  const candidate = await store.stageCandidate(
    projectId,
    {
      kind: 'book_artifact',
      payload: { artifactType: stage, value: artifact },
      summary: 'StartBook ' + stage + ' proposal generated by specialist review workflow',
      sourceRun: run.id,
      sourceRefs: startBookSourceRefs(snapshot),
    },
    { expectedProjectRevision: snapshot.project.revision },
  )

  return {
    projectId,
    projectRevision: snapshot.project.revision,
    stage,
    workflowRunId: run.id,
    agentsStarted: result.agentsStarted,
    candidate,
    critique: generated.critique,
    requiresAcceptance: true,
    nextAction:
      'Review this candidate with the user. Accept or reject it explicitly before running StartBook again.',
  }
}