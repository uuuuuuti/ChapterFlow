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
