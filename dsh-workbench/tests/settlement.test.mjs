import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { LocalProjectStore } from '../packages/project-store/dist/index.js'
import { compileProjectChapterContext } from '../packages/harness-adapter/dist/index.js'

const OPENING_BLUEPRINT = {
  corePromise: '风险决定会不断逼迫主角干预。',
  incitingEvent: '客户即将执行异常转账。',
  protagonistPredicament: '主角没有证据。',
  firstPayoff: '主角阻止第一笔损失。',
  firstMajorQuestion: '能力为什么出现。',
  chapterIntents: [
    {
      chapter: 1,
      purpose: '能力发现',
      readerExpectation: '验证能力',
      emotionTarget: '紧张',
      goal: '阻止转账',
      conflict: '没有证据',
      payoff: '骗局被识破',
      hook: '下一个对象是同事',
    },
    {
      chapter: 2,
      purpose: '能力规则',
      readerExpectation: '处理同事风险',
      emotionTarget: '期待',
      goal: '阻止担保',
      conflict: '同事不信任主角',
      payoff: '担保被阻止',
      hook: '出现共同公司',
    },
    {
      chapter: 3,
      purpose: '主线升级',
      readerExpectation: '连接两起事件',
      emotionTarget: '惊讶',
      goal: '找到共同线索',
      conflict: '来源无法解释',
      payoff: '公开证据出现',
      hook: '调查者进入',
    },
  ],
  firstArcMilestones: ['确认能力', '建立代价', '汇入主线'],
}

async function advanceToWriting(store, projectId) {
  const artifacts = [
    ['idea', { premise: '银行职员预见重大财务决定。' }],
    ['direction', { genre: '都市悬疑' }],
    ['positioning', { readerPromise: '风险决定与受限干预。' }],
    ['story_engine', { repeatableStoryLoop: '预见→干预→代价→线索' }],
    ['packaging', { title: '下一笔钱' }],
    ['opening_blueprint', OPENING_BLUEPRINT],
  ]
  for (const [artifactType, value] of artifacts) {
    const candidate = await store.stageCandidate(projectId, {
      kind: 'book_artifact',
      payload: { artifactType, value },
      summary: String(artifactType),
    })
    const accepted = await store.acceptCandidate(projectId, candidate.id)
    assert.equal(accepted.status, 'accepted')
  }
}

async function acceptChapterOne(store, projectId) {
  const draft = await store.stageCandidate(projectId, {
    kind: 'chapter_draft',
    payload: {
      chapterIndex: 1,
      title: '第一章 24小时',
      content: '周岑在柜台前第一次看见客户未来二十四小时内将全部积蓄转入陌生账户。他无法解释来源，只能借合规核验拖延交易，并从收款信息中发现伪造痕迹。客户最终停下转账，但周岑抬头时，又在同事林乔身上看见了新的决定。',
    },
    summary: 'chapter 1',
  })
  const accepted = await store.acceptCandidate(projectId, draft.id)
  assert.equal(accepted.status, 'accepted')
  return accepted.chapterVersion
}

function settlementPayload(versionId) {
  return {
    chapterIndex: 1,
    chapterVersionId: versionId,
    summary: '周岑确认能力真实并阻止第一笔异常转账，新的风险转向同事林乔。',
    characterStates: [
      {
        characterKey: 'zhou_cen',
        name: '周岑',
        emotionalState: '警觉且困惑',
        location: '银行网点',
        knows: ['自己能看见他人未来24小时内的一次重大财务决定'],
        believes: ['能力提示具有现实对应'],
        hides: ['能力来源'],
        possessions: [],
        unresolvedConflicts: ['如何在不能暴露能力的情况下继续干预'],
      },
      {
        characterKey: 'lin_qiao',
        name: '林乔',
        emotionalState: '尚未察觉风险',
        location: '银行网点',
        knows: [],
        believes: [],
        hides: [],
        possessions: [],
        unresolvedConflicts: ['即将发生的重大财务决定'],
      },
    ],
    relationshipEvents: [
      {
        fromCharacterKey: 'zhou_cen',
        toCharacterKey: 'lin_qiao',
        type: 'colleague',
        change: '周岑开始把林乔视为需要立即关注的风险对象',
        evidence: '章末新的预见落在林乔身上',
        tension: '上升',
      },
    ],
    timelineEvents: [
      {
        title: '第一次预见被验证',
        summary: '周岑通过拖延和核验阻止客户异常转账，确认预见对应真实风险。',
        storyOrder: 1,
        characterKeys: ['zhou_cen'],
        location: '银行网点',
      },
    ],
    readerPromiseOperations: [
      {
        action: 'OPEN',
        key: 'ability_origin',
        title: '能力为何出现',
        description: '读者期待知道周岑为何能看见未来财务决定以及能力边界。',
        evidence: '能力突然出现且尚无解释',
      },
      {
        action: 'OPEN',
        key: 'lin_qiao_risk',
        title: '林乔将做什么决定',
        description: '章末新预见把风险转向主角身边的人。',
        evidence: '章末周岑在林乔身上看见新的重大决定',
      },
    ],
    handoff: {
      endingSituation: '第一起风险被阻止，但新的预见对象变成同事林乔。',
      unresolvedConflicts: ['周岑不能暴露能力', '林乔的风险尚未发生'],
      immediateQuestions: ['林乔将做出什么决定', '能力有什么规则'],
      activeCharacterKeys: ['zhou_cen', 'lin_qiao'],
      nextChapterPressures: ['尽快识别林乔的具体风险', '避免让同事怀疑信息来源'],
      continuityWarnings: ['周岑目前只确认预见会应验，尚不知道完整能力规则'],
    },
  }
}

test('accepted chapter settlement commits story memory, reader memory, and handoff', async () => {
  const root = await mkdtemp(join(tmpdir(), 'chapterflow-settlement-'))
  try {
    const store = new LocalProjectStore({ rootDir: root })
    const created = await store.createProject({ title: 'Memory Test' })
    await advanceToWriting(store, created.project.id)
    const version = await acceptChapterOne(store, created.project.id)

    const settlement = await store.stageCandidate(created.project.id, {
      kind: 'chapter_settlement',
      payload: settlementPayload(version.id),
      summary: 'settle chapter 1',
    })
    const accepted = await store.acceptCandidate(created.project.id, settlement.id)

    assert.equal(accepted.status, 'accepted')
    assert.equal(accepted.settlement.chapterVersionId, version.id)

    const snapshot = await store.getSnapshot(created.project.id)
    assert.equal(snapshot.project.chapters[0].settledDraftVersion, version.id)
    assert.equal(snapshot.project.storyMemory.characterStates.length, 2)
    assert.equal(snapshot.project.storyMemory.relationshipEvents.length, 1)
    assert.equal(snapshot.project.storyMemory.timelineEvents.length, 1)
    assert.equal(snapshot.project.storyMemory.settlements.length, 1)
    assert.equal(snapshot.project.readerMemory.promises.length, 2)
    assert.equal(snapshot.project.readerMemory.promises[0].status, 'open')
    assert.equal(snapshot.project.storyMemory.latestHandoff.chapterIndex, 1)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('settlement must bind the current accepted chapter version and cannot settle twice', async () => {
  const root = await mkdtemp(join(tmpdir(), 'chapterflow-settlement-'))
  try {
    const store = new LocalProjectStore({ rootDir: root })
    const created = await store.createProject({ title: 'Version Test' })
    await advanceToWriting(store, created.project.id)
    const version = await acceptChapterOne(store, created.project.id)

    const wrong = await store.stageCandidate(created.project.id, {
      kind: 'chapter_settlement',
      payload: settlementPayload('wrong-version'),
      summary: 'wrong version',
    })
    await assert.rejects(
      store.acceptCandidate(created.project.id, wrong.id),
      /does not match the accepted chapter version/,
    )
    await store.rejectCandidate(created.project.id, wrong.id, 'wrong version')

    const correct = await store.stageCandidate(created.project.id, {
      kind: 'chapter_settlement',
      payload: settlementPayload(version.id),
      summary: 'correct version',
    })
    await store.acceptCandidate(created.project.id, correct.id)

    const duplicate = await store.stageCandidate(created.project.id, {
      kind: 'chapter_settlement',
      payload: settlementPayload(version.id),
      summary: 'duplicate',
    })
    await assert.rejects(
      store.acceptCandidate(created.project.id, duplicate.id),
      /already settled/,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('reader promise ADVANCE or PAYOFF cannot reference a promise that is not open', async () => {
  const root = await mkdtemp(join(tmpdir(), 'chapterflow-settlement-'))
  try {
    const store = new LocalProjectStore({ rootDir: root })
    const created = await store.createProject({ title: 'Promise Test' })
    await advanceToWriting(store, created.project.id)
    const version = await acceptChapterOne(store, created.project.id)

    const payload = settlementPayload(version.id)
    payload.readerPromiseOperations = [
      {
        action: 'PAYOFF',
        key: 'never_opened',
        evidence: '不存在的期待',
      },
    ]

    const candidate = await store.stageCandidate(created.project.id, {
      kind: 'chapter_settlement',
      payload,
      summary: 'invalid payoff',
    })
    await assert.rejects(
      store.acceptCandidate(created.project.id, candidate.id),
      /requires an existing open reader promise/,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('next chapter context prefers settled handoff and memory over the full previous chapter body', async () => {
  const root = await mkdtemp(join(tmpdir(), 'chapterflow-settlement-'))
  try {
    const store = new LocalProjectStore({ rootDir: root })
    const created = await store.createProject({ title: 'Context Memory Test' })
    await advanceToWriting(store, created.project.id)
    const version = await acceptChapterOne(store, created.project.id)

    const settlement = await store.stageCandidate(created.project.id, {
      kind: 'chapter_settlement',
      payload: settlementPayload(version.id),
      summary: 'settle chapter 1',
    })
    await store.acceptCandidate(created.project.id, settlement.id)

    const packet = await compileProjectChapterContext(store, created.project.id, 2)
    assert.equal(packet.previousChapter, undefined)
    assert.equal(packet.previousHandoff.chapterIndex, 1)
    assert.equal(packet.storyMemory.characterStates.length, 2)
    assert.equal(packet.readerMemory.promises.length, 2)
    assert.equal(
      packet.manifest.some((item) => item.kind === 'chapter_handoff'),
      true,
    )
    assert.equal(
      packet.manifest.some((item) => item.kind === 'previous_chapter'),
      false,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
