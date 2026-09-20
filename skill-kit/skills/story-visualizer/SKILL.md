---
name: story-visualizer
description: Build an offline interactive story workspace to inspect character relationships, chronology, promises, foreshadow payoffs, full-book chapter plans and manuscript health with search, filters and detail views.
---

# Story Visualizer

Use when visual structure is more useful than prose: “show me the relationships”, “draw the timeline”, “what promises are still open?”, “visualize the outline”, or “show opening health”.

## Available views

- `character_graph` — characters/entities and current relationship edges; optionally filter by chapter.
- `timeline` — chronological story events with chapter references.
- `promise_board` — OPEN / ADVANCE / PAYOFF history for Reader Promises.
- `foreshadow_map` — introduced / target / resolved lifecycle.
- `story_map` — first arc / chapter purpose / conflict / expectation / hook / payoff.
- `chapter_health` — deterministic text signals for all accepted chapters, or a selected chapter.

## Workflow

1. Use the relevant read tools if a textual summary is also useful.
2. Call `chapterflow_view_render` with the selected type.
3. Return the generated HTML path and a concise explanation of what the author should look at.
4. Treat views as read-only analysis. A visualization must never silently mutate story state.

## Preference

Use a view instead of a long text dump when chronology, graph structure, lifecycle progression or chapter-to-chapter patterns are the core question.

## 默认使用统一梳理视图

跨人物、剧情与伏笔梳理时使用 chapterflow_view_render(type=workspace)。单个离线 HTML 包含六个视图、搜索、状态/章节筛选、完整资料展开、人物关系聚焦与缩放、关系表、JSON 导出和打印。生成后给出真实文件链接；不要只返回数据结构。

- 人物关系：箭头是 source→target，长名字和关系说明以详情/完整关系表为准；大图先搜索主角或聚焦邻居。
- 时间线：可切换叙述章节顺序/故事时间自然排序。相对时间、倒叙、不同历法无法靠字符串证明真实先后，需要作者核对。
- 期待与伏笔：显示目标章、推进/回收历史及逾期提醒；逾期仅相对最新正文与作者自己的计划。
- 剧情地图：汇总开篇、全篇 story_plan 和已有正文，用章节表比较目标、阻力、结果、期待、情绪与章尾。
- 章节体检：覆盖全部已确认章节，或指定 chapterIndex；没有规则触发不代表文学质量合格。

chapterIndex 参数用于人物关系有效区间、单章时间事件与体检，不是全书历史快照。页面章节筛选在期待/伏笔里匹配生命周期发生章或目标章。workspace 的各视图共享搜索与章节筛选；无匹配时清除筛选。基础实体缺失时说明缺失数据，先提出待确认补录方案，不编造人物或关系凑图。

视图是生成时快照，正文变更后重新生成。每次解读指出两三处具体可梳理的问题及对应记录，不凭布局位置推断亲疏、权力或因果。图表用于查看，修改通过原有候选/工具链完成。
