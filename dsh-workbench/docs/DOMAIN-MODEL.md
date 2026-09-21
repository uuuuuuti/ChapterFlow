# ChapterFlow Domain Model V0.1

> Implementation status: **Domain Core V0.1 implemented**  
> Implemented now: BookProject, Lifecycle, Candidate, Project Revision, accepted Project Artifact, Local Project Store.  
> Deferred: Chapter, Settlement, Story Memory, Reader Memory, Review Finding, Context Packet, ViewSpec.

## 0. Domain Core V0.1 Runtime Contract

当前实现采用以下最小正式状态边界：

~~~
ProjectSnapshot
- schemaVersion
- project
- candidates[]
~~~

一个项目保存为一个原子快照文件：

~~~
.chapterflow/projects/<projectId>/project.snapshot.json
~~~

V0.1 选择单文件原子 rename，是为了先验证 **Session-independent Domain State + Candidate transaction boundary**。这不是对长期 SQLite / workspace mirror 方案的否定；当 Chapter / Memory / Projection 数据量进入下一阶段后再评估拆分存储。

当前规则：

1. Candidate `stage` 不修改 `project.revision`。
2. Candidate `accept` 才是正式作品变更，并将 revision +1。
3. Candidate 的 `baseProjectRevision` 与当前 revision 不一致时，Candidate 标记为 `stale`，正式状态不变。
4. `book_artifact` 只能按当前 Lifecycle Stage 顺序接受，禁止直接跳阶段。
5. V0.1 已支持 Artifact：`idea / direction / positioning / story_engine / packaging / opening_blueprint`。
6. 已完成阶段暂不允许通过普通 `book_artifact` 静默覆盖；未来由显式 Revision / downstream invalidation 机制处理。
7. Store 在同一 Harness Host 进程内对同项目写入串行化；跨进程写锁尚未实现。
8. Harness Session 生命周期不拥有 Project Store；删除或切换 Session 不删除作品事实。

---

本文件定义 ChapterFlow Workbench 的核心领域对象。Domain 层不得依赖 DeepSeek Harness 类型。

---

## 1. Aggregate Roots

V1 只允许三个主要 Aggregate Root：

1. `BookProject`
2. `Chapter`
3. `Candidate`

其他对象通过稳定 ID 归属于 BookProject。

---

## 2. BookProject

~~~
BookProject
- id
- schemaVersion
- title
- genre
- platformTarget?
- createdAt
- updatedAt
- revision
- lifecycle
- acceptedArtifactRefs
- activeArtifactRefs
- artifacts[]
~~~

`revision` 是全项目乐观锁版本。

任何影响创作上下文的正式变更必须递增 revision。

V0.1 中已接受 Artifact 还保存：

~~~
ProjectArtifact
- id
- type
- value
- acceptedCandidateId
- acceptedAt
- projectRevision
~~~

`acceptedArtifactRefs` 保留接受历史，`activeArtifactRefs` 指向当前正式 Artifact。

---

## 3. Lifecycle

~~~
BookLifecycle
- currentStage
- stages[]
- nextAction
- blockers[]
~~~

~~~
LifecycleStageState
- stage
- status
- artifactRefs[]
- candidateRefs[]
- findingRefs[]
- startedAt?
- completedAt?
~~~

Stage：

- idea
- direction
- positioning
- story_engine
- packaging
- opening_blueprint
- first_3_chapters
- opening_review
- revision
- signing_ready
- serialization

---

## 4. Book Positioning

~~~
BookPositioning
- premise
- genre
- subGenre[]
- targetReader
- coreFantasy
- protagonistHook
- centralConflict
- emotionalValue
- differentiation
- readerPromise
- boundaries[]
~~~

Positioning 是高层创作合同。

下游 Story Engine、Packaging、Opening、Review 都必须可以追溯到 Positioning。

---

## 5. Story Engine

~~~
StoryEngine
- protagonist
- desire
- lack
- externalGoal
- coreAbilityOrAdvantage?
- abilityCost?
- primaryOpposition
- escalationMechanism
- repeatableStoryLoop
- longTermMystery?
- relationshipEngine?
- firstArcGoal
- failureConsequences
~~~

Story Engine 解决“这个创意能不能持续写”。

它不是大纲。

---

## 6. Packaging

~~~
BookPackaging
- id
- title
- subtitle?
- introduction
- tags[]
- sellingPoints[]
- promiseAlignment
- openingAlignment
- samenessRisks[]
~~~

Packaging 始终是可比较 Candidate，不保存虚构 CTR / 签约概率。

---

## 7. Opening Blueprint

~~~
OpeningBlueprint
- corePromise
- incitingEvent
- protagonistPredicament
- firstPayoff
- firstMajorQuestion
- chapterIntents[1..3]
- firstArcMilestones[]
~~~

前三章必须详细。

第一阶段后续规划使用 Milestone，不要求提前生成大量同质 Chapter Intent。

---

## 8. Chapter Intent

~~~
ChapterIntent
- chapterId
- purpose
- secondaryPurposes[]
- readerExpectation
- emotionTarget
- goal
- conflict
- informationGain
- payoff
- payoffStrength
- hook
- hookType
- hookStrength
- readerPromiseOperations[]
- relevantCharacters[]
- relevantForeshadowing[]
- targetWords
- pacing
~~~

Intent 是写作前约束，不是章节总结。

---

## 9. Character

~~~
Character
- id
- name
- aliases[]
- role
- profile
- desire
- fear
- flaw
- secret
- boundary
- behaviorLogic
- arcState
- status
~~~

当前状态与静态人设必须分离。

~~~
CharacterState
- characterId
- chapterId
- physicalState
- emotionalState
- location
- knows[]
- believes[]
- hides[]
- possessions[]
- unresolvedConflicts[]
- relationshipSnapshots[]
- provenance
~~~

---

## 10. Relationship

~~~
Relationship
- id
- fromCharacterId
- toCharacterId
- type
- direction
- publicLabel
- currentStage
- tension
- trust
- affinity
- status
~~~

~~~
RelationshipEvent
- relationshipId
- chapterId
- change
- evidence
- before
- after
~~~

这样 Character Graph 可以支持“查看第 N 章时的人物关系”。

---

## 11. Canon Fact

~~~
CanonFact
- id
- subjectType
- subjectId
- predicate
- value
- locked
- validFromChapter?
- validToChapter?
- provenance
- supersedes?
~~~

Canon Fact 与“章节提到的一句话”不同。

只有经过 Settlement 的事实才进入正式 Canon。

---

## 12. Timeline

~~~
StoryEvent
- id
- title
- summary
- storyTimeMode
- storyTimeLabel
- storyTimeValue?
- storyOrder
- narrativeChapterId?
- location?
- characterIds[]
- arcIds[]
- provenance
~~~

~~~
EventConnection
- id
- sourceEventId
- targetEventId
- type
- note
~~~

Connection Type：

- before
- same_time
- overlaps
- causes
- enables
- conceals
- contradicts

---

## 13. Foreshadowing

~~~
Foreshadow
- id
- title
- description
- status
- plannedPayoff?
- beats[]
~~~

~~~
ForeshadowBeat
- id
- chapterId
- action
- evidence?
- status
~~~

Action：

- plant
- remind
- advance
- payoff

---

## 14. Reader Promise

~~~
ReaderPromise
- id
- title
- description
- kind
- status
- openedChapterId
- expectedPayoffWindow?
- events[]
- health
~~~

Status：

- open
- paid_off
- abandoned

~~~
ReaderPromiseEvent
- action: OPEN | ADVANCE | PAYOFF
- chapterId
- evidence
- note
~~~

Health 不是模型自由发挥的标签，应由确定性信号 + Editor 判断组合产生。

---

## 15. Chapter

~~~
Chapter
- id
- index
- title
- arcId?
- intentVersion
- acceptedDraftVersion?
- status
~~~

正文文件与 Chapter Metadata 分开。

~~~
ChapterVersion
- id
- chapterId
- contentHash
- wordCount
- createdAt
- candidateId?
- acceptedAt?
~~~

---

## 16. Chapter Settlement

章节接受后不意味着自动成为完整 Story Memory。

必须执行 Settlement：

~~~
ChapterSettlement
- chapterId
- chapterVersionId
- canonChanges[]
- characterStateChanges[]
- relationshipEvents[]
- timelineEvents[]
- foreshadowEvents[]
- promiseEvents[]
- handoff
- acceptedAt
~~~

Settlement 自身也可产生 Candidate。

V1 可允许正文接受后自动生成 Settlement Candidate，再由规则决定是否需要人工确认。

---

## 17. Handoff

~~~
ChapterHandoff
- chapterId
- endingSituation
- unresolvedConflicts[]
- immediateQuestions[]
- activeCharacters[]
- nextChapterPressures[]
- continuityWarnings[]
~~~

下一章 Context Compiler 优先读取 Handoff，而不是完整重读上一章。

---

## 18. Candidate

~~~
Candidate
- id
- kind
- targetId?
- baseProjectRevision
- payload
- summary
- sourceRun
- sourceRefs[]
- status
- createdAt
- decidedAt?
~~~

Status：

- staged
- accepted
- rejected
- stale

Accept 条件：

1. schema valid
2. base revision compatible
3. target still exists
4. no unresolved hard conflict
5. author / authorized approval

---

## 19. Review Finding

~~~
ReviewFinding
- id
- reviewRunId
- category
- severity
- target
- evidence
- reason
- suggestion
- sourceType
- sourceRefs[]
- status
- createdAt
- resolvedAt?
- resolvedByCandidateId?
~~~

Status：

- open
- addressed
- dismissed
- stale

Finding 只有在 Recheck 后才能进入 addressed。

---

## 20. Official Knowledge

~~~
OfficialSource
- id
- platform
- url
- title
- authorityType
- publishedAt?
- retrievedAt
- contentHash
- status
- applicableStages[]
~~~

~~~
KnowledgeCard
- id
- title
- principle
- why
- stage
- genres[]
- signals[]
- antiPatterns[]
- suggestions[]
- severity
- sourceRefs[]
- confidence
- status
~~~

官方来源与 ChapterFlow 推断必须能在 UI 上区分。

---

## 21. Context Packet

~~~
ContextPacket
- task
- bookRevision
- chapterId?
- positioning
- storyEngine
- currentArc
- chapterIntent?
- characterStates[]
- relationships[]
- canonFacts[]
- timeline[]
- foreshadowing[]
- readerPromises[]
- previousHandoff?
- skills[]
- knowledgeCards[]
- manifest[]
~~~

Manifest：

~~~
ContextManifestItem
- kind
- refId
- reason
- priority
- tokenEstimate?
~~~

Context Packet 必须可调试。

---

## 22. ViewSpec

ViewSpec 是纯 JSON Domain Projection。

共同结构：

~~~
ViewSpec
- type
- projectRevision
- title
- generatedAt
- filters
- payload
~~~

V1：

- character_graph
- timeline
- story_map
- promise_board
- foreshadow_map
- editor_findings

Renderer 不得写入 Domain State。

---

## 23. Provenance

统一：

~~~
Provenance
- sourceType
- sourceId
- chapterId?
- chapterVersionId?
- candidateId?
- workflowRunId?
- evidence?
- createdAt
~~~

任何自动提取的长期事实都必须有 provenance。

---

## 24. Invariants

必须在 Domain 层测试：

1. 一个 accepted Candidate 不能再次接受。
2. stale Candidate 不能静默落盘。
3. Canon locked fact 不能被普通编辑覆盖。
4. PAYOFF 不允许作用于不存在的 Reader Promise。
5. Relationship Event 必须引用存在的人物。
6. Timeline connection 不允许 source = target。
7. Chapter Settlement 必须绑定明确正文版本。
8. Review Finding resolved 必须存在 recheck 证据。
9. ViewSpec 只能从已提交 Domain State 生成。
10. Harness Session 删除不能删除 BookProject。
