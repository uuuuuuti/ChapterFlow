# ChapterFlow Workbench V1 Acceptance Specification

V1 的目标不是“功能很多”，而是证明 DeepSeek Harness + ChapterFlow Domain 能完成一条真实、可持续的网文协作链路。

---

## 1. North Star Scenario

用户输入一句脑洞：

> 一个普通银行职员突然可以看到别人未来 24 小时内的一次重大财务决定。

系统在不要求用户理解内部 Agent 架构的情况下完成：

~~~
脑洞
→ 作品方向
→ 定位
→ Story Engine
→ 包装
→ 开篇蓝图
→ 前三章 Intent
→ 第一章
→ 第二章
→ 第三章
→ AI 责编
→ 修改 Candidate
→ Diff
→ 用户接受
→ Recheck
~~~

全过程保留作品状态与可追踪修改。

---

## 2. Must-Have Capabilities

### Harness Integration

- 能以独立 Profile / Plugin 启动。
- 不修改 DeepSeek Harness 核心源码。
- 能注册 ChapterFlow Tools。
- 能运行至少一个 ChapterFlow Workflow。
- 能调用 Subagent。
- 能读取 Goal。
- 能在 Harness Web 中加载至少一个 ChapterFlow UI Projection。

### Project Store

- 能创建独立小说项目。
- 关闭 Session 后项目仍可重新打开。
- Harness Session fork 不复制或破坏项目事实。
- Project revision 有效。

### Start Book

至少生成并确认：

- Positioning
- Story Engine
- Packaging
- Opening Blueprint

所有正式结果必须先 Candidate。

### Writing

- 生成 Chapter Intent 1–3。
- 使用 Context Compiler 写三章真实正文。
- 每章正文作为 Candidate。
- 接受后创建版本。
- 接受后执行 Chapter Settlement。

### Memory

前三章结束后至少能正确查询：

- 主要人物当前状态
- 至少一条人物关系变化
- 至少三个 Timeline Event
- 至少一个 Reader Promise
- 至少一个 Promise ADVANCE
- Chapter Handoff

### Review

前三章后运行 Editor Review，至少覆盖：

- continuity
- opening/pacing
- reader promise
- AI voice

输出结构化 Review Finding。

### Revision

- 用户可以选择 Finding。
- 生成 Revision Candidate。
- UI 显示 Diff。
- 接受后只更新目标章节。
- Recheck 后 Finding 才关闭。

### Visualization

V1 强制实现：

1. Character Graph
2. Timeline

可选：

- Promise Board
- Story Map

---

## 3. Explicit Failure Tests

必须验证以下失败路径：

### Stale Candidate

1. 生成 Chapter 2 Candidate。
2. 修改影响 Chapter 2 的项目状态。
3. 再接受旧 Candidate。
4. 系统必须拒绝或要求 rebase。

### Session Independence

1. Session A 创建作品。
2. 关闭 Session A。
3. Session B 打开同一项目。
4. 正式 Domain State 必须完整。

### Workflow Failure

Workflow 中某 Subagent 失败时：

- 已接受的 Project State 不回滚。
- 未接受 Candidate 不自动进入正式状态。
- Workflow 明确报告 partial / blocked。

### Canon Conflict

Agent 尝试覆盖 locked Canon Fact 时：

- Tool 必须拒绝直接落盘。
- 返回 conflict。
- 用户需要明确决策。

### Review Provenance

每个 high-risk / blocker Finding 必须可定位到：

- 章节
- 证据
- 产生来源

---

## 4. UI Acceptance

### Book Navigator

用户打开项目后，无需问 Agent 就能看到：

- 当前 lifecycle stage
- 已完成阶段
- blocked / needs revision
- next action

### Agent Workspace

保持 Harness 原生 Agent 交互，不重新造聊天组件。

### Artifact Canvas

至少支持：

- Markdown Chapter
- Candidate Diff
- Character Graph
- Timeline
- Findings

---

## 5. Performance Budget

V1 不追求极限性能，但必须避免明显架构问题：

- 打开已有项目不要求把全书正文注入模型。
- `context.compile` 默认只选择相关上下文。
- Character Graph / Timeline 直接来自 Domain projection，不调用 LLM 才能展示。
- View 生成不修改作品状态。
- 三章项目下 Context Compiler 输出可解释 manifest。

---

## 6. Quality Gate

V1 只有在以下全部成立时才能标记 `architecture-proven`：

- Harness 真实运行，不是 mock Agent。
- 使用真实模型生成三章。
- 三章通过 Candidate 接受流程。
- Story Memory 与 Reader Memory 都有真实沉淀。
- Editor Review 真实运行。
- 至少一次 Revision → Diff → Accept → Recheck。
- Character Graph 与 Timeline 使用真实项目数据。
- 重新开启 Session 后项目继续可用。
- 自动测试覆盖 Domain Invariants。
- 不依赖旧 ChapterFlow Web Runtime。

---

## 7. Deferred

V1 验收明确不要求：

- 自动发布番茄
- 实时平台数据
- 收入预测
- 推荐算法
- IP 价值判断
- 全书 Autopilot
- 移动端
- 多人协作
- 云同步

这些不能成为 V1 延期理由。

---

## 8. Exit Criteria

当一个没有接触过 ChapterFlow 的作者能够只通过以下自然语言完成流程时，V1 才算成功：

> “我有个脑洞，帮我开一本书。”

随后不需要作者自己寻找“人物 Agent”“剧情 Agent”“责编 Agent”。

系统应主动告诉用户当前正在完成什么、为什么、还差什么，以及下一步是什么。
