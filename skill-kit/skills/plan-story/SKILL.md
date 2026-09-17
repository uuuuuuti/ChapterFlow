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
7. When a new expectation is intentionally created, call `chapterflow_reader_promise_open`; use transition tools for ADVANCE/PAYOFF only after the author confirms the plan.

## Guardrails

- Do not solve consistency problems by silently rewriting Canon or historical events.
- Flag timeline, relationship or promise conflicts instead of hiding them.
- Avoid planning twelve nearly identical chapters. Prefer milestones and expand only the chapters needed next.
- If chronology or relationships become hard to reason about, use `story-visualizer` rather than dumping long prose summaries.
