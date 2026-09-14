# ChapterFlow 网文领域 V1

本轮把网文创作的最小闭环收敛为：

`Expectation → Progress → Payoff`

它描述的是章节的读者体验，不是正文生成器。章节先有可确认的规划，再进入场景计划和正文生产；AI 的规划结果始终是候选，不能静默写入正式资料。

## 1. Chapter Intent

`Chapter Intent` 是产品层名称，现阶段继续使用 `ChapterBrief` 作为存储表、旧 API 和 TypeScript 兼容名。每个章节最多一个正式 Intent，带乐观锁版本和正文版本绑定。

正式字段包括：

- `purpose`、`secondaryPurposes`：本章主目的和最多三个次目的。
- `readerExpectation`：读者此刻在等什么。
- `emotionTarget`、`emotionCurve`：目标情绪与最多八个强度节点。
- `goal`、`conflict`、`payoff`：目标、阻力和可感知回报。
- `hook`、`hookType`：章尾牵引及类型。
- `payoffStrength`、`hookStrength`、`informationGain`、`endingPull`：0–5 的轻量规划指标，不构成质量评分门禁。
- `sceneStructure`：最多二十个场景节点，每个节点有目的、推进和局部回报。
- `readerPromiseOperations`：本章对 Reader Promise 的 `OPEN`、`ADVANCE`、`PAYOFF` 操作。

旧客户端缺少新增字段时，迁移默认到 `progress`、空数组、空文本和 0；旧字段 `goal/conflict/payoff/hook` 保持原语义。

## 2. Reader Promise

Reader Promise 是独立于 Story Bible、Canon、Memory 和 Task 的轻量期待追踪实体。它只回答“读者被承诺了什么、最近是否推进、何时兑现”。

生命周期：

```text
OPEN ──→ ADVANCE ──→ ADVANCE … ──→ PAYOFF
  └──────────────────────────────→ PAYOFF
```

- `OPEN` 必须有标题；可选目标章节。
- `ADVANCE` 和 `PAYOFF` 必须引用真实 Promise ID。
- 已兑现或已放弃的 Promise 不允许再次推进。
- 所有动作写入 `reader_promise_events`；同一 Promise、动作和章节幂等。
- 保存 Chapter Intent 和章节提交都会重复执行一次操作同步，因而不会产生重复事件。

确定性提示只做提醒：开放六章以上未推进标记 `promise.long_unadvanced`，开放十二章以上标记 `promise.aging`，开放中的 Promise 达到八条标记 `promise.overloaded`。这些提示不会自动改写大纲或正文。

## 3. AI 边界

章节生产上下文会读取：作者意图、当前 Chapter Intent、大纲任务、邻近大纲、作品档案、Story Bible/Canon、已确认摘要、开放 Promise 的年龄/最近推进/目标章节，以及正文版本依据。场景计划、正文、修订和结算共享同一份编译上下文。

滚动 Autopilot 规划会额外读取开放 Promise 和已有章节 Intent 中的推进/兑现安排，并把确定性承载量/老化提示作为规划输入。

网文规划 AI 只输出结构化候选：

1. 生成候选。
2. 展示 before/after、理由、影响和来源证据。
3. 作者逐项采纳或拒绝。
4. 采纳后才写入 Chapter Intent；候选过期时必须重新生成。

本轮不引入全量 Quality Gate，也不让 AI 直接生成正文来验证规划功能。

## 4. 数据与兼容

迁移 `063-chapter-intent-reader-promises`：

- 在 `chapter_briefs` 原表追加 Chapter Intent 字段。
- 新建 `reader_promises` 和 `reader_promise_events`。
- 旧项目、旧 ChapterBrief、旧快照和旧客户端继续可读。
- Narrative bundle 的 Promise 主表/事件表是可选段落；旧 bundle 缺少段落时按空数组恢复。
- 恢复、备份和 duplicate 会重映射项目、章节和 Promise ID，并保留生命周期事件。

相关 API：

- `GET/PUT /api/projects/:projectId/chapter-briefs/:outlineNodeId`：兼容入口，同时承载 Chapter Intent。
- `GET /api/projects/:projectId/reader-promises`：支持 `open`、`long_unadvanced`、`overloaded` 视图。
- `GET /api/projects/:projectId/reader-promises/:promiseId/events`：读取事件时间线。
- `POST /api/projects/:projectId/reader-promises`：登记 OPEN，按 requestId 幂等。
- `POST /api/projects/:projectId/reader-promises/:promiseId/actions`：作者确认 ADVANCE/PAYOFF。

## 5. 本地验证

领域、迁移、仓储、候选结构和旧 API 回归均使用本地 SQLite 与 fake/结构化测试。根据本轮要求，没有运行任何真实模型 API、`test:real*` 或 real-model smoke test。
