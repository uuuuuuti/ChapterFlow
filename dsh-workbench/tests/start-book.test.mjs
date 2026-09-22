import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  buildStartBookContext,
  parseStartBookArtifact,
  validateStartBookArtifact,
} from '../packages/start-book/dist/index.js'
import { LocalProjectStore } from '../packages/project-store/dist/index.js'
import {
  START_BOOK_WORKFLOW_SCRIPT,
  runStartBookWorkflow,
} from '../packages/harness-adapter/dist/index.js'

const IDEA = {
  premise: '普通银行职员能看到别人未来 24 小时内的一次重大财务决定。',
  protagonist: '谨慎克制的基层银行职员',
  disruption: '他第一次看见客户即将做出会毁掉家庭的投资决定。',
  coreHook: '每次预见都逼他在职业边界与救人之间做选择。',
  stakes: '干预可能救人，也可能暴露能力并摧毁自己的职业与生活。',
}

const DIRECTION = {
  genre: '都市',
  subGenre: ['都市异能', '悬疑'],
  protagonistPath: '从只想自保的普通职员成长为主动承担代价的决策干预者。',
  coreConflict: '主角知道风险，却无法证明未来，且每次干预都会制造新的利益冲突。',
  emotionalTone: '现实压迫感中的连续反转与克制爽感',
  serializationPotential: '每个重大财务决定形成单元事件，同时逐步推进能力来源和长期对手。',
  differentiation: '能力聚焦重大财务决定，不是泛化预知；职业规则天然制造行动限制。',
  boundaries: ['不把金融知识写成教程', '不靠无代价全知解决冲突'],
}

function fakeEngineFor(finalArtifact, critique = '结构成立，但要继续强化具体冲突。') {
  return {
    start(request) {
      return {
        id: 'wf-start-book-1',
        meta: request.meta,
        result: Promise.resolve({
          value: {
            stage: request.args.stage,
            draft: JSON.stringify(finalArtifact),
            critique,
            finalArtifact: JSON.stringify(finalArtifact),
          },
          stopReason: 'completed',
          agentsStarted: 3,
        }),
        cancel() {},
        async dispose() {},
      }
    },
  }
}

test('StartBook validators keep stage artifacts deterministic and reject extra fields', () => {
  assert.deepEqual(validateStartBookArtifact('idea', IDEA), IDEA)
  assert.throws(
    () => validateStartBookArtifact('idea', { ...IDEA, signingProbability: 0.92 }),
    /unsupported field signingProbability/,
  )
})

test('StartBook parser accepts fenced JSON but still enforces the artifact contract', () => {
  const parsed = parseStartBookArtifact(
    'direction',
    '~~~json\n' + JSON.stringify(DIRECTION) + '\n~~~',
  )
  assert.deepEqual(parsed, DIRECTION)
})

test('opening blueprint requires exactly three ordered chapter intents', () => {
  assert.throws(
    () => validateStartBookArtifact('opening_blueprint', {
      corePromise: 'promise',
      incitingEvent: 'event',
      protagonistPredicament: 'predicament',
      firstPayoff: 'payoff',
      firstMajorQuestion: 'question',
      chapterIntents: [],
      firstArcMilestones: ['m1'],
    }),
    /exactly three chapter intents/,
  )
})

test('StartBook context exposes accepted artifacts but not rejected candidate payloads', async () => {
  const root = await mkdtemp(join(tmpdir(), 'chapterflow-start-book-'))
  try {
    const store = new LocalProjectStore({ rootDir: root })
    const created = await store.createProject({ title: 'Context Test' })

    const idea = await store.stageCandidate(created.project.id, {
      kind: 'book_artifact',
      payload: { artifactType: 'idea', value: IDEA },
      summary: 'idea',
    })
    await store.acceptCandidate(created.project.id, idea.id)

    const rejected = await store.stageCandidate(created.project.id, {
      kind: 'project_metadata',
      payload: { title: 'Rejected Title' },
      summary: 'rejected metadata',
    })
    await store.rejectCandidate(created.project.id, rejected.id)

    const context = buildStartBookContext(await store.getSnapshot(created.project.id))
    assert.equal(context.project.currentStage, 'direction')
    assert.deepEqual(context.acceptedArtifacts.idea, IDEA)
    assert.equal(JSON.stringify(context).includes('Rejected Title'), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('StartBook workflow stages one current-stage candidate without auto-accepting it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'chapterflow-start-book-'))
  try {
    const store = new LocalProjectStore({ rootDir: root })
    const created = await store.createProject({ title: 'StartBook Test', genre: '都市' })

    const result = await runStartBookWorkflow(
      store,
      fakeEngineFor(IDEA),
      { id: 'parent-agent' },
      new AbortController().signal,
      created.project.id,
      IDEA.premise,
    )

    assert.equal(result.stage, 'idea')
    assert.equal(result.agentsStarted, 3)
    assert.equal(result.requiresAcceptance, true)
    assert.equal(result.candidate.status, 'staged')
    assert.equal(result.candidate.baseProjectRevision, 0)
    assert.equal(result.candidate.sourceRun, 'wf-start-book-1')
    assert.match(START_BOOK_WORKFLOW_SCRIPT, /start-book-critic/)

    const snapshot = await store.getSnapshot(created.project.id)
    assert.equal(snapshot.project.revision, 0)
    assert.equal(snapshot.project.lifecycle.currentStage, 'idea')
    assert.equal(snapshot.candidates.length, 1)

    await store.acceptCandidate(created.project.id, result.candidate.id)
    const afterAccept = await store.getSnapshot(created.project.id)
    assert.equal(afterAccept.project.revision, 1)
    assert.equal(afterAccept.project.lifecycle.currentStage, 'direction')

    const direction = await runStartBookWorkflow(
      store,
      fakeEngineFor(DIRECTION),
      { id: 'parent-agent' },
      new AbortController().signal,
      created.project.id,
    )
    assert.equal(direction.stage, 'direction')
    assert.equal(direction.candidate.baseProjectRevision, 1)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('StartBook refuses to stage model output when project revision changed during workflow', async () => {
  const root = await mkdtemp(join(tmpdir(), 'chapterflow-start-book-'))
  try {
    const store = new LocalProjectStore({ rootDir: root })
    const created = await store.createProject({ title: 'Conflict Test' })

    const engine = {
      start(request) {
        return {
          id: 'wf-conflict',
          meta: request.meta,
          result: (async () => {
            const metadata = await store.stageCandidate(created.project.id, {
              kind: 'project_metadata',
              payload: { genre: '悬疑' },
              summary: 'concurrent mutation',
            })
            await store.acceptCandidate(created.project.id, metadata.id)
            return {
              value: {
                finalArtifact: JSON.stringify(IDEA),
                critique: 'ok',
              },
              stopReason: 'completed',
              agentsStarted: 3,
            }
          })(),
          cancel() {},
          async dispose() {},
        }
      },
    }

    await assert.rejects(
      runStartBookWorkflow(
        store,
        engine,
        { id: 'parent-agent' },
        new AbortController().signal,
        created.project.id,
        IDEA.premise,
      ),
      /changed from revision 0 to 1/,
    )

    const snapshot = await store.getSnapshot(created.project.id)
    assert.equal(snapshot.project.revision, 1)
    assert.equal(snapshot.candidates.filter((candidate) => candidate.kind === 'book_artifact').length, 0)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
