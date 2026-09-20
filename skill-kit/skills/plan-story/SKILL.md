---
name: plan-story
description: Plan arcs and chapters using durable story state, reader promises, timeline, foreshadows and existing manuscript context.
---

# Plan Story

Use for plot direction, arc planning, “what should happen next?”, chapter intent, pacing or long-form consistency questions.

## Workflow

1. Call `chapterflow_context` with `task=plan-story` and the target chapter when known.
2. Inspect open Reader Promises, timeline, foreshadows, relationships, recent manuscript and the current opening/arc plan.
3. Decide what this chapter or arc must accomplish before inventing scenes.
4. Prefer advancing or paying off existing promises before opening many new ones.
5. Produce a compact chapter intent containing:
   - chapter purpose;
   - protagonist action/goal;
   - conflict/obstacle;
   - reader expectation;
   - emotion target or curve;
   - information gain;
   - payoff;
   - ending hook;
   - Reader Promise operations.
6. If the plan changes formal foundation data, stage an appropriate candidate rather than mutating it silently.
7. Keep proposed Reader Promise operations in the plan. Record OPEN/ADVANCE/PAYOFF against confirmed manuscript events after author authorization; accepting a plan alone is not evidence that a payoff happened.

## Guardrails

- Do not solve consistency problems by silently rewriting Canon or historical events.
- Flag timeline, relationship or promise conflicts instead of hiding them.
- Avoid planning twelve nearly identical chapters. Prefer milestones and expand only the chapters needed next.
- If chronology or relationships become hard to reason about, use `story-visualizer` rather than dumping long prose summaries.

## 全书与滚动规划的保存契约

先提出终局方向和主要阶段转折，再展开下一弧与最近几章；远期保留可调整空间。每个故事弧说明目标、核心阻力、转折、代价、阶段兑现与下一弧入口。章内按场景拆分目标、冲突、变化和信息差，并标出人物知道/不知道的事实。

使用 chapterflow_candidate_stage(kind=story_plan) 保存：

```json
{
  "arcs": [
    {
      "id": "arc-2",
      "title": "证人失踪",
      "goal": "找到证人",
      "conflict": "对手提前布局",
      "payoff": "确认幕后身份"
    }
  ],
  "chapters": [
    {
      "index": 4,
      "arcId": "arc-2",
      "title": "空房间",
      "goal": "找到证人",
      "conflict": "房间被清空",
      "outcome": "发现证人主动逃走",
      "readerExpectation": "是谁威胁了证人",
      "emotionTarget": "紧张",
      "hook": "手机收到求救照片",
      "payoff": "排除绑架假设"
    }
  ]
}
```

确认后按 arc id / chapter index 合并更新，未列出的章节与故事弧保留。更新一章时提交该章的完整计划；省略字段不会继承旧章字段。图表与后续上下文都读取这些正式计划。

promiseOperations 只是规划意图：ADVANCE/PAYOFF 引用现有 ID，OPEN 描述新期待。不要在仅接受计划时宣称正文已兑现；按正式正文中实际发生的结果更新生命周期。改写历史章节时检查对后续剧情、知识边界、时间线和伏笔的影响。
