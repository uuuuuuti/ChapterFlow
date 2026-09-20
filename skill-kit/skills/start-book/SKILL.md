---
name: start-book
description: Turn a rough web-fiction idea into positioning, story engine, packaging and an opening blueprint.
---

# Start Book

Use when the author wants to start a new novel or rework an undeveloped idea.

## Goal

Move from a rough premise to an author-approved foundation that is ready for chapter planning and writing.

## Workflow

1. Create/open the project with `chapterflow_project_init` / `chapterflow_project_summary`.
2. Call `chapterflow_context` with `task=start-book`.
3. Clarify only missing decisions that materially affect the book; do not turn the workflow into a questionnaire.
4. Generate a `book_positioning` candidate covering at least: one-line story, core idea, selling points, target reader, protagonist desire, obstacle, core conflict and long-term expectation.
5. After author approval, accept it with `chapterflow_candidate_decide`.
6. Generate a `story_engine` candidate: protagonist, relationships, antagonist/pressure, core mechanism, mechanism cost/boundary, world rules and first-stage conflict.
7. Generate several genuinely different packaging directions; stage the selected result as `packaging` only after comparison.
8. Generate an `opening_blueprint` with exactly three detailed opening chapters plus a lightweight first-stage plan.
9. Open the most important initial Reader Promise when the author confirms it.
10. End by telling the author what the next concrete writing action is.

## Quality principles

- Prefer a sustainable story engine over a single clever gimmick.
- Make packaging promise the same experience the opening will actually deliver.
- The first three chapters are a ChapterFlow working method, not an invented platform rule.
- Use `chapterflow_knowledge_search` for official Fanqie guidance. Never rely on model memory for current platform rules.
- Never invent signing probabilities or “hit potential” scores.

## 人物、世界与开篇落地

保留作者指定题材、风格、受众和篇幅；未决定项以明确假设或可选方案呈现。设定需要说明限制、代价与冲突来源。主角写清欲望、弱点、主动选择和成长方向；配角写清独立目标与关系张力，避免只作功能道具。

包装比较展示完整书名、简介、标签、目标读者及兑现依据；确认一个版本后再保存。开篇中每章给出目标→阻力→选择→结果→新问题，三章之外规划第一弧关键转折。确认故事发动机不会自动建立实体图：按作者确认结果创建实体、关系和世界规则记录，再生成 workspace 检查是否一致。
