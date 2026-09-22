import assert from 'node:assert/strict'
import test from 'node:test'

import {
  SPIKE_WORKFLOW_META,
  SPIKE_WORKFLOW_SCRIPT,
  apply,
  getAdapterStatus,
  runSpikeWorkflow,
} from '../packages/harness-adapter/dist/index.js'

test('adapter status exposes spike and domain-core capabilities', () => {
  const status = getAdapterStatus()
  assert.equal(status.ready, true)
  assert.equal(status.boundary, 'harness-adapter')
  assert.equal(status.domainCoreVersion, '0.1.0')
  assert.deepEqual(status.capabilities, [
    'tool-registration',
    'workflow-engine',
    'subagent-delegation',
    'client-slot',
    'domain-core',
    'project-store',
    'candidate-first',
    'project-revision',
    'start-book-workflow',
    'context-compiler',
    'chapter-writing-workflow',
  ])
})

test('adapter registers spike plus bounded ChapterFlow domain tools', () => {
  const tools = []
  apply({
    tools: {
      register(tool) {
        tools.push(tool)
      },
    },
    workflowEngine: {},
  })
  assert.deepEqual(
    tools.map((tool) => tool.name),
    [
      'chapterflow_adapter_status',
      'chapterflow_workflow_spike',
      'chapterflow_book_create',
      'chapterflow_book_get_state',
      'chapterflow_book_get_next_action',
      'chapterflow_start_book',
      'chapterflow_chapter_get',
      'chapterflow_context_compile',
      'chapterflow_write_chapter',
      'chapterflow_candidate_stage',
      'chapterflow_candidate_accept',
      'chapterflow_candidate_reject',
    ],
  )
})

test('workflow bridge owns start/result/dispose and keeps the parent identity', async () => {
  let request
  let disposed = false
  const parent = { id: 'parent-agent' }
  const controller = new AbortController()

  const engine = {
    start(input) {
      request = input
      return {
        id: 'workflow-spike-1',
        meta: SPIKE_WORKFLOW_META,
        result: Promise.resolve({
          value: { ok: true, child: 'CHAPTERFLOW_SPIKE_OK: test' },
          stopReason: 'completed',
          agentsStarted: 1,
        }),
        cancel() {},
        async dispose() {
          disposed = true
        },
      }
    },
  }

  const value = await runSpikeWorkflow(
    engine,
    parent,
    controller.signal,
    'adapter integration',
  )

  assert.equal(value.runId, 'workflow-spike-1')
  assert.equal(value.agentsStarted, 1)
  assert.equal(disposed, true)
  assert.equal(request.parent, parent)
  assert.equal(request.args.topic, 'adapter integration')
  assert.equal(request.meta.name, 'chapterflow-adapter-spike')
  assert.match(request.script, /await agent\(/)
  assert.match(SPIKE_WORKFLOW_SCRIPT, /specialist-check/)
})

test('workflow bridge disposes failed runs and never reports partial output as success', async () => {
  let disposed = false
  const engine = {
    start() {
      return {
        id: 'workflow-spike-failed',
        meta: SPIKE_WORKFLOW_META,
        result: Promise.resolve({
          value: { partial: true },
          stopReason: 'error',
          error: 'synthetic failure',
          agentsStarted: 1,
        }),
        cancel() {},
        async dispose() {
          disposed = true
        },
      }
    },
  }

  await assert.rejects(
    runSpikeWorkflow(
      engine,
      { id: 'parent-agent' },
      new AbortController().signal,
      'failure path',
    ),
    /synthetic failure/,
  )
  assert.equal(disposed, true)
})
