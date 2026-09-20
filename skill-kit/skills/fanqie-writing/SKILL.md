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

## 来源时效与创作阶段

本地 seed 是检索起点，不代表实时政策。回答规则时同时注明可查的发布日期/版本与核验状态；涉及当前签约、投稿、版权或收益条件而没有新近来源时，明确列为待核实，不把旧卡片当作现行承诺。若宿主具备联网能力，读取对应官方原文并标注本次核验日期。

开书用定位/包装指导，开篇用读者抓手与信息呈现指导，连载用持续期待与兑现建议，交付用当前材料与合规要求。检索无结果不意味着平台没有要求。官方规则、官方写作建议和本地编辑判断分开陈述，尊重作者自己的题材与风格选择。
