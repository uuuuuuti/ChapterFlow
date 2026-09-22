import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { LocalProjectStore } from '../packages/project-store/dist/index.js'
import {
  compileProjectChapterContext,
  runWriteChapterWorkflow,
} from '../packages/harness-adapter/dist/index.js'

const OPENING_BLUEPRINT = {
  corePromise: '每章都围绕一次高风险决定推进，并让主角承担干预代价。',
  incitingEvent: '客户准备把全部积蓄转入异常账户。',
  protagonistPredicament: '主角没有证据阻止客户自主交易。',
  firstPayoff: '主角找到骗局破绽，避免客户损失。',
  firstMajorQuestion: '为什么这些重大决定会被主角看见。',
  chapterIntents: [
    {
      chapter: 1,
      purpose: '能力发现',
      readerExpectation: '确认预见是否真实',
      emotionTarget: '紧张',
      goal: '拖住第一笔高风险转账',
      conflict: '没有证据且不能越权',
      payoff: '预见细节应验并找到骗局破绽',
      hook: '第二个预见对象是同事',
    },
    {
      chapter: 2,
      purpose: '能力规则',
      readerExpectation: '看主角如何处理身边人的风险',
      emotionTarget: '期待',
      goal: '弄清同事即将做出的决定',
      conflict: '同事拒绝透露私事',
      payoff: '危险担保被阻止但主角遭到怀疑',
      hook: '两起事件出现同一家公司',
    },
    {
      chapter: 3,
      purpose: '主线升级',
      readerExpectation: '确认事件之间的联系',
      emotionTarget: '惊讶',
      goal: '找到共同线索',
      conflict: '主角不能解释信息来源',
      payoff: '公开证据证明两起事件相连',
      hook: '新的预见对象是调查者',
    },
  ],
  firstArcMilestones: ['确认能力规则', '建立干预代价', '三起事件汇入主线'],
}

const POSITIONING = {
  premise: '银行职员能看见别人未来 24 小时内的一次重大财务决定。',
  readerPromise: '高风险决策、受限干预、反转回报。',
}

const STORY_ENGINE = {
  protagonist: '周岑',
  repeatableStoryLoop: '发现决定 → 受限干预 → 付出代价 → 获得线索。',
}

async function advanceToFirstThree(store, projectId) {
  const artifacts = [
    ['idea', { premise: '一个银行职员能预见重大财务决定。' }],
    ['direction', { direction: '都市金融悬疑' }],
    ['positioning', POSITIONING],
    ['story_engine', STORY_ENGINE],
    ['packaging', { title: '下一笔钱' }],
    ['opening_blueprint', OPENING_BLUEPRINT],
  ]

  for (const [artifactType, value] of artifacts) {
    const candidate = await store.stageCandidate(projectId, {
      kind: 'book_artifact',
      payload: { artifactType, value },
      summary: artifactType,
    })
    const result = await store.acceptCandidate(projectId, candidate.id)
    assert.equal(result.status, 'accepted')
  }
}

async function settleAcceptedChapter(store, projectId, chapterIndex, versionId) {
  const candidate = await store.stageCandidate(projectId, {
    kind: 'chapter_settlement',
    payload: {
      chapterIndex,
      chapterVersionId: versionId,
      summary: 'settled chapter ' + chapterIndex,
      characterStates: [
        {
          characterKey: 'zhou_cen',
          name: '周岑',
          emotionalState: '持续警觉',
          knows: ['已发生章节 ' + chapterIndex],
          believes: [],
          hides: ['能力来源'],
          possessions: [],
          unresolvedConflicts: ['继续调查能力与案件'],
        },
      ],
      relationshipEvents: [],
      timelineEvents: [
        {
          title: '章节事件 ' + chapterIndex,
          summary: '章节 ' + chapterIndex + ' 的核心事件已发生。',
          storyOrder: chapterIndex,
          characterKeys: ['zhou_cen'],
        },
      ],
      readerPromiseOperations: [],
      handoff: {
        endingSituation: '章节 ' + chapterIndex + ' 结束，新的压力形成。',
        unresolvedConflicts: ['核心谜团仍未解决'],
        immediateQuestions: ['下一步如何推进'],
        activeCharacterKeys: ['zhou_cen'],
        nextChapterPressures: ['继续推进主线'],
        continuityWarnings: [],
      },
    },
    summary: 'settlement ' + chapterIndex,
  })
  return store.acceptCandidate(projectId, candidate.id)
}


function chapterBody(index) {
  const paragraph =
    '周岑盯着屏幕上的倒计时，没有立刻开口。他知道自己看到的不是答案，只是一种即将发生的选择。柜台外的人还在催促，规则、风险和责任同时压了过来。'
  return Array.from({ length: 55 }, (_, i) =>
    '第' + index + '章场景' + (i + 1) + '：' + paragraph
  ).join('\n\n')
}

function fakeWriteEngine(chapterIndex) {
  const final = {
    title: '第' + chapterIndex + '章 决定之前',
    content: chapterBody(chapterIndex),
  }
  return {
    start(request) {
      return {
        id: 'wf-write-' + chapterIndex,
        meta: request.meta,
        result: Promise.resolve({
          value: {
            chapterIndex,
            draft: JSON.stringify(final),
            review: 'Continuity OK; tighten two exposition beats.',
            finalDraft: JSON.stringify(final),
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

test('accepting opening blueprint materializes three planned chapters', async () => {
  const root = await mkdtemp(join(tmpdir(), 'chapterflow-writing-'))
  try {
    const store = new LocalProjectStore({ rootDir: root })
    const created = await store.createProject({ title: 'Chapter Test' })
    await advanceToFirstThree(store, created.project.id)

    const snapshot = await store.getSnapshot(created.project.id)
    assert.equal(snapshot.project.lifecycle.currentStage, 'first_3_chapters')
    assert.deepEqual(snapshot.project.chapters.map((chapter) => chapter.index), [1, 2, 3])
    assert.deepEqual(snapshot.project.chapters.map((chapter) => chapter.status), [
      'planned',
      'planned',
      'planned',
    ])
    assert.equal(snapshot.project.chapters[0].intent.hook, '第二个预见对象是同事')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('Context Compiler selects committed writing context and emits an explainable manifest', async () => {
  const root = await mkdtemp(join(tmpdir(), 'chapterflow-writing-'))
  try {
    const store = new LocalProjectStore({ rootDir: root })
    const created = await store.createProject({ title: 'Context Packet Test' })
    await advanceToFirstThree(store, created.project.id)

    const packet = await compileProjectChapterContext(store, created.project.id, 1)

    assert.equal(packet.task, 'write_chapter')
    assert.equal(packet.bookRevision, 6)
    assert.equal(packet.chapter.index, 1)
    assert.equal(packet.previousChapter, undefined)
    assert.deepEqual(packet.positioning, POSITIONING)
    assert.deepEqual(packet.storyEngine, STORY_ENGINE)
    assert.deepEqual(packet.openingBlueprint, OPENING_BLUEPRINT)
    assert.deepEqual(
      packet.manifest.map((item) => item.kind),
      ['chapter_intent', 'positioning', 'story_engine', 'opening_blueprint'],
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('WriteChapter stages prose as a candidate and acceptance stores immutable body outside snapshot', async () => {
  const root = await mkdtemp(join(tmpdir(), 'chapterflow-writing-'))
  try {
    const store = new LocalProjectStore({ rootDir: root })
    const created = await store.createProject({ title: 'Write Test' })
    await advanceToFirstThree(store, created.project.id)

    const generated = await runWriteChapterWorkflow(
      store,
      fakeWriteEngine(1),
      { id: 'parent-agent' },
      new AbortController().signal,
      created.project.id,
      1,
    )

    assert.equal(generated.chapterIndex, 1)
    assert.equal(generated.candidate.kind, 'chapter_draft')
    assert.equal(generated.candidate.status, 'staged')
    assert.equal(generated.candidate.baseProjectRevision, 6)
    assert.equal(generated.requiresAcceptance, true)

    let snapshot = await store.getSnapshot(created.project.id)
    assert.equal(snapshot.project.revision, 6)
    assert.equal(snapshot.project.chapters[0].status, 'planned')

    const accepted = await store.acceptCandidate(
      created.project.id,
      generated.candidate.id,
    )
    assert.equal(accepted.status, 'accepted')
    assert.equal(accepted.project.revision, 7)
    assert.equal(accepted.chapterVersion.wordCount, chapterBody(1).replace(/\s+/g, '').length)

    snapshot = await store.getSnapshot(created.project.id)
    assert.equal(snapshot.project.chapters[0].status, 'accepted')
    assert.equal(snapshot.project.chapterVersions.length, 1)

    const acceptedCandidate = snapshot.candidates.find(
      (candidate) => candidate.id === generated.candidate.id,
    )
    assert.equal('content' in acceptedCandidate.payload, false)
    assert.equal(acceptedCandidate.payload.versionId, accepted.chapterVersion.id)

    const body = await store.getAcceptedChapterContent(created.project.id, 1)
    assert.equal(body, chapterBody(1))

    const snapshotText = await readFile(
      join(root, created.project.id, 'project.snapshot.json'),
      'utf8',
    )
    assert.equal(snapshotText.includes(chapterBody(1).slice(0, 80)), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('chapters must be written sequentially and prior settlement is mandatory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'chapterflow-writing-'))
  try {
    const store = new LocalProjectStore({ rootDir: root })
    const created = await store.createProject({ title: 'Sequence Test' })
    await advanceToFirstThree(store, created.project.id)

    await assert.rejects(
      runWriteChapterWorkflow(
        store,
        fakeWriteEngine(2),
        { id: 'parent-agent' },
        new AbortController().signal,
        created.project.id,
        2,
      ),
      /cannot be written before chapter 1/,
    )

    const chapter1 = await runWriteChapterWorkflow(
      store,
      fakeWriteEngine(1),
      { id: 'parent-agent' },
      new AbortController().signal,
      created.project.id,
    )
    const accepted1 = await store.acceptCandidate(created.project.id, chapter1.candidate.id)

    await assert.rejects(
      compileProjectChapterContext(store, created.project.id, 2),
      /must be settled before writing chapter 2/,
    )

    const next = await store.getNextAction(created.project.id)
    assert.match(next.nextAction, /Settle accepted chapter 1/)
    assert.deepEqual(next.blockers, ['chapter_1_settlement_required'])

    await settleAcceptedChapter(
      store,
      created.project.id,
      1,
      accepted1.chapterVersion.id,
    )

    const packet2 = await compileProjectChapterContext(store, created.project.id, 2)
    assert.equal(packet2.previousChapter, undefined)
    assert.equal(packet2.previousHandoff.chapterIndex, 1)
    assert.equal(
      packet2.manifest.some((item) => item.kind === 'chapter_handoff'),
      true,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('three accepted and settled chapters complete first_3_chapters lifecycle stage', async () => {
  const root = await mkdtemp(join(tmpdir(), 'chapterflow-writing-'))
  try {
    const store = new LocalProjectStore({ rootDir: root })
    const created = await store.createProject({ title: 'Three Chapter Test' })
    await advanceToFirstThree(store, created.project.id)

    for (let chapterIndex = 1; chapterIndex <= 3; chapterIndex += 1) {
      const generated = await runWriteChapterWorkflow(
        store,
        fakeWriteEngine(chapterIndex),
        { id: 'parent-agent' },
        new AbortController().signal,
        created.project.id,
      )
      const accepted = await store.acceptCandidate(
        created.project.id,
        generated.candidate.id,
      )
      assert.equal(accepted.status, 'accepted')
      assert.equal(accepted.project.lifecycle.currentStage, 'first_3_chapters')

      const settled = await settleAcceptedChapter(
        store,
        created.project.id,
        chapterIndex,
        accepted.chapterVersion.id,
      )
      assert.equal(settled.status, 'accepted')
      assert.equal(settled.project.revision, 6 + chapterIndex * 2)
    }

    const snapshot = await store.getSnapshot(created.project.id)
    assert.equal(snapshot.project.revision, 12)
    assert.equal(snapshot.project.lifecycle.currentStage, 'opening_review')
    assert.deepEqual(
      snapshot.project.chapters.map((chapter) => chapter.status),
      ['accepted', 'accepted', 'accepted'],
    )
    assert.deepEqual(
      snapshot.project.chapters.map((chapter) => chapter.settledDraftVersion),
      snapshot.project.chapters.map((chapter) => chapter.acceptedDraftVersion),
    )
    assert.equal(snapshot.project.chapterVersions.length, 3)
    assert.equal(snapshot.project.storyMemory.settlements.length, 3)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
