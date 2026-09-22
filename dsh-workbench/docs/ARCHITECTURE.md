# ChapterFlow Workbench Architecture Specification V0.1

> Status: Draft for implementation  
> Branch: `chapterflow/dsh-workbench-architecture`  
> Scope: 独立于现有 ChapterFlow Web / Skill Kit 的 DeepSeek Harness 垂直创作工作台

---

## 1. Architecture Goal

ChapterFlow Workbench 的目标不是重做一个 AI 小说编辑器，而是在 DeepSeek Harness 之上增加一层**网文创作领域操作系统**。

系统必须回答四个问题：

1. **这本书现在处于什么阶段？**
2. **下一步最应该完成什么？**
3. **哪些作品事实、读者期待与剧情约束必须被带入当前任务？**
4. **AI 的建议如何经过审阅后安全地进入正式作品状态？**

最终用户不需要理解 Agent、Prompt、Tool 或 Workflow 的内部结构。用户只需要表达创作目标，例如：

- “我有个脑洞，帮我开一本书。”
- “继续写第 12 章。”
- “前三章感觉不抓人，帮我检查。”
- “女主职业改成律师，看看会影响哪里。”
- “把现在的人物关系和时间线画出来。”
- “准备投番茄了，帮我做签约前检查。”

系统负责判断当前作品状态、启动合适 Workflow、组织 Specialist Agent、读取相关记忆、形成 Candidate、请求作者确认，并推进作品生命周期。

---

## 2. Non-Goals

V1 不做以下事情：

- 不重造 Harness 的 Agent Loop、Session、模型路由、Streaming、Subagent Runtime。
- 不 fork 或侵入修改 Harness 核心包。
- 不做完整在线 SaaS、账号、计费、云同步。
- 不做自动登录或自动发布番茄。
- 不做稿费、推荐量、运营数据分析。
- 不做“一次 Workflow 自动写完整本书”。
- 不以单一分数预测“签约概率”。
- 不允许 Agent 直接静默修改正式 Canon。

---

## 3. Architecture Principles

### 3.1 Harness First

DeepSeek Harness 是通用 Agent OS。

ChapterFlow 必须通过独立 Adapter / Plugin 接入 Harness，而不是把 Harness 复制进项目或改成内部 fork。

Harness 上游变化只能影响 `harness-adapter`，不得穿透 Domain 层。

### 3.2 Domain Truth Is Not Session History

必须严格区分：

**Harness Session**
- 用户与 Agent 的对话
- Tool 调用
- Workflow 运行轨迹
- Subagent 结果
- 审批行为
- 可回放的 AI 操作历史

**ChapterFlow Project Store**
- 正式作品定位
- 人物与关系
- Canon
- Timeline
- Story Arc
- Reader Promise
- 伏笔
- Chapter Intent
- 正文
- Review Findings
- Candidate
- 平台知识引用

Session 可以丢失、fork、切换模型、跨多个会话；Project Store 必须继续保持作品事实一致。

### 3.3 Workflow Owns Process

Agent 不负责决定整个产品生命周期。

Agent 可以在一个 Workflow 内完成任务，但“从什么阶段推进到什么阶段”由 Book Lifecycle 与 Workflow 决定。

### 3.4 Candidate First

正式内容写入默认流程：

~~~
Generate / Edit
    ↓
Candidate
    ↓
Validate
    ↓
Review / Diff
    ↓
Author Accept / Reject
    ↓
Official State
~~~

涉及以下变化必须强制 Candidate：

- Book Positioning
- Story Engine
- Packaging
- Opening Blueprint
- Canon
- 关系状态
- 关键 Timeline
- Reader Promise 生命周期
- 正文章节
- 大规模修订

### 3.5 Visual Projection First

人物关系、时间线、剧情结构、Reader Promise、伏笔等本质是图结构，不应只以 Markdown 列表展示。

可视化必须从同一份 Domain State 生成 ViewSpec，而不是维护第二套数据。

---

## 4. System Overview

~~~
┌─────────────────────────────────────────────┐
│          DeepSeek Harness Web Client        │
│                                             │
│  Book Navigator │ Agent Chat │ Artifact UI  │
└───────────────┬───────────────┬─────────────┘
                │               │
                ▼               ▼
┌─────────────────────────────────────────────┐
│       ChapterFlow Harness Integration       │
│                                             │
│  UI Slots / Commands / Tools / Projection   │
│  Goal Bridge / Workflow Bridge              │
└───────────────────┬─────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────┐
│            ChapterFlow Domain Core          │
│                                             │
│ Book Lifecycle        Candidate Engine      │
│ Story Memory          Reader Memory         │
│ Context Compiler      Review Engine         │
│ Knowledge Engine      ViewSpec Engine       │
└───────────────────┬─────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────┐
│             ChapterFlow Project Store       │
│                                             │
│ Markdown / JSON / SQLite / Assets           │
└─────────────────────────────────────────────┘

DeepSeek Harness additionally owns:
Session · Agent Loop · Goal · Workflow · Subagent · Skill · Model
~~~

---

## 5. Repository Boundary

后续实现必须全部进入：

~~~
dsh-workbench/
├── apps/
│   └── profile/                 # Harness 启动 Profile / 配置
├── packages/
│   ├── core/                    # Domain service
│   ├── domain/                  # 类型、状态机、规则
│   ├── persistence/             # Project Store
│   ├── harness-adapter/         # 唯一依赖 Harness API 的边界
│   ├── workflows/               # ChapterFlow 工作流
│   ├── tools/                   # Harness Tools
│   ├── views/                   # ViewSpec + UI Projection
│   ├── fanqie/                  # Official Knowledge
│   └── testing/                 # fixtures / acceptance
├── skills/
│   ├── start-book/
│   ├── webnovel-planning/
│   ├── chapter-writing/
│   ├── novel-editor/
│   └── fanqie-writing/
└── docs/
~~~

禁止从旧 `apps/web`、旧 `packages/services` 或 `skill-kit` 直接 import。

需要复用的设计必须重新抽象到本项目自己的 Domain 中。

---

## 6. Book Lifecycle

Lifecycle 是产品主状态机。

V1 定义以下阶段：

~~~
IDEA
 ↓
DIRECTION
 ↓
POSITIONING
 ↓
STORY_ENGINE
 ↓
PACKAGING
 ↓
OPENING_BLUEPRINT
 ↓
FIRST_3_CHAPTERS
 ↓
OPENING_REVIEW
 ↓
REVISION
 ↓
SIGNING_READY
 ↓
SERIALIZATION
~~~

Stage 状态：

- `not_started`
- `in_progress`
- `candidate`
- `blocked`
- `needs_revision`
- `accepted`
- `complete`

每个 Stage 必须声明：

- required artifacts
- completion checks
- blockers
- next recommended action
- applicable workflow
- affected artifacts
- current accepted version

UI 不通过猜测聊天内容判断进度，而直接读取 Lifecycle Projection。

---

## 7. Harness Mapping

### 7.1 Goal

Goal 表示作者希望持续推进的高层目标。

典型 Goal：

- 完成一本新书的前三章并进入签约准备
- 完成第一卷
- 修复前三章开篇问题
- 将人物职业改动传播到受影响剧情

Goal 可以跨多个 Agent Turn 和多个 Workflow。

ChapterFlow 不把每个小任务创建成 Goal。

### 7.2 Workflow

Workflow 是有边界、可完成、可验收的流程。

V1 核心 Workflow：

1. `start-book`
2. `opening-sprint`
3. `write-chapter`
4. `editor-review`
5. `revision-loop`
6. `signing-review`

Workflow 可以 fan-out 到多个 Subagent，但不能无限运行。

### 7.3 Agent

Agent 是执行角色，不是产品导航。

主 Agent：
- `chapterflow-conductor`

专业 Subagents：
- Book Strategist
- Story Architect
- Character Specialist
- Chapter Writer
- Continuity Reviewer
- Web-Novel Editor
- Packaging Editor
- Platform Knowledge Reviewer

默认用户只与 Conductor 交互。

### 7.4 Skill

Skill 负责方法论，不保存作品事实。

例如：

- 番茄男频开篇方法
- 读者期待设计
- 冲突升级
- 人物欲望与选择
- 伏笔埋设与回收
- 降低 AI 味
- 章节 Hook
- 简介与书名包装

Skill 可以更新，但更新不能自动修改正式作品。

### 7.5 Tool

Tool 是 Agent 操作真实作品状态的唯一入口。

V1 Tool Surface 应保持高阶语义，避免暴露底层文件 CRUD。

推荐：

~~~
book.get_state
book.get_next_action

context.compile

candidate.stage
candidate.accept
candidate.reject

story.get
story.patch

chapter.prepare
chapter.stage_draft
chapter.accept_draft

memory.query
memory.commit_chapter

promise.list
promise.transition

review.opening
review.chapter
review.signing
review.create_revision_candidate

knowledge.retrieve

view.render
~~~

底层文件写入不应直接成为模型主要工具。

---

## 8. Core Workflows

### 8.1 Start Book

输入：一句脑洞或模糊创意。

输出：
- Direction
- Positioning
- Story Engine
- Packaging Candidate
- Opening Blueprint

阶段：

~~~
Idea
→ Strategy candidates
→ Positioning candidate
→ Story Engine candidate
→ Packaging candidates
→ Opening Blueprint candidate
→ Author accepts
~~~

每个重大阶段都有 Candidate 边界，不允许一次 Workflow 自动接受所有结果。

### 8.2 Opening Sprint

输入：已接受 Opening Blueprint。

输出：
- Chapter Intent 1–3
- Chapter 1–3 Draft
- Opening Review Findings

建议：

前三章详细计划；后续第一阶段只保留 Milestone Blocks，不一次生成 20 个同质化 Chapter Plan。

### 8.3 Write Chapter

固定链：

~~~
Compile Context Packet
→ Writer Agent
→ Draft Candidate
→ Deterministic Checks
→ User Accept
→ Story Memory Settlement
→ Reader Memory Settlement
→ Next Action
~~~

### 8.4 Editor Review

并行执行：

- Continuity Review
- Reader Promise Review
- Opening/Pacing Review
- AI Voice Review
- Platform Knowledge Review（仅适用时）

汇总为结构化 Finding。

### 8.5 Revision Loop

~~~
Finding
→ Select issues
→ Revision Candidate
→ Diff
→ Accept
→ Recheck affected checks
~~~

修改完成不自动清除 Finding；必须通过 Recheck 关闭。

---

## 9. Memory Architecture

### 9.1 Story Memory

回答：“故事中已经发生了什么？”

包括：

- Canon Fact
- Character State
- Relationship State
- Timeline Event
- Story Event / Connection
- World Rule
- Knowledge State
- Item / Injury / Location State
- Foreshadow

每条事实必须支持 provenance：

- source chapter
- source candidate / commit
- evidence
- createdAt
- supersedes

### 9.2 Reader Memory

回答：“读者为什么继续看？”

包括：

- Reader Promise
- Expectation
- Hook
- Unresolved Question
- Payoff
- Emotion Target
- Reward Cycle
- Promise Health

Reader Promise 生命周期：

~~~
OPEN → ADVANCE → PAYOFF
              ↘ ABANDONED
~~~

不能只保存“有没有伏笔”，还要保存“读者正在等待什么”。

### 9.3 Context Compiler

任何写作任务都不能默认读取全书。

`context.compile(chapterId, task)` 根据任务生成 Context Packet：

- Book Positioning
- Current Arc
- Chapter Intent
- relevant character states
- relevant relationships
- relevant canon
- relevant timeline
- relevant foreshadowing
- open Reader Promises
- previous chapter ending
- previous handoff
- style skill
- platform knowledge when applicable

Context Compiler 应记录每项证据为什么被选中，方便调试。

---

## 10. Review Model

所有 Finding 采用统一结构：

~~~
ReviewFinding
- id
- category
- severity
- target
- evidence
- reason
- suggestion
- sourceType
- sourceRefs
- status
- createdAt
- resolvedByCandidateId
~~~

Severity：

- `blocker`
- `high_risk`
- `improvement`
- `observation`

Source Type：

- deterministic
- chapterflow_inference
- official_knowledge

禁止把 ChapterFlow 推断伪装成平台官方规则。

---

## 11. Visual Intelligence

V1 必须把可视化作为 Domain Projection，而不是单独维护数据。

统一：

~~~
Domain State
   ↓
ViewSpec
   ↓
Harness UI Slot Renderer
~~~

V1 ViewSpec：

### Character Graph
人物、组织、关系、方向、强度、关系阶段、最近变化。

### Timeline
故事时间、叙事顺序、事件关系、章节、人物、地点。

### Story Map
Volume → Arc → Milestone → Chapter，显示每章 Purpose / Conflict / Payoff / Hook。

### Reader Promise Board
每个 Promise 的 OPEN / ADVANCE / PAYOFF、年龄、健康状态和关联章节。

### Foreshadow Map
埋下 → 提醒 → 推进 → 回收。

### Editor Findings Board
按 blocker / high risk / improvement 聚合问题，并能定位正文。

第一版最少必须实现 Character Graph 与 Timeline。

---

## 12. Workbench UI

不重写 Harness Chat。

通过 Harness UI 扩展形成：

### Left — Book Navigator

优先显示作品生命周期：

~~~
签约准备
███████░░ 7/9

✓ 作品定位
✓ Story Engine
✓ 包装
✓ 开篇规划
◐ 前三章
○ 责编检查
○ 修改复检
~~~

下方再提供资源导航：

- 世界观
- 人物
- 剧情
- 章节
- Reader Promise
- 伏笔
- 素材

### Center — Harness Agent

保持 Harness 原生：

- conversation
- reasoning
- tools
- goal
- workflow progress
- subagent activity
- approvals

### Right — Artifact Canvas

根据当前任务动态切换：

- Markdown editor
- Candidate Diff
- Character Graph
- Timeline
- Story Map
- Promise Board
- Findings Board
- Signing Review

---

## 13. Persistence

项目建议保持 local-first：

~~~
my-novel/
├── chapterflow.json
├── manuscript/
├── artifacts/
│   ├── positioning.md
│   ├── story-engine.md
│   ├── packaging.json
│   └── opening-blueprint.json
├── characters/
├── world/
├── notes/
└── .chapterflow/
    └── state.sqlite
~~~

原则：

- 正文与高价值人工内容优先可读 Markdown / JSON。
- SQLite 保存图关系、版本、Candidate、Finding、Promise、索引、provenance。
- 数据迁移由 schema version 驱动。
- Project Store 可独立于 Harness 启动与检查。

---

## 14. Harness Adapter Boundary

`packages/harness-adapter` 是唯一允许直接引用 DeepSeek Harness packages 的包。

它负责：

- register tools
- register skills
- register workflows
- read Goal
- listen Session events
- register UI slots
- expose ChapterFlow projection to UI
- map Harness approval → Candidate decision

Domain 层不得使用 Harness Agent / Session 类型。

上游 Harness breaking change 时，只允许修改 Adapter 与 Profile。

---

## 15. Failure & Safety

### Workflow failure

Workflow 失败不能回滚已被用户接受的 Domain State，只回滚未接受 Candidate / 临时运行状态。

### Stale Candidate

Candidate 必须记录 `baseProjectRevision`。

项目发生冲突性变更后，旧 Candidate accept 必须失败并要求重新生成或 rebase。

### Agent disagreement

多个 Subagent 结果不直接互相覆盖。由 Conductor 聚合为 Candidate 或 Finding。

### Knowledge freshness

平台规则必须保存 source / retrievedAt / applicable stage。

陈旧来源只能作为参考，不允许声明“当前平台明确要求”。

---

## 16. Observability

每次 Workflow Run 至少记录：

- workflowName
- goalRef
- projectRevisionBefore / After
- subagents
- tools
- context packet manifest
- candidates created
- findings created
- accepted mutations
- stopReason

Harness Session 保存运行轨迹；ChapterFlow 只保存与作品状态相关的关联索引。

---

## 17. V1 Implementation Slice

第一阶段只实现一条用户价值链：

~~~
一句脑洞
→ StartBook
→ Opening Blueprint
→ Chapter Intent 1–3
→ 真实写出前三章
→ Editor Review
→ Revision Candidate
→ Diff Accept
→ Recheck
~~~

并至少提供：

- Character Graph
- Timeline

只要这条链路在真实模型、真实 Project Store、真实 Harness Workflow 下通过，就认为 V1 基础架构成立。

---

## 18. Architecture Decisions

### ADR-01
DeepSeek Harness 作为外部平台依赖，不 fork。

### ADR-02
作品 Domain State 独立于 Harness Session。

### ADR-03
生命周期由 ChapterFlow State Machine 管理，不由 Prompt 推断。

### ADR-04
长篇记忆 = Story Memory + Reader Memory。

### ADR-05
正式写入 Candidate-first。

### ADR-06
Workflow 有界；Goal 长期。

### ADR-07
可视化从 Domain Projection 生成。

### ADR-08
用户默认只面对一个 Conductor Agent，专业角色作为 Subagent。

### ADR-09
V1 不追求功能数量，先证明完整开书闭环。

---

## 19. Adapter Spike Resolution

DeepSeek Harness Adapter Spike V0.1 已完成。详细证据见 [ADAPTER-SPIKE.md](./ADAPTER-SPIKE.md)。

已确认：

1. **UI 扩展路线成立。** Harness Client Slot 可以在不复制 Chat Shell 的情况下加入 ChapterFlow UI。Spike 先使用 `conversation.session.header.actions` 验证生命周期；真正 Artifact Canvas 的右侧挂载点留到 Visual Domain Slice 再定。
2. **采用固定 ChapterFlow Workflow façade。** 用户/模型调用稳定的小说领域 Tool，Adapter 内部再通过 `ctx.workflowEngine` 启动 Harness Workflow；不把通用动态脚本直接作为产品 API。
3. **使用独立 `chapterflow` Harness Profile。** 从 shipped `web` Profile 初始化，并把 ChapterFlow 本地插件安装到该 Profile，避免修改默认 Web Profile。
4. **Model-facing 与 browser-facing 插件分 plane。** model Tool 位于 Agent Preset 的 `workflowEngine` isolate；浏览器 UI 位于 Host/Client composition。
5. **Harness API 版本必须显式 pin。** 当前 Spike 面向 `0.1.6-alpha.2`，后续升级通过独立 CI 契约验证。

Domain Core V0.1 已进一步确认：

1. **Project Store 独立于 Harness Session。** 当前以单项目原子 JSON Snapshot 验证持久化边界；同一 Host 内同项目写入串行化，revision 负责 stale write 防护。
2. **Lifecycle 是确定性 Domain Projection。** 阶段完成时间来自正式接受 Artifact 的时间，不受无关 metadata 保存影响。
3. **Candidate-first 已成为真实写入路径。** Stage 不修改正式 revision；Accept 才提交，stale Candidate 不落正式状态。
4. **V0.1 禁止生命周期跳级。** 已完成阶段的回改与下游失效留给显式 Revision Domain，不通过覆盖旧 Artifact 偷做。

仍待后续 Slice 决定：

1. Candidate Approval 与 Harness 原生 Approval UI 的最终结合方式。
2. 当 Chapter / Memory 数据规模扩大后，Project Store 是否迁移 SQLite + workspace mirror。
3. Harness Session fork 时“AI 分支”和“作品分支”的明确交互语义。
4. Visual ViewSpec 最终通过 Remote service、Session projection，还是两者组合暴露给客户端。
5. 右侧 Artifact Canvas 是使用 Sidebar keyed tab，还是 Conversation View + Sidebar 的组合。

StartBook Workflow V0.1 已进一步确认：

1. **StartBook 必须按 lifecycle stage 可恢复执行。** 每次只生成当前阶段一个 Candidate，接受后 revision +1，再进入下一阶段；禁止一次预生成六个会立即 stale 的 Candidate。
2. **开书生成采用 Specialist → Critic → Lead Editor。** Harness Workflow 负责临时协作，最终只有 Lead Editor 的结构化 Artifact 能进入 Candidate 校验。
3. **StartBook Context 只读取 committed active artifacts。** rejected / staged Candidate 不是 Domain Truth，不进入下游正式上下文。
4. **模型输出必须先经过确定性结构校验。** 无效 JSON、缺字段、多余高风险字段或错误前三章 Intent 结构都不能进入 Candidate。
5. **Workflow 完成后仍要二次 revision guard。** Project Store 在写锁内核对 `expectedProjectRevision`，防止多 Session 并发把 stale context 结果放进候选队列。

这些未决项不阻塞 Chapter Writing Slice V0.1。
