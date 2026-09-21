# ChapterFlow Workbench · DeepSeek Harness Edition

这是 ChapterFlow 的一条独立产品线：基于 **DeepSeek Harness** 构建面向网文创作的垂直协作 Agent 工作台。

本目录与现有 ChapterFlow Web、Signing Sprint、Skill Kit 相互独立。当前阶段只定义架构规范，不复用旧项目的 UI、路由或运行时实现；后续实现仅在 `dsh-workbench/` 下展开。

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

## 架构文档

- [ARCHITECTURE.md](./docs/ARCHITECTURE.md) — 总体架构、职责边界、生命周期、Harness 映射、UI 与运行时
- [DOMAIN-MODEL.md](./docs/DOMAIN-MODEL.md) — 小说领域模型、状态与存储规范
- [V1-ACCEPTANCE.md](./docs/V1-ACCEPTANCE.md) — 第一阶段实现范围与端到端验收标准

## 关键原则

1. **Harness 是 Agent OS，不重造 Agent 基础设施。**
2. **Workflow 管流程，Agent 管执行，Skill 管方法，Tool 管真实数据。**
3. **Harness Session 保存 AI 行为历史；ChapterFlow Project Store 保存小说事实。**
4. **任何正式作品变更必须 Candidate-first / Reviewable。**
5. **长篇记忆分 Story Memory 与 Reader Memory 两个维度。**
6. **可视化不是附加页面，而是小说领域状态的一等投影视图。**
7. **第一版只证明一条真实链路：脑洞 → 前三章 → AI 责编 → 修改复检。**

## 当前状态

Status: **Architecture V0.1**

当前分支仅用于架构设计。没有宣称已有 DeepSeek Harness 插件或可运行的 ChapterFlow Workbench 实现。
