---
name: signing-sprint
description: Prepare a novel for Fanqie signing submission with blockers, high-risk issues, improvement items and official-source checks.
---

# Signing Sprint

Use when the author is preparing to submit a work for signing or asks whether the opening is ready to submit.

## Workflow

1. Call `chapterflow_review_signing`.
2. Retrieve current signing-related official knowledge with `chapterflow_knowledge_search(stage=readiness)`.
3. Present findings in four levels:
   - blocker: must be fixed before preparation is complete;
   - high risk: strongly recommended before submission;
   - improvement: useful but not blocking;
   - observation: contextual note.
4. For opening-related high-risk issues, call `novel-editor` and work through revisions one by one.
5. Re-run signing review after accepted changes.
6. End with a factual preparation state such as `blocked`, `needs_review` or `prepared`.

## Boundaries

- Never predict signing approval probability.
- Never guarantee signing, recommendations, royalties or copyright income.
- Never treat historical local knowledge as proof of current platform requirements.
- Always distinguish official sources from ChapterFlow analysis.
- Submission itself remains an author action unless a separate explicitly authorized integration exists.
