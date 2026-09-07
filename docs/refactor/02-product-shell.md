# Phase 2 · ChapterFlow 产品外壳

新增浅色蓝白设计系统、左侧导航、顶部搜索/设置/任务入口、作品页与创作首页。数据来自现有作品和 overview API，空状态不填充虚构的阅读量、收入或日写字数。

默认入口 `/books`；项目路径 `/books/:projectId/dashboard|outline|write|knowledge|analytics|publish`。原 `/shelf`、`/projects/:projectId/*` 和 `/settings` 保留，旧主链完全兼容。项目根路径跳转到 dashboard。写作页在此阶段暂接原 Studio，随后 Phase 4 增量替换。大纲/设定与手工导出继续复用原组件；数据页明确后续阶段开放。

提供精简手工建书入口，复用 createProject；AI 多方案开书与新导入流程属于 Phase 3，不在此次实现范围。

验证：完整 verify 通过（691 项测试）。新增四视口作品入口 E2E，验证首页、手工建书、创作首页、主导航术语与横向溢出。移动端按钮布局依据测试修正。视觉继续依据用户参考图调整。

Phase 1 补充：原 E2E 全量第一次 11 passed/1 failed/12 skipped，移动端本地库下载入口出现时序问题；该用例单独重跑通过。最终阶段再次全量验证，不删除用例。

主要改动：app/layouts/chapterflow-shell、pages/library、pages/dashboard、entities/project/queries、shared/ui、styles/chapterflow.css、features/task-progress、e2e/chapterflow.spec.ts。

无 Domain、Persistence 或 API Contract 改动。风险：新旧组件暂并存，部分高级编辑仍保留旧版外观；写作自动保存与 AI 采纳在 Phase 4 专门验证。
