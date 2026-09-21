import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {
  WorkflowEngine,
  WorkflowResult,
  WorkflowStartRequest,
} from '@deepseek-ai/dsh-workflow'

export const name = 'chapterflow-harness-adapter'
export const inject = ['tools', 'workflowEngine']

export const SPIKE_VERSION = '0.1.0'
export const SPIKE_WORKFLOW_META = {
  name: 'chapterflow-adapter-spike',
  description: 'Validate ChapterFlow workflow orchestration through DeepSeek Harness.',
  whenToUse: 'Only for the ChapterFlow Harness integration smoke test.',
  phases: [
    {
      title: 'specialist-check',
      detail: 'Run one bounded specialist child and return its handoff.',
    },
  ],
} as const

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
  readonly ready: true
  readonly spikeVersion: string
  readonly boundary: 'harness-adapter'
  readonly capabilities: readonly string[]
}

export interface ChapterFlowSpikeRunResult {
  readonly runId: string
  readonly agentsStarted: number
  readonly result: unknown
}

export function getAdapterStatus(): ChapterFlowAdapterStatus {
  return {
    ready: true,
    spikeVersion: SPIKE_VERSION,
    boundary: 'harness-adapter',
    capabilities: [
      'tool-registration',
      'workflow-engine',
      'subagent-delegation',
      'client-slot',
    ],
  }
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
      result: result.value,
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
      boundary: { type: 'string', required: true },
      capabilities: {
        type: 'array',
        required: true,
        items: { type: 'string' },
      },
    },
  },
  render: (_args: unknown, value: ChapterFlowAdapterStatus) => [
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
  render: (_args: unknown, value: ChapterFlowSpikeRunResult) => [
    { type: 'text' as const, text: JSON.stringify(value, null, 2) },
  ],
} as const

export function apply(ctx: Context): void {
  ctx.tools.register(
    defineTool({
      name: 'chapterflow_adapter_status',
      description:
        'Read the ChapterFlow DeepSeek Harness adapter spike status. This is diagnostic and does not modify a book.',
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
}
