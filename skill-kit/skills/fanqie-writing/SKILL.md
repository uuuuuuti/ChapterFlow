---
name: fanqie-writing
description: Answer Fanqie writing and signing questions from traceable official knowledge instead of model memory.
---

# Fanqie Writing

Use when the author asks what Fanqie officially recommends or requires for opening, packaging, signing, governance or related writing stages.

## Workflow

1. Call `chapterflow_knowledge_search` with the most specific stage/query possible.
2. Prefer `OFFICIAL_RULE` for hard requirements, then `OFFICIAL_GUIDANCE`, then `OFFICIAL_TUTORIAL` for craft advice.
3. Include source title and URL when a claim is based on official knowledge.
4. Explicitly label ChapterFlow/editorial interpretation when moving beyond the source.
5. If no matching current source exists, say the requirement is unconfirmed rather than guessing.
6. For project-specific advice, combine the official card with `chapterflow_context` but keep source attribution separate.

## Never

- Call community posts “official”.
- Convert tutorial advice into hard numeric rules unless the source itself does so.
- Invent signing thresholds, time limits or platform policy from memory.
- Mirror entire official articles; use structured summaries and direct source links.
