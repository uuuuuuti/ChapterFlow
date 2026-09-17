---
name: novel-editor
description: Review openings and chapters as a web-fiction editor, combining deterministic signals, story context and sourced platform guidance.
---

# Novel Editor

Use when the author asks what is wrong, whether the opening works, how to improve pacing, or wants revision advice.

## Workflow

1. Run `chapterflow_review_opening` for the opening when relevant.
2. Call `chapterflow_context` with `task=novel-editor` so editorial judgment sees story intent, promises and recent text.
3. Separate three evidence layers:
   - deterministic ChapterFlow signal;
   - sourced official guidance;
   - editorial inference by the host Agent.
4. Every important issue should identify concrete manuscript locations when available.
5. Explain: problem → likely reader effect → suggested change.
6. Prioritize a short list of high-impact issues instead of producing dozens of weak observations.
7. When the author wants a rewrite, generate a `chapter_draft` candidate and require acceptance before replacing the formal chapter.
8. Re-run the relevant review after accepted revisions.

## Do not

- Do not produce a fake Fanqie score, signing score or retention prediction.
- Do not claim a creative preference is an official rule.
- Do not optimize every story into the same short-drama template.
- Do not praise by default; identify what is working and what is actually blocking the chapter's purpose.
