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

## 全文与修订闭环

中后期审稿读取目标章及因果关联章节；chapterflow_review_opening 仅覆盖开篇，不用于声称全书已审完。可用 chapter_health 视图检查任意章节的确定性信号，再由宿主模型评估叙事质量。

问题清单记录章节/段落或短引文、问题、读者影响、修改方向与优先级。区分事实矛盾、计划偏离、语言问题和创作偏好；保留有效张力与作者风格。对照本章计划检查是否兑现目标，再检查上下章是否连贯。修改后逐项说明已解决、保留及待决定事项，不能把没有触发规则视为质量合格。

阶段复盘与完结审稿重点查看：主线有没有实质进展、人物选择是否导致变化、能力代价是否兑现、伏笔是否有证据回收、承诺是否仍值得保留。任何正式改写走章节候选；不要自动把审稿推测写成事实。
