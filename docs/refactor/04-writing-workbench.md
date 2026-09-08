# Phase 4 · ChapterFlow 三栏写作台

Phase 4 将 `/books/:projectId/write` 与 `/books/:projectId/write/:chapterId` 落成 ChapterFlow 的主要创作面：左侧章节树、中间正文编辑器、右侧本章/AI/检查助手。章节树支持新建章节、切换章节和从大纲直接进入对应正文；空作品仍能先建章节再写作。

正文保持作者可控的候选工作流：700ms 草稿自动保存，离页、刷新、版本创建和 AI 操作前执行 flush；失败时保留原文并显示“重试保存”，重试会强制提交当前内容。服务端草稿沿用基础版本与更新时间并发保护，检测到冲突时不会静默覆盖。

助手面板包含章纲上下文、续写/重写/扩写/压缩、对话/冲突/爽点/悬念等快捷动作，以及选区 AI 工具。生成结果先进入候选卡片，作者可接受或拒绝；接受前会再次保存正文并校验草稿未被其他版本改变。检查面板展示语义检查、章节结算与结构化建议，任务中心可在离开写作页后继续查看运行状态和回传的候选稿。

历史版本抽屉支持创建版本、查看版本正文、恢复版本和恢复前确认；恢复后正文与服务端查询同步，刷新仍能还原同一版本。专注模式只收起辅助区，不改变保存与任务生命周期。

## 交付范围

- `features/chapter-editor`：编辑器、版本抽屉、候选采纳与正文状态。
- `features/chapter-tree`：章节导航和空状态入口。
- `features/chapter-ai`：快捷动作和请求状态。
- `features/chapter-review`：检查结果与候选裁定。
- `features/draft-autosave`：串行保存、冲突保护、离页 flush 与强制重试。
- `features/task-progress`：任务抽屉、运行步骤和候选结果。
- `pages/writing`：项目章节路由与新建章节流程。
- `scripts/chapterflow-e2e-model.ts`：仅 E2E 使用的确定性 AI 回传，不影响生产传输。

原 `/projects/:projectId/studio` 及 `/shelf` 工作区仍按上游路径保留，便于已有数据与旧链接继续使用；新入口统一显示 ChapterFlow · 文织·网文工坊。

## 验证

- `npm run verify`：格式、lint、类型、117 个测试文件/691 项测试、证据协议、许可证和生产构建。
- `CHAPTERFLOW_E2E_SUCCESS_MODEL=1 npm run test:e2e -- e2e/chapterflow.spec.ts e2e/chapterflow-ai.spec.ts e2e/chapterflow-resilience.spec.ts`：四种视口覆盖作品入口、手工写作、版本恢复、大纲衔接、AI 候选采纳、任务离页恢复、选区改写、检查、保存失败重试和本地模式。
- `npm run test:e2e`：上游真实故障与恢复用例继续运行；模型相关新用例仅在显式开启确定性测试模型时执行。

视觉依据：`参考 UI 图/` 中的作品库、创作首页、写作台、资料卡和导航参考；最终截图保存在 `output/playwright/chapterflow-library-empty.png` 与 `output/playwright/chapterflow-writing.png`。

## 未纳入本轮

多方案 AI 开书、平台数据接入、自动发布、云端协作和 Phase 3/5/6/7 仍保留在后续范围；发布页本轮提供手工导出入口，不伪造平台指标。
