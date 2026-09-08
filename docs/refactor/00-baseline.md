# Phase 0 · 安全基线

日期：2026-09-07。产品：ChapterFlow · 文织·网文工坊。

上游：abligail/narralume，main `dfab1c2245b3cd49b3c2206e00dcb3dfcf3b3eb7`。
Fork：https://github.com/uuuuuuti/ChapterFlow。独立分支：`chapterflow/refactor`。

## 架构与数据流

- `apps/web`：React、React Query、React Router；工作区页面、浏览器内核 Worker。
- `apps/server`：Fastify 适配器、启动恢复、备份调度。
- `contracts`：跨端请求/响应、动作与资源限制。
- `domain`：故事实体、状态及基础领域规则。
- `persistence`：SQLite 仓储、迁移、版本、任务和恢复记录；同时支持服务端与浏览器 WASM。
- `context`：从故事事实构建上下文；`llm`：模型传输；`harness`：运行调度与步骤生命周期。
- `narrative`：规划、写作、审稿等 worker，依赖 context/domain/harness/llm/persistence。
- `services`：跨运行时服务与 HTTP 形状路由，依赖上述基础包，通过组合装配调用 narrative。

页面 → API transport → Fastify 或浏览器 kernel → services → 仓储/任务协调器 → narrative worker → 候选结果 → 作者采纳 → 正式版本与故事事实。

完整用户生命周期：设置模型 → 书架建书 → 作者意图与大纲 → 绑定章节文档 → 草稿/版本 → AI 章节/选区建议 → 采纳或拒绝 → 审稿与设定裁定 → 导出/备份。

## 不可破坏的行为

手工写作无需模型；AI 候选不能直接覆盖正文；草稿使用更新时间和基础版本并发保护；长任务由持久化协调器推进，离页/刷新可恢复；Story Bible 为统一故事事实；原 Studio、Bible、Autopilot 保留。

## 测试与证据

- `NODE_OPTIONS=--no-experimental-webstorage npm run verify`：通过。117 个测试文件、691 项测试；证据协议 5/5；类型、格式、lint、许可证与构建通过。
- `npm run test:e2e`：12 passed，12 skipped（上游按视口跳过高风险及 WASM spike 用例），四种视口的 UI 生命周期与浏览器内核主链通过。
- E2E 文件：product-lifecycle、high-risk-workflows、kernel-browser、sqlite-wasm-spike。
- 截图：`output/playwright/phase0-library.png`。
- 原始命令日志：`/tmp/chapterflow-baseline-{verify,e2e}.log`。

## 环境修复与风险

本机 Node 25.9.0 的实验性 Web Storage 与 jsdom 冲突，使 120 项测试失败；禁用该特性后全部通过。建议使用依赖支持的 Node 24 LTS。首次补装 Playwright Chromium。

上游 ESLint 未忽略生成的 playwright-report，E2E 后 verify 会扫描压缩脚本；本阶段仅补齐报告目录忽略，未修改业务行为。

技术债：API 单文件约 100KB；Studio 同时承载编辑、保存、选区与审稿；Assistant/Autopilot 组件较大；缓存键散落。迁移风险主要是缓存失效、未保存草稿丢失、候选与正式版本混淆及旧 URL 回归。

## 阶段边界

已完成基线、fork、分支、测试、截图。后续按 Phase 1 → 2 → 4；Phase 3/5/6/7 不在此次范围，发布保持手动导出。无数据库或 API Contract 改动。
