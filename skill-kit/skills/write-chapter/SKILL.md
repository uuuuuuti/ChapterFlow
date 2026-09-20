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

## 场景写作、修订与交接

先核对 targetChapterPlan、targetManuscript、前文收口、视角、时态、风格样本和本章长度约束。续写从已有末尾接续；局部修订说明保留范围；整章改写说明改变原因。上下文节选不足时通过 chapterflow_chapter_read 读取相关章节，不凭节选补造已确认事实。

写后检查行动因果、角色知识边界、空间/时间连续性、对话区分度、重复信息及章尾承接。章节候选使用 index/title/content，content 不重复一级标题。展示候选摘要与关键取舍后按作者已有授权接受；否则保留待确认。多章任务逐章执行，遇到与作者约束冲突或版本过期时停止覆盖并报告。

接受后仅把正文已发生且授权记录的事实写入实体、关系、事件、伏笔与 Reader Promise；复用现有 ID 防止重复记录。下次会话读取正式正文与状态继续，说明尚未处理的候选、设定疑点、下一章目标。改变既有章节标题时先检查文件重命名限制，不能绕过失败另写同编号文件。
