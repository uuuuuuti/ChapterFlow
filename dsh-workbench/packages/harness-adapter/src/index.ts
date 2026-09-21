import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {
  WorkflowEngine,
  WorkflowMeta,
  WorkflowResult,
  WorkflowStartRequest,
} from '@deepseek-ai/dsh-workflow'
import type { JsonValue as HarnessJsonValue } from '@deepseek-ai/dsh-util-values'
import type { CandidateKind, JsonValue as DomainJsonValue } from '@chapterflow/domain-core'
import { LocalProjectStore } from '@chapterflow/project-store'

export const name = 'chapterflow-harness-adapter'
export const inject = ['tools', 'workflowEngine']

export const SPIKE_VERSION = '0.1.0'
export const DOMAIN_CORE_VERSION = '0.1.0'

export const SPIKE_WORKFLOW_META: WorkflowMeta = {
  name: 'chapterflow-adapter-spike',
  description: 'Validate ChapterFlow workflow orchestration through DeepSeek Harness.',
  whenToUse: 'Only for the ChapterFlow Harness integration smoke test.',
  phases: [
    {
      title: 'specialist-check',
      detail: 'Run one bounded specialist child and return its handoff.',
    },
  ],
}

export const SPIKE_WORKFLOW_SCRIPT = `
phase('specialist-check')
log('ChapterFlow adapter is delegating one bounded specialist task.')
const child = await agent(
  'You are a ChapterFlow architecture specialist. Read the task topic and return one concise sentence prefixed with CHAPTERFLOW_SPIKE_OK:. Topic: ' + String(args.topic ?? 'adapter integration'),
  { label: 'chapterflow-specialist', phase: 'specialist-check' }
)
return {
  ok: child !== null,
  child,
  topic: String(args.topic ?? 'adapter integration')
}
`.trim()

export interface ChapterFlowAdapterStatus {
  ready: boolean
  spikeVersion: string
  domainCoreVersion: string
  boundary: string
  capabilities: string[]
}

export interface ChapterFlowSpikeRunResult {
  runId: string
  agentsStarted: number
  result: HarnessJsonValue
}

export function getAdapterStatus(): ChapterFlowAdapterStatus {
  return {
    ready: true,
    spikeVersion: SPIKE_VERSION,
    domainCoreVersion: DOMAIN_CORE_VERSION,
    boundary: 'harness-adapter',
    capabilities: [
      'tool-registration',
      'workflow-engine',
      'subagent-delegation',
      'client-slot',
      'domain-core',
      'project-store',
      'candidate-first',
      'project-revision',
    ],
  }
}

function toHarnessJson(value: unknown): HarnessJsonValue {
  return JSON.parse(JSON.stringify(value)) as HarnessJsonValue
}

function workflowFailure(result: WorkflowResult): Error | undefined {
  if (result.stopReason === 'completed') return undefined
  if (result.stopReason === 'cancelled') {
    return new Error(
      `ChapterFlow spike workflow was cancelled${result.error ? `: ${result.error}` : ''}`,
    )
  }
  return new Error(
    `ChapterFlow spike workflow failed: ${result.error ?? 'unknown workflow error'}`,
  )
}

export async function runSpikeWorkflow(
  engine: WorkflowEngine,
  parent: WorkflowStartRequest['parent'],
  signal: AbortSignal,
  topic: string,
): Promise<ChapterFlowSpikeRunResult> {
  const run = engine.start({
    script: SPIKE_WORKFLOW_SCRIPT,
    meta: SPIKE_WORKFLOW_META,
    args: { topic },
    parent,
    signal,
  })

  const onAbort = (): void => {
    run.cancel('chapterflow parent turn aborted')
  }
  signal.addEventListener('abort', onAbort, { once: true })

  try {
    const result = await run.result
    const failure = workflowFailure(result)
    if (failure) throw failure
    return {
      runId: run.id,
      agentsStarted: result.agentsStarted,
      result: result.value as HarnessJsonValue,
    }
  } finally {
    signal.removeEventListener('abort', onAbort)
    await run.dispose()
  }
}

const STATUS_OUTPUT = {
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      ready: { type: 'boolean', required: true },
      spikeVersion: { type: 'string', required: true },
      domainCoreVersion: { type: 'string', required: true },
      boundary: { type: 'string', required: true },
      capabilities: {
        type: 'array',
        required: true,
        items: { type: 'string' },
      },
    },
  },
  render: (_args: {}, value: ChapterFlowAdapterStatus) => [
    { type: 'text' as const, text: JSON.stringify(value, null, 2) },
  ],
} as const

const WORKFLOW_OUTPUT = {
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      runId: { type: 'string', required: true },
      agentsStarted: { type: 'integer', required: true },
      result: { type: 'json', required: true },
    },
  },
  render: (_args: { topic: string }, value: ChapterFlowSpikeRunResult) => [
    { type: 'text' as const, text: JSON.stringify(value, null, 2) },
  ],
} as const

const JSON_RESULT_OUTPUT = {
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      value: { type: 'json', required: true },
    },
  },
  render: (_args: unknown, value: { value: HarnessJsonValue }) => [
    { type: 'text' as const, text: JSON.stringify(value.value, null, 2) },
  ],
} as const

const NEXT_ACTION_OUTPUT = {
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      projectId: { type: 'string', required: true },
      revision: { type: 'integer', required: true },
      currentStage: { type: 'string', required: true },
      nextAction: { type: 'string', required: true },
      blockers: {
        type: 'array',
        required: true,
        items: { type: 'string' },
      },
    },
  },
  render: (
    _args: { projectId: string },
    value: {
      projectId: string
      revision: number
      currentStage: string
      nextAction: string
      blockers: string[]
    },
  ) => [
    { type: 'text' as const, text: JSON.stringify(value, null, 2) },
  ],
} as const

function parseCandidateKind(value: string): CandidateKind {
  if (value === 'book_artifact' || value === 'project_metadata') return value
  throw new Error(
    'candidate kind must be "book_artifact" or "project_metadata"',
  )
}

export function apply(ctx: Context): void {
  const store = new LocalProjectStore()

  ctx.tools.register(
    defineTool({
      name: 'chapterflow_adapter_status',
      description:
        'Read the ChapterFlow DeepSeek Harness adapter status. This is diagnostic and does not modify a book.',
      parameters: {},
      output: STATUS_OUTPUT,
      execute() {
        return Promise.resolve(getAdapterStatus())
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'chapterflow_workflow_spike',
      description:
        'Run the bounded ChapterFlow adapter spike workflow. It delegates exactly one diagnostic task through the Harness workflow engine and returns the child handoff.',
      parameters: {
        topic: {
          type: 'string',
          required: true,
          description: 'Short diagnostic topic for the specialist child.',
        },
      },
      output: WORKFLOW_OUTPUT,
      async execute(args, exec) {
        if (!exec.agent) {
          throw new Error(
            'chapterflow_workflow_spike requires a model-driven Harness agent call',
          )
        }
        return runSpikeWorkflow(
          ctx.workflowEngine,
          exec.agent,
          exec.signal,
          args.topic,
        )
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'chapterflow_book_create',
      description:
        'Create a persistent ChapterFlow book project. Creation establishes project identity and metadata only; story artifacts still require candidates.',
      parameters: {
        title: {
          type: 'string',
          required: true,
          description: 'Book working title.',
        },
        genre: {
          type: 'string',
          description: 'Optional genre label.',
        },
        platformTarget: {
          type: 'string',
          description: 'Optional target platform, for example fanqie.',
        },
      },
      output: JSON_RESULT_OUTPUT,
      async execute(args) {
        const snapshot = await store.createProject({
          title: args.title,
          ...(args.genre ? { genre: args.genre } : {}),
          ...(args.platformTarget ? { platformTarget: args.platformTarget } : {}),
        })
        return { value: toHarnessJson(snapshot) }
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'chapterflow_book_get_state',
      description:
        'Read the committed ChapterFlow project snapshot, including lifecycle, accepted artifacts, revision, and candidate history.',
      parameters: {
        projectId: {
          type: 'string',
          required: true,
          description: 'ChapterFlow book project id.',
        },
      },
      output: JSON_RESULT_OUTPUT,
      async execute(args) {
        return { value: toHarnessJson(await store.getSnapshot(args.projectId)) }
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'chapterflow_book_get_next_action',
      description:
        'Read the deterministic next lifecycle action for a ChapterFlow project. This does not ask an LLM to infer project state.',
      parameters: {
        projectId: {
          type: 'string',
          required: true,
          description: 'ChapterFlow book project id.',
        },
      },
      output: NEXT_ACTION_OUTPUT,
      async execute(args) {
        return store.getNextAction(args.projectId)
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'chapterflow_candidate_stage',
      description:
        'Stage a reviewable ChapterFlow candidate against the current project revision. Allowed kinds are book_artifact and project_metadata. Staging never changes committed project facts.',
      parameters: {
        projectId: {
          type: 'string',
          required: true,
          description: 'ChapterFlow book project id.',
        },
        kind: {
          type: 'string',
          required: true,
          description: 'book_artifact or project_metadata.',
        },
        payload: {
          type: 'json',
          required: true,
          description:
            'For book_artifact: {artifactType,value}. For project_metadata: any of {title,genre,platformTarget}.',
        },
        summary: {
          type: 'string',
          required: true,
          description: 'Human-readable description of the proposed change.',
        },
        sourceRun: {
          type: 'string',
          description: 'Optional workflow or model run reference.',
        },
        sourceRefs: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional provenance references.',
        },
      },
      output: JSON_RESULT_OUTPUT,
      async execute(args) {
        const candidate = await store.stageCandidate(args.projectId, {
          kind: parseCandidateKind(args.kind),
          payload: args.payload as DomainJsonValue,
          summary: args.summary,
          ...(args.sourceRun ? { sourceRun: args.sourceRun } : {}),
          ...(args.sourceRefs ? { sourceRefs: args.sourceRefs } : {}),
        })
        return { value: toHarnessJson(candidate) }
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'chapterflow_candidate_accept',
      description:
        'Accept one staged ChapterFlow candidate. Acceptance is revision-checked; a stale candidate is marked stale and never silently changes committed project state.',
      parameters: {
        projectId: {
          type: 'string',
          required: true,
          description: 'ChapterFlow book project id.',
        },
        candidateId: {
          type: 'string',
          required: true,
          description: 'Staged candidate id.',
        },
      },
      output: JSON_RESULT_OUTPUT,
      async execute(args) {
        const result = await store.acceptCandidate(args.projectId, args.candidateId)
        return { value: toHarnessJson(result) }
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'chapterflow_candidate_reject',
      description:
        'Reject a staged or stale ChapterFlow candidate without changing committed project revision.',
      parameters: {
        projectId: {
          type: 'string',
          required: true,
          description: 'ChapterFlow book project id.',
        },
        candidateId: {
          type: 'string',
          required: true,
          description: 'Candidate id.',
        },
        decisionNote: {
          type: 'string',
          description: 'Optional reason for rejection.',
        },
      },
      output: JSON_RESULT_OUTPUT,
      async execute(args) {
        const candidate = await store.rejectCandidate(
          args.projectId,
          args.candidateId,
          args.decisionNote,
        )
        return { value: toHarnessJson(candidate) }
      },
    }),
  )
}
