# ChapterFlow Skill Kit V0.1

ChapterFlow Skill Kit is a **headless, Agent-first web-fiction capability layer**. It can be used without the existing ChapterFlow Web application.

The host Agent (Luna Max, ChatGPT, Claude, Codex, an IDE Agent, or an enterprise Agent) remains responsible for conversation, reasoning and prose generation. ChapterFlow provides durable story state, traceable Fanqie knowledge, candidate-first mutations, consistency context, review signals and optional visual views.

## What is included

### Skills

- `chapterflow` — root router
- `start-book` — premise → positioning → story engine → packaging → opening blueprint
- `plan-story` — arc/chapter intent and Reader Promise planning
- `write-chapter` — host-model prose generation with safe candidate persistence
- `novel-editor` — opening/chapter editorial review
- `signing-sprint` — signing-preparation review
- `fanqie-writing` — sourced Fanqie official knowledge
- `story-visualizer` — relationship/timeline/promise/foreshadow/story/health HTML views

### Runtime

The runtime uses only Node.js 24 standard-library modules. No Web framework or npm dependency is required.

A project folder looks like:

```text
my-novel/
├── chapterflow.json
├── manuscript/
│   ├── 001-第一章.md
│   └── 002-第二章.md
├── outline/
├── characters/
├── world/
├── notes/
├── outputs/
└── .chapterflow/
    └── state.sqlite
```

Markdown is the human/Agent-readable manuscript source. SQLite stores IDs, versions, candidates, relationships, timeline events, foreshadows and Reader Promise lifecycle state.

## CLI

```bash
node skill-kit/bin/chapterflow.mjs init ./novels/demo \
  --title "七秒之后" \
  --premise "落魄刑警能听见死者临终前七秒的声音" \
  --genre "都市悬疑"

node skill-kit/bin/chapterflow.mjs summary ./novels/demo
node skill-kit/bin/chapterflow.mjs context ./novels/demo --task write-chapter --chapterIndex 1
node skill-kit/bin/chapterflow.mjs review signing --root ./novels/demo
node skill-kit/bin/chapterflow.mjs view character_graph --root ./novels/demo
```

Set `CHAPTERFLOW_PROJECT=/absolute/path/to/novel` to avoid repeating the project root.

## MCP

Run:

```bash
node /absolute/path/to/skill-kit/bin/chapterflow-mcp.mjs
```

Generic MCP configuration shape:

```json
{
  "mcpServers": {
    "chapterflow": {
      "command": "node",
      "args": ["/absolute/path/to/skill-kit/bin/chapterflow-mcp.mjs"],
      "env": {
        "CHAPTERFLOW_PROJECT": "/absolute/path/to/my-novel"
      }
    }
  }
}
```

The server exposes tools for project context, candidate staging/acceptance, chapters, story entities, relationships, timeline, foreshadows, Reader Promises, official knowledge, opening/signing review and visual rendering.

## Host Model First

Do **not** route the host Agent into another LLM by default.

Recommended flow:

```text
User
  ↓
General Agent / Host Model
  ↓
ChapterFlow context + official knowledge
  ↓
Host Model creates plan/prose
  ↓
ChapterFlow candidate.stage
  ↓
Author approval
  ↓
ChapterFlow candidate.accept
```

This keeps ChapterFlow lightweight and avoids duplicated model cost/latency.

## Candidate-first safety

Generated formal content should be staged before persistence:

- book positioning
- story engine
- selected packaging
- opening blueprint
- chapter drafts

Candidates record the project version at generation time. Acceptance fails after intervening project mutations, preventing an old Agent response from silently overwriting newer author work.

## Visual views

`chapterflow_view_render` generates a standalone interactive HTML snapshot in `outputs/`:

- `character_graph`
- `timeline`
- `promise_board`
- `foreshadow_map`
- `story_map`
- `chapter_health`

These are views, not a new Web control panel. The complete writing workflow remains usable without a browser.

## Fanqie official knowledge

V0.1 ships a small structured seed of source metadata and distilled knowledge cards. It intentionally does not mirror full official articles. Platform-specific claims should retain source links and authority type, and uncertain/current requirements must be treated as unconfirmed rather than guessed.

The next knowledge iteration should add live source refresh, semantic diff and human activation without changing Agent behavior silently.

## Test

```bash
node --test skill-kit/test/*.test.mjs
```

The repository also contains a dedicated GitHub Actions workflow that validates the standalone runtime on Node.js 24 without installing the existing ChapterFlow application dependencies.
