import assert from 'node:assert/strict'
import test from 'node:test'

import {
  acceptCandidate,
  createBookProject,
  rejectCandidate,
  stageCandidate,
} from '../packages/domain-core/dist/index.js'

function deterministicFactory() {
  let id = 0
  let tick = 0
  return {
    id(prefix) {
      id += 1
      return `${prefix}_${id}`
    },
    now() {
      const value = new Date(Date.UTC(2026, 0, 1, 0, 0, tick)).toISOString()
      tick += 1
      return value
    },
  }
}

test('project lifecycle advances only after accepted artifact candidates', () => {
  const factory = deterministicFactory()
  const snapshot = createBookProject(
    { title: '测试书', genre: '都市' },
    factory,
  )

  assert.equal(snapshot.project.revision, 0)
  assert.equal(snapshot.project.lifecycle.currentStage, 'idea')

  const idea = stageCandidate(
    snapshot.project,
    {
      kind: 'book_artifact',
      payload: {
        artifactType: 'idea',
        value: { premise: '一个普通人能看到未来 24 小时的一次重大决定。' },
      },
      summary: '确认核心脑洞',
    },
    factory,
  )

  const result = acceptCandidate(snapshot.project, idea, factory)
  assert.equal(result.status, 'accepted')
  assert.equal(result.project.revision, 1)
  assert.equal(result.project.lifecycle.currentStage, 'direction')
  assert.equal(result.project.acceptedArtifactRefs.length, 1)
  assert.equal(result.project.activeArtifactRefs.idea, result.artifact.id)
})

test('candidate acceptance is revision-safe and marks stale candidates without applying them', () => {
  const factory = deterministicFactory()
  const snapshot = createBookProject({ title: '并发测试' }, factory)

  const first = stageCandidate(
    snapshot.project,
    {
      kind: 'project_metadata',
      payload: { title: '新标题 A' },
      summary: '标题 A',
    },
    factory,
  )
  const second = stageCandidate(
    snapshot.project,
    {
      kind: 'project_metadata',
      payload: { title: '新标题 B' },
      summary: '标题 B',
    },
    factory,
  )

  const accepted = acceptCandidate(snapshot.project, first, factory)
  assert.equal(accepted.status, 'accepted')
  assert.equal(accepted.project.title, '新标题 A')
  assert.equal(accepted.project.revision, 1)

  const stale = acceptCandidate(accepted.project, second, factory)
  assert.equal(stale.status, 'stale')
  assert.equal(stale.candidate.status, 'stale')
  assert.equal(stale.project.title, '新标题 A')
  assert.equal(stale.project.revision, 1)
})

test('accepted candidates cannot be accepted twice', () => {
  const factory = deterministicFactory()
  const snapshot = createBookProject({ title: '重复接受测试' }, factory)
  const candidate = stageCandidate(
    snapshot.project,
    {
      kind: 'project_metadata',
      payload: { genre: '悬疑' },
      summary: '设置题材',
    },
    factory,
  )
  const result = acceptCandidate(snapshot.project, candidate, factory)
  assert.equal(result.status, 'accepted')

  assert.throws(
    () => acceptCandidate(result.project, result.candidate, factory),
    /not staged/,
  )
})

test('rejecting a candidate changes candidate state only', () => {
  const factory = deterministicFactory()
  const snapshot = createBookProject({ title: '拒绝测试' }, factory)
  const candidate = stageCandidate(
    snapshot.project,
    {
      kind: 'book_artifact',
      payload: { artifactType: 'idea', value: { premise: 'A' } },
      summary: '候选脑洞',
    },
    factory,
  )
  const rejected = rejectCandidate(candidate, '暂不采用', factory)

  assert.equal(rejected.status, 'rejected')
  assert.equal(rejected.decisionNote, '暂不采用')
  assert.equal(snapshot.project.revision, 0)
  assert.equal(snapshot.project.lifecycle.currentStage, 'idea')
})
