# Phase 1 · 前端代码治理

## 已完成

- 将 `lib/api.ts` 拆成兼容导出入口，实现在 `shared/api` 的 client、types、projects、story、overview、writing、review、automation、assistant、models、skills、delivery、context、collaboration 模块中；请求、类型和双驱动传输不变。
- 新增 `shared/query/keys.ts`，统一现有主要项目缓存键，保留缓存身份。
- `shared/ui` 建立现有基础组件的统一入口，无重复实现。
- 从 Studio 抽出 `features/draft-autosave/use-draft-autosave.ts`：串行保存、700ms 防抖、冲突保护、外部版本同步、离页提醒；原 Studio 使用同一 hook。
- 从助手抽出 ConversationPicker；从 Autopilot 抽出任务选择及幂等请求状态模块。
- 忽略 Playwright CLI 临时快照。

## 验证

`NODE_OPTIONS=--no-experimental-webstorage npm run verify` 通过：691 项测试、类型、lint、格式、证据协议、许可证及构建。原生命周期 E2E 保持通过，详见 `/tmp/chapterflow-phase1-e2e.log`。

## 边界与风险

无数据库、Domain、API Contract、URL 或可见界面改变。原工作区继续可用。未一次性拆完所有大型组件；优先提取可被 V2 复用的稳定边界，避免机械拆分引入循环依赖。剩余风险主要是 V2 的草稿切换与 AI 采纳同步，将在 Phase 4 增加场景测试。

改动文件以本阶段 Git commit 为准；主要目录：shared/api、shared/query、shared/ui、features，以及原工作区的引用调整。
