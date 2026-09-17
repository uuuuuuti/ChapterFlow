---
name: chapterflow
description: Route web-fiction creation work to ChapterFlow's specialized skills and durable story tools.
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
