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

**Architecture V0.1 + DeepSeek Harness Adapter Spike V0.1**

Adapter Spike 已经落地并通过 CI，当前已验证：

- 独立 `chapterflow` Harness Profile
- ChapterFlow Agent Preset
- model-facing Tool 注册
- `workflowEngine` 有界 Workflow façade
- Subagent delegation 边界
- Harness Web Client Slot
- 本地 ChapterFlow package 安装到隔离 Profile
- Harness Web Host 真实启动与认证访问

Spike 不包含小说 Domain Store，也不代表 StartBook / 写章 / 责编已经实现。

## 快速运行 Adapter Spike

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

配置模型后，可以在 `ChapterFlow Spike` Session 中测试：

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

## 关键原则

1. **Harness 是 Agent OS，不重造 Agent 基础设施。**
2. **Workflow 管流程，Agent 管执行，Skill 管方法，Tool 管真实数据。**
3. **Harness Session 保存 AI 行为历史；ChapterFlow Project Store 保存小说事实。**
4. **任何正式作品变更必须 Candidate-first / Reviewable。**
5. **长篇记忆分 Story Memory 与 Reader Memory 两个维度。**
6. **可视化不是附加页面，而是小说领域状态的一等投影视图。**
7. **第一版只证明一条真实链路：脑洞 → 前三章 → AI 责编 → 修改复检。**

## 下一阶段

Adapter Spike 结束后不继续扩 Harness 基础设施。

下一步进入 **Domain Core V0.1**：

`BookProject + Lifecycle + Candidate + Project Revision + local Project Store`

并暴露第一组真实领域 Tool：

`book.get_state / book.get_next_action / candidate.stage / candidate.accept / candidate.reject`

随后再实现第一个真实业务 Workflow：`start-book`。
