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

## 投稿材料与完结交付

准备书名/简介/标签、核心卖点、故事梗概、人物介绍、已确认开篇与待核实的当前平台要求。区分“材料缺失”“编辑建议”“官方要求待核实”；本地三章工作法不是平台硬门槛。

调用 chapterflow_manuscript_export，可用 fromChapter/toChapter 选择范围；返回 manuscript.md 与 manifest.json 的实际路径和章数。它导出已确认 Markdown，不包含待确认候选，不自动提交平台。交付前核对章节顺序、缺章、标题、敏感个人信息、授权素材和作者指定格式；若需要其他格式，说明另外需要的工具与实际完成状态。

完结前结合 promise_board 和 foreshadow_map 逐项确认回收、刻意留白与遗漏。prepared 只描述本地准备状态；官方要求未核实时单独列出待核对项。
