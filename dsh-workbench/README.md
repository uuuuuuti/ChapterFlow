# ChapterFlow Workbench · DeepSeek Harness Edition

这是 ChapterFlow 的一条独立产品线：基于 **DeepSeek Harness** 构建面向网文创作的垂直协作 Agent 工作台。

本目录与现有 ChapterFlow Web、Signing Sprint、Skill Kit 相互独立，不复用旧项目的 UI、路由或运行时实现；后续实现仅在 `dsh-workbench/` 下展开。

## 产品定位

ChapterFlow Workbench 不是“给编辑器加一个聊天框”，而是让通用 Agent 真正管理一本网文从创意到持续连载的作品生命周期：

**脑洞 → 开书 → 定位 → Story Engine → 包装 → 开篇规划 → 章节写作 → 长篇记忆 → AI 责编 → 修改复检 → 签约准备 → 连载**

DeepSeek Harness 负责通用 Agent 基础设施：

- Session / Agent Loop
- Goal
- Workflow
- Subagent
- Skill
- Tool
- Approval
- Model / Provider
- Web Client 与可扩展 UI

ChapterFlow 只实现 Harness 不知道的“小说专业能力”：

- Book Lifecycle
- Story Domain
- Story Memory
- Reader Memory
- Context Compiler
- Candidate / Review
- Fanqie Knowledge
- Novel-specific Visualizations

## 当前进度

**Architecture V0.1 + Harness Adapter Spike V0.1 + Domain Core V0.1 + StartBook Workflow V0.1**

当前已经通过 CI 验证：

- 独立 `chapterflow` Harness Profile
- ChapterFlow Agent Preset
- model-facing Tool 注册
- `workflowEngine` 有界 Workflow façade
- Subagent delegation 边界
- Harness Web Client Slot
- Harness Web Host 真实启动与认证访问
- `BookProject` 与 deterministic Lifecycle
- Candidate-first 正式变更
- Project revision 乐观锁
- stale Candidate 拒绝落盘
- 生命周期阶段顺序约束
- 本地持久化 Project Store
- Session-independent 项目重开
- `@chapterflow/start-book` 独立领域能力包
- `chapterflow_start_book` 固定 Workflow façade
- Specialist → Critic → Lead Editor 三段开书协作
- 六阶段 StartBook 结构化输出校验
- Workflow 期间 revision 冲突保护
- 完整 `idea → opening_blueprint → first_3_chapters` Candidate/Accept 状态机验收

当前仍未实现 Chapter 正文版本、Context Compiler、Story Memory、Reader Memory、AI 责编。

## 快速运行

要求 Node.js 24+。

~~~bash
cd dsh-workbench
npm install
npm run typecheck
npm test
npm run dev
~~~

`npm run dev` 会自动：

1. 编译 ChapterFlow Adapter 与 Client UI；
2. 从 Harness `web` 模板初始化独立 `chapterflow` Profile；
3. 将本地 ChapterFlow 插件安装到该 Profile；
4. 加载 ChapterFlow overlay 并启动 Harness Web。

终端会打印带认证 token 的本地访问地址。

配置模型后，可以在 `ChapterFlow Spike` Session 中测试 Harness Workflow；同时已经可以直接使用以下领域 Tool：

- `chapterflow_book_create`
- `chapterflow_book_get_state`
- `chapterflow_book_get_next_action`
- `chapterflow_start_book`
- `chapterflow_candidate_stage`
- `chapterflow_candidate_accept`
- `chapterflow_candidate_reject`

例如先验证 Adapter：

~~~text
调用 chapterflow_adapter_status，告诉我返回结果。
~~~

以及：

~~~text
调用 chapterflow_workflow_spike，
topic 设置为 "ChapterFlow Harness integration"。
~~~

## 架构文档

- [ARCHITECTURE.md](./docs/ARCHITECTURE.md) — 总体架构、职责边界、生命周期、Harness 映射、UI 与运行时
- [DOMAIN-MODEL.md](./docs/DOMAIN-MODEL.md) — 小说领域模型、状态与存储规范
- [V1-ACCEPTANCE.md](./docs/V1-ACCEPTANCE.md) — 第一阶段实现范围与端到端验收标准
- [ADAPTER-SPIKE.md](./docs/ADAPTER-SPIKE.md) — Harness Adapter Spike 的真实实现、验证结果、集成坑与已确认 ADR
- [START-BOOK.md](./docs/START-BOOK.md) — StartBook 六阶段 Workflow、Candidate 边界、结构契约与并发保护

## 关键原则

1. **Harness 是 Agent OS，不重造 Agent 基础设施。**
2. **Workflow 管流程，Agent 管执行，Skill 管方法，Tool 管真实数据。**
3. **Harness Session 保存 AI 行为历史；ChapterFlow Project Store 保存小说事实。**
4. **任何正式作品变更必须 Candidate-first / Reviewable。**
5. **长篇记忆分 Story Memory 与 Reader Memory 两个维度。**
6. **可视化不是附加页面，而是小说领域状态的一等投影视图。**
7. **第一版只证明一条真实链路：脑洞 → 前三章 → AI 责编 → 修改复检。**

## 下一阶段

Harness Adapter、Domain Core 与 StartBook 六阶段状态机已经验证完成。

下一步进入 **Chapter Writing Slice V0.1**：

`accepted opening_blueprint → Chapter 1 Intent → Context Packet → WriteChapter Workflow → Draft Candidate → Accept → Chapter Version`

优先实现：

1. Chapter aggregate 与正文版本；
2. 从 Opening Blueprint 投影 Chapter Intent 1–3；
3. Context Compiler V0.1；
4. `chapterflow_write_chapter` 有界 Workflow；
5. 第一章 Draft Candidate / Accept；
6. 接受后立即进入最小 Chapter Settlement，为 Story Memory / Reader Memory 铺路。

Domain Core 当前仍只允许按生命周期顺序接受开书 Artifact；已完成阶段的“回改 + 下游失效”将在 Revision Domain 中显式建模，不通过覆盖旧 Artifact 偷做。
