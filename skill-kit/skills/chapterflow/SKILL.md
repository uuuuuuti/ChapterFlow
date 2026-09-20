---
name: chapterflow
description: Coordinate web-fiction creation from book concept and long-form planning through drafting, revision, serial review, ending checks and manuscript export, using ChapterFlow story state and visual views.
---

# ChapterFlow

ChapterFlow is a headless professional capability layer for long-form web fiction. The host Agent remains the primary conversational interface and creative model.

## Route requests

- New idea, new book, positioning, packaging, opening design → `start-book`
- Plot direction, next chapter planning, arc structure, reader expectations → `plan-story`
- Draft, continue, rewrite or polish a chapter → `write-chapter`
- Diagnose prose/opening/story problems and propose revisions → `novel-editor`
- Prepare a Fanqie submission/signing package → `signing-sprint`
- Ask what Fanqie officially says → `fanqie-writing`
- Ask to see relationships, timeline, promises, foreshadows, story map or health visually → `story-visualizer`

## Non-negotiable runtime rules

1. The host Agent writes and reasons. Do not call a second model merely because ChapterFlow exists.
2. Read authoritative project context through `chapterflow_context` before substantial planning or writing.
3. Generated formal changes must normally be staged with `chapterflow_candidate_stage` and accepted only after the author approves them.
4. Never silently overwrite manuscript, positioning, story engine, packaging or opening blueprint.
5. Treat official knowledge and ChapterFlow editorial inference as different evidence types.
6. Never promise signing, recommendation, royalties, rankings or commercial results.
7. Use visual views when relationships or chronology are easier to understand spatially than in prose.

## Project convention

A ChapterFlow project is a normal folder containing `chapterflow.json`, Markdown manuscript files and `.chapterflow/state.sqlite`. The runtime must remain usable without any Web application.

## 全流程与恢复工作

先确定作者正在开书、规划、写作、修订、连载复盘还是收尾交付；已有作品直接从当前阶段继续。读取项目摘要、对应任务上下文和待确认候选，复述当前进度与下一项具体产出。不要为了走流程重复创建已有作品或重做已确认定位。

- 人物成长、世界规则与故事机制：start-book；用实体 attrs 记录目标、秘密、知识边界，用关系章节区间记录变化。
- 全书→分卷/故事弧→章节→场景：plan-story；正式计划用 story_plan 候选保存。
- 正文→自检→审稿→修订→确认→更新事实：write-chapter 与 novel-editor。
- 连载中每个故事弧结束：核对主线进展、人物变化、未回收承诺、已发生事件与下一弧入口。
- 完结：核对核心冲突、人物选择、读者承诺与伏笔的最终状态，区分刻意留白与遗漏。
- 投稿/交付：signing-sprint；通过 chapterflow_manuscript_export 导出已确认正文和版本清单。没有外部发布集成，不声称已经投稿。

需要可执行参数、断点续写或交付规范时读取 [全流程操作契约](references/workflow.md)。缺少 MCP 时可用 Node.js 24 运行仓库的 skill-kit/bin/chapterflow.mjs call <tool> --json '<参数>'；找不到 Runtime 时说明当前只能提供草案，不虚构工具调用成功。
