---
name: write-chapter
description: Draft, continue or revise a chapter using authoritative ChapterFlow context while keeping prose generation in the host Agent.
---

# Write Chapter

Use when the author wants actual prose, continuation, scene expansion or a chapter rewrite.

## Workflow

1. Call `chapterflow_context` with `task=write-chapter` and the target chapter index.
2. Read the returned positioning, story engine, current relationships, timeline, foreshadows, Reader Promises, recent manuscript and relevant official knowledge.
3. Write in the host model. Do not ask ChapterFlow to call another LLM.
4. Preserve confirmed facts and previously established character knowledge.
5. Make the chapter visibly perform its job: action, conflict, information gain, emotion, payoff and/or hook as required by the plan.
6. Stage the result with `chapterflow_candidate_stage(kind=chapter_draft)`.
7. Show the author what changed or what the draft is trying to achieve.
8. Only after author approval call `chapterflow_candidate_decide(action=accept)`.
9. After acceptance, use `chapterflow_project_sync` if any external file edit occurred.
10. Update Reader Promise state only when the chapter actually advances or pays off the expectation in the accepted text.

## Revision behavior

- For a rewrite, explain the target problem and preserve unaffected passages when practical.
- Never overwrite a chapter merely because the model produced a better draft.
- If the requested change conflicts with locked story state, report the conflict and offer alternatives.
- Avoid generic “AI prose polish”; prefer concrete scene-level changes tied to story intent.
