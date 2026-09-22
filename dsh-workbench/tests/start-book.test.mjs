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

const POSITIONING = {
  premise: '基层银行职员发现自己能预见他人未来 24 小时内一次重大财务决定，并被迫介入后果。',
  genre: '都市',
  subGenre: ['都市异能', '金融悬疑'],
  targetReader: '喜欢现实职业背景、强情节反转和能力成长的男频读者',
  coreFantasy: '比别人提前一步看见关键选择，并在规则限制下改变结局',
  protagonistHook: '主角懂规则却无法证明预见，因此每次救人都可能先伤到自己',
  centralConflict: '救人与自保、职业规则与道德责任持续冲突',
  emotionalValue: '克制爽感、紧张感、判断正确后的释放感',
  differentiation: '把预知能力限制在重大财务决定，天然绑定现实职业冲突',
  readerPromise: '每个单元都让读者看到一次高风险决策、一次干预代价和一次反转回报',
  boundaries: ['能力不能直接读取全部未来', '不靠巧合连续化解危机'],
}

const STORY_ENGINE = {
  protagonist: '基层银行职员周岑',
  desire: '保住平静生活并证明自己有能力做正确的事',
  lack: '过度依赖规则保护自己，不愿承担主动选择的责任',
  externalGoal: '阻止一连串会伤害普通人的重大财务决策',
  coreAbilityOrAdvantage: '能预见一个人在未来 24 小时内的一次重大财务决定',
  abilityCost: '每次主动干预都会让下一次预见更模糊，并增加被关注的风险',
  primaryOpposition: '利用信息差操纵他人决策的利益网络',
  escalationMechanism: '从单个客户事件升级到机构、资本与能力来源的长期冲突',
  repeatableStoryLoop: '发现高风险决定 → 判断是否介入 → 在职业限制下寻找证据 → 承担干预代价 → 获得局部回报并暴露更大问题',
  longTermMystery: '为什么能力只锁定财务决定，以及谁在制造这些关键节点',
  relationshipEngine: '同事、客户与调查者对主角的信任和怀疑随每次干预重新洗牌',
  firstArcGoal: '阻止三起看似独立却指向同一资金链的重大决策',
  failureConsequences: '客户受损、职业信誉崩塌、能力曝光并引来真正对手',
}

const PACKAGING = {
  title: '我能看见你的下一笔钱',
  introduction: '银行柜员周岑突然发现，自己能看见别人未来二十四小时内最重要的一次财务决定。第一次，他看见客户把全部积蓄转进骗局；第二次，他看见同事签下一份会毁掉前途的担保。可他越是试图改变结果，越发现这些决定背后像有一只手在推动。知道未来不难，难的是你愿不愿意为改变它付代价。',
  tags: ['都市异能', '金融悬疑', '职业', '反转'],
  sellingPoints: ['能力规则明确且有代价', '真实职业限制制造冲突', '单元事件与长期谜团双线推进'],
  promiseAlignment: '书名和简介直接突出“预见重大财务决定”的核心能力与决策悬念',
  openingAlignment: '前三章可以连续展示能力发现、第一次干预和干预代价',
  samenessRisks: ['避免写成泛化鉴宝或全知预言', '避免金融术语压过人物冲突'],
}

const OPENING_BLUEPRINT = {
  corePromise: '主角能提前看见重大财务决定，但每次改变结果都必须付出真实代价',
  incitingEvent: '一名熟悉客户准备将全部积蓄转入异常账户，主角第一次看见清晰的未来决定',
  protagonistPredicament: '他没有证据阻止交易，越权干预还可能被投诉和处分',
  firstPayoff: '主角用合规边缘的方法拖住交易并找到骗局破绽，成功避免客户损失',
  firstMajorQuestion: '为什么这次决定会被他看见，以及下一次预见为何指向自己身边的人',
  chapterIntents: [
    {
      chapter: 1,
      purpose: '能力发现与第一次危机建立',
      readerExpectation: '确认主角看到的究竟是不是未来',
      emotionTarget: '紧张',
      goal: '让客户暂缓高风险转账',
      conflict: '主角没有合法理由阻止客户自主交易',
      payoff: '预见中的关键细节在现实中出现，证明能力是真的',
      hook: '主角又看到第二个倒计时，而对象是自己的同事',
    },
    {
      chapter: 2,
      purpose: '展示能力规则和干预代价',
      readerExpectation: '看主角如何在规则内改变第二个决定',
      emotionTarget: '期待',
      goal: '弄清同事即将签下什么',
      conflict: '同事拒绝透露私事，主角的异常关注引发怀疑',
      payoff: '主角阻止了一份危险担保，却因此被主管盯上',
      hook: '第一次预见中的骗子账户与同事事件出现同一家公司',
    },
    {
      chapter: 3,
      purpose: '把单元危机升级为主线',
      readerExpectation: '确认两起事件是否有关',
      emotionTarget: '惊讶',
      goal: '找到两起事件的共同线索',
      conflict: '主角既不能调用超权限数据，也不能解释信息来源',
      payoff: '他找到合法公开证据，证明两起事件确实相连',
      hook: '新的预见对象变成了正在调查这家公司的人',
    },
  ],
  firstArcMilestones: [
    '确认能力只能看见重大财务决定',
    '建立干预会带来现实代价的规则',
    '三起事件指向同一资金链',
    '主角第一次主动选择追查而不是只救眼前的人',
  ],
}

const START_BOOK_FIXTURES = {
  idea: IDEA,
  direction: DIRECTION,
  positioning: POSITIONING,
  story_engine: STORY_ENGINE,
  packaging: PACKAGING,
  opening_blueprint: OPENING_BLUEPRINT,
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


test('StartBook completes all six opening lifecycle stages only through candidate acceptance', async () => {
  const root = await mkdtemp(join(tmpdir(), 'chapterflow-start-book-'))
  try {
    const store = new LocalProjectStore({ rootDir: root })
    const created = await store.createProject({
      title: '六阶段开书测试',
      genre: '都市',
      platformTarget: 'fanqie',
    })

    const expectedStages = [
      'idea',
      'direction',
      'positioning',
      'story_engine',
      'packaging',
      'opening_blueprint',
    ]

    for (let index = 0; index < expectedStages.length; index += 1) {
      const stage = expectedStages[index]
      const before = await store.getSnapshot(created.project.id)
      assert.equal(before.project.lifecycle.currentStage, stage)
      assert.equal(before.project.revision, index)

      const generated = await runStartBookWorkflow(
        store,
        fakeEngineFor(START_BOOK_FIXTURES[stage]),
        { id: 'parent-agent' },
        new AbortController().signal,
        created.project.id,
        stage === 'idea' ? IDEA.premise : undefined,
      )

      assert.equal(generated.stage, stage)
      assert.equal(generated.candidate.status, 'staged')
      assert.equal(generated.candidate.baseProjectRevision, index)

      const stillUncommitted = await store.getSnapshot(created.project.id)
      assert.equal(stillUncommitted.project.revision, index)
      assert.equal(stillUncommitted.project.lifecycle.currentStage, stage)

      const accepted = await store.acceptCandidate(
        created.project.id,
        generated.candidate.id,
      )
      assert.equal(accepted.status, 'accepted')
      assert.equal(accepted.project.revision, index + 1)
    }

    const finalSnapshot = await store.getSnapshot(created.project.id)
    assert.equal(finalSnapshot.project.revision, 6)
    assert.equal(finalSnapshot.project.lifecycle.currentStage, 'first_3_chapters')
    assert.equal(finalSnapshot.project.acceptedArtifactRefs.length, 6)
    assert.equal(finalSnapshot.project.artifacts.length, 6)

    await assert.rejects(
      runStartBookWorkflow(
        store,
        fakeEngineFor(IDEA),
        { id: 'parent-agent' },
        new AbortController().signal,
        created.project.id,
      ),
      /StartBook is complete/,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
