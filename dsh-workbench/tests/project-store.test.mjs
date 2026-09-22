import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { LocalProjectStore } from '../packages/project-store/dist/index.js'

test('local project store persists project facts independently from Harness sessions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'chapterflow-store-'))
  try {
    const storeA = new LocalProjectStore({ rootDir: root })
    const created = await storeA.createProject({
      title: '持久化测试',
      genre: '都市',
      platformTarget: 'fanqie',
    })

    const idea = await storeA.stageCandidate(created.project.id, {
      kind: 'book_artifact',
      payload: {
        artifactType: 'idea',
        value: { premise: '主角看到未来 24 小时的重大财务决定。' },
      },
      summary: '确认核心脑洞',
    })
    const accepted = await storeA.acceptCandidate(created.project.id, idea.id)

    assert.equal(accepted.status, 'accepted')
    assert.equal(accepted.project.revision, 1)

    const storeB = new LocalProjectStore({ rootDir: root })
    const reopened = await storeB.getSnapshot(created.project.id)

    assert.equal(reopened.project.revision, 1)
    assert.equal(reopened.project.lifecycle.currentStage, 'direction')
    assert.equal(reopened.candidates[0].status, 'accepted')
    assert.equal(reopened.project.activeArtifactRefs.idea, accepted.artifact.id)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('store serializes same-project mutations and persists stale candidate status', async () => {
  const root = await mkdtemp(join(tmpdir(), 'chapterflow-store-'))
  try {
    const store = new LocalProjectStore({ rootDir: root })
    const created = await store.createProject({ title: 'Revision Test' })

    const candidateA = await store.stageCandidate(created.project.id, {
      kind: 'project_metadata',
      payload: { title: 'A' },
      summary: 'A',
    })
    const candidateB = await store.stageCandidate(created.project.id, {
      kind: 'project_metadata',
      payload: { title: 'B' },
      summary: 'B',
    })

    const accepted = await store.acceptCandidate(created.project.id, candidateA.id)
    assert.equal(accepted.status, 'accepted')
    assert.equal(accepted.project.revision, 1)

    const stale = await store.acceptCandidate(created.project.id, candidateB.id)
    assert.equal(stale.status, 'stale')

    const snapshot = await store.getSnapshot(created.project.id)
    assert.equal(snapshot.project.title, 'A')
    assert.equal(snapshot.project.revision, 1)
    assert.equal(
      snapshot.candidates.find((candidate) => candidate.id === candidateB.id).status,
      'stale',
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('next action is derived from committed lifecycle state', async () => {
  const root = await mkdtemp(join(tmpdir(), 'chapterflow-store-'))
  try {
    const store = new LocalProjectStore({ rootDir: root })
    const created = await store.createProject({ title: 'Lifecycle Test' })
    const before = await store.getNextAction(created.project.id)
    assert.equal(before.currentStage, 'idea')

    const idea = await store.stageCandidate(created.project.id, {
      kind: 'book_artifact',
      payload: { artifactType: 'idea', value: { premise: 'X' } },
      summary: 'idea',
    })
    await store.acceptCandidate(created.project.id, idea.id)

    const after = await store.getNextAction(created.project.id)
    assert.equal(after.currentStage, 'direction')
    assert.match(after.nextAction, /direction/i)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})


test('store rejects staging against an outdated expected revision', async () => {
  const root = await mkdtemp(join(tmpdir(), 'chapterflow-store-'))
  try {
    const store = new LocalProjectStore({ rootDir: root })
    const created = await store.createProject({ title: 'Expected Revision Test' })

    const metadata = await store.stageCandidate(created.project.id, {
      kind: 'project_metadata',
      payload: { genre: '都市' },
      summary: 'set genre',
    })
    await store.acceptCandidate(created.project.id, metadata.id)

    await assert.rejects(
      store.stageCandidate(
        created.project.id,
        {
          kind: 'book_artifact',
          payload: { artifactType: 'idea', value: { premise: 'stale context' } },
          summary: 'stale workflow result',
        },
        { expectedProjectRevision: 0 },
      ),
      /changed from revision 0 to 1/,
    )

    const snapshot = await store.getSnapshot(created.project.id)
    assert.equal(snapshot.project.revision, 1)
    assert.equal(snapshot.candidates.length, 1)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
