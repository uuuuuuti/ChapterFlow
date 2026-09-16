---
name: story-visualizer
description: Render read-only visual views for character relationships, story timeline, reader promises, foreshadows, story map and opening health.
---

# Story Visualizer

Use when visual structure is more useful than prose: “show me the relationships”, “draw the timeline”, “what promises are still open?”, “visualize the outline”, or “show opening health”.

## Available views

- `character_graph` — characters/entities and current relationship edges; optionally filter by chapter.
- `timeline` — chronological story events with chapter references.
- `promise_board` — OPEN / ADVANCE / PAYOFF history for Reader Promises.
- `foreshadow_map` — introduced / target / resolved lifecycle.
- `story_map` — first arc / chapter purpose / conflict / expectation / hook / payoff.
- `chapter_health` — deterministic opening signals for the first chapters.

## Workflow

1. Use the relevant read tools if a textual summary is also useful.
2. Call `chapterflow_view_render` with the selected type.
3. Return the generated HTML path and a concise explanation of what the author should look at.
4. Treat views as read-only analysis. A visualization must never silently mutate story state.

## Preference

Use a view instead of a long text dump when chronology, graph structure, lifecycle progression or chapter-to-chapter patterns are the core question.
