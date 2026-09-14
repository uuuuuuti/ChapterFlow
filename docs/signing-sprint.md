# 快速开书 / 签约准备工作流

快速开书（Signing Sprint）是 ChapterFlow 的产品工作流层，用来把一个模糊想法收敛为可继续写作的网文开篇。它复用现有作品档案、作者意图、大纲、章节文档、运行任务和审阅机制，不另建一套 Story Bible、Canon、Outline 或 AI Task 数据模型。

## 作者路径

界面保持六个核心步骤：

1. **方向**：记录 premise、题材、目标读者和核心阅读体验。可以从空白开始。
2. **定位**：明确一句话故事、核心创意、卖点、主角欲望、阻力、推进机制、核心冲突和长期期待，并做短期/中期/长期可持续性自检。
3. **人物与冲突**：把主角、主要对手或阻力、关键关系、世界规则和第一阶段冲突同步到作品设定与作者意图。
4. **作品包装**：维护书名、简介、标签等候选。AI 只生成候选，作者接受后才写入作品资料。
5. **开篇**：规划开篇读者承诺、钩子、信息揭示、前三章以及第一阶段（默认 10—20 章，可按实际需要调整）。前三章是本产品的检查方法，不是任何平台的硬性章数规则。
6. **写作与预检**：将已接受的开篇计划落为现有章节节点和章节意图，进入正文写作；作者可运行开篇信号检查和签约准备预检，再回到原文修改。

## AI 任务与候选原则

工作流支持以下结构化任务：

`BrainstormBookDirection`、`RefineBookPositioning`、`EvaluatePositioning`、`GenerateBookPackaging`、`EvaluateBookPackaging`、`GenerateOpeningBlueprint`、`EvaluateOpening`、`GenerateChapterFromIntent`、`SigningReadinessReview`。

AI 任务通过 `sprint.context → sprint.generate → sprint.stage` 三段式运行。模型结果必须先进入候选区，带有任务类型、理由、来源引用、运行 ID 和生成时的工作流版本；只有作者明确“采用”后才会改变作品档案、作者意图或章节规划。过期候选不能静默覆盖作者的新修改。

## 预检边界

开篇检查只报告可复核信号，例如字数、段落长度、对话占比、人物/专有名词密度、连续解释段、重复段落和视角提示词，并尽量保留可回到原文的位置。信号不是质量判决，也不生成平台分数或签约概率。

签约准备预检覆盖作品资料、内容存在性、承诺一致性、工作流内部一致性、官方知识匹配和技术安全。结果使用“可以准备提交”或“建议先处理问题”，不能承诺签约、通过、收益或平台结果。官方要求缺失或来源不可确认时必须标记为“未确认”。

工作流不自动发布、不提交平台、不模拟官方审核，也不新增登录、支付、推荐、社区、收益或平台数据看板。

## 数据与兼容性

迁移 `064-official-knowledge` 建立官方来源、知识卡、工作流和候选表；迁移 `065-signing-sprint` 作为产品能力版本标记。现有作品可以继续按原路径创作，快速开书只在作者选择进入时创建关联工作流，不强制重写旧项目。

主要接口：

- `GET /api/projects/:projectId/signing-sprint`
- `POST /api/projects/:projectId/signing-sprint`
- `PATCH /api/projects/:projectId/signing-sprint`
- `POST /api/projects/:projectId/signing-sprint/ai`
- `GET /api/projects/:projectId/signing-sprint/candidates`
- `POST /api/projects/:projectId/signing-sprint/candidates/:candidateId/decision`
- `POST /api/projects/:projectId/signing-sprint/opening-check`
- `GET|POST /api/projects/:projectId/signing-sprint/readiness`

写接口使用工作流版本做乐观并发控制；候选和接受动作会保留 provenance，方便审阅、恢复和后续追踪。

## 备份与真实模型验证

作品备份会连同快速开书工作流、候选、开篇计划、Chapter Intent 和 Reader Promise 一起保存；恢复副本会重映射项目、章节和文档 ID，运行 ID 不会被续跑，候选里的运行 provenance 会标记为已脱钩。

本地有真实模型配置时，可运行 `npm run test:real:signing-sprint -- --protocol=openai-responses` 验证一次结构化开书候选生成。缺少 API 配置时该检查会明确失败，不会用假响应冒充真实模型通过。
