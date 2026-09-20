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

# Install

## Full workflow and visual workspace

The skills now cover planning beyond the opening, scene drafting, revision,
serial-arc review, ending checks and manuscript handoff. Stage `story_plan`
candidates with `arcs` and `chapters`; accepted plans merge by arc ID and chapter
index and feed both writing context and the story map. Updates replace each
submitted chapter plan completely; other chapters remain intact.

```bash
node skill-kit/bin/chapterflow.mjs view workspace --root ./novels/demo
node skill-kit/bin/chapterflow.mjs call chapterflow_manuscript_export --json '{"root":"./novels/demo"}'
```

The offline workspace includes six switchable views, shared search/chapter
filters, status filtering, relationship focus and zoom, complete relation tables,
timeline ordering, promise/foreshadow due reminders, chapter comparisons,
all-chapter text signals, JSON export and print. Regenerate snapshots after edits.
Story-time sorting is natural text sorting, not a semantic chronology resolver.
Graph arrows show source-to-target direction, not inferred relationship strength.
The export tool writes accepted Markdown plus a version/hash manifest; it does
not include unaccepted candidates or publish to a platform.

Runtime limitations: file/SQLite updates are not a cross-process transaction;
coordinate writes to one project serially. Existing chapter-title renames need
explicit file handling. Local platform knowledge remains a seed, not live rules.

## Requirements

- **Node.js 24+**
- A general Agent that can load local Skills and/or connect to MCP tools
- Git is recommended, but not required after the `skill-kit/` directory has been copied locally

No `npm install` is required for ChapterFlow Skill Kit V0.1.

Check Node.js first:

```bash
node --version
```

The output should be `v24.x.x` or newer.

## 1. Get the Skill Kit

If you are using this repository directly:

```bash
git clone https://github.com/uuuuuuti/ChapterFlow.git
cd ChapterFlow
git checkout chapterflow/skill-kit-v0.1
```

The independent Skill Kit lives in:

```text
ChapterFlow/skill-kit/
```

You can also copy the entire `skill-kit/` directory to another location. It does not need the existing ChapterFlow Web application to run.

## 2. Install the Skills

The Skill files are located in:

```text
skill-kit/skills/
├── chapterflow/
├── start-book/
├── plan-story/
├── write-chapter/
├── novel-editor/
├── signing-sprint/
├── fanqie-writing/
└── story-visualizer/
```

### Recommended: install all Skills

Register or copy all eight directories into the **local Skills directory used by your Agent**.

At minimum, install `chapterflow`, because it is the root router. For the complete ChapterFlow workflow, install all of them.

If your Agent supports adding a local Skill directory directly, point it to:

```text
/absolute/path/to/ChapterFlow/skill-kit/skills
```

If your Agent expects every Skill to be copied into its own Skills directory, use the equivalent of:

```bash
cp -R /absolute/path/to/ChapterFlow/skill-kit/skills/* "$AGENT_SKILLS_DIR/"
```

Or create symbolic links so future `git pull` updates are picked up automatically:

```bash
mkdir -p "$AGENT_SKILLS_DIR"
for skill in /absolute/path/to/ChapterFlow/skill-kit/skills/*; do
  ln -sfn "$skill" "$AGENT_SKILLS_DIR/$(basename "$skill")"
done
```

On Windows PowerShell, copying is usually simpler:

```powershell
Copy-Item -Recurse -Force "C:\path\to\ChapterFlow\skill-kit\skills\*" "$env:AGENT_SKILLS_DIR"
```

`$AGENT_SKILLS_DIR` is only a placeholder in these examples. Replace it with the actual local Skill directory configured by your Agent. Different Agent products use different installation locations, so ChapterFlow does not assume a vendor-specific path.

### Skills-only mode

You may install only the `SKILL.md` files if you want the Agent to learn the ChapterFlow workflows and methods.

However, **Skills-only mode does not provide the full ChapterFlow experience**. Durable project state, Candidate acceptance, Reader Promise lifecycle, official knowledge retrieval, review tools and HTML visualizations are provided by the Runtime/MCP tools below.

For normal use, install **Skills + MCP Runtime**.

## 3. Connect the MCP Runtime — recommended

Start the MCP server with:

```bash
node /absolute/path/to/ChapterFlow/skill-kit/bin/chapterflow-mcp.mjs
```

In practice you normally do not start it manually. Add it to your Agent's MCP configuration so the Agent starts it when needed.

Generic MCP configuration:

```json
{
  "mcpServers": {
    "chapterflow": {
      "command": "node",
      "args": [
        "/absolute/path/to/ChapterFlow/skill-kit/bin/chapterflow-mcp.mjs"
      ]
    }
  }
}
```

Restart or reload the Agent after changing its Skill/MCP configuration.

You can verify that the Runtime itself loads with:

```bash
node /absolute/path/to/ChapterFlow/skill-kit/bin/chapterflow.mjs tools
```

If installation is correct, the command prints the ChapterFlow tool list.

## 4. Create or bind a novel project

### Create a new project

```bash
node /absolute/path/to/ChapterFlow/skill-kit/bin/chapterflow.mjs init ./novels/demo \
  --title "七秒之后" \
  --premise "落魄刑警能听见死者临终前七秒的声音" \
  --genre "都市悬疑"
```

This creates a portable project folder containing Markdown manuscript files and `.chapterflow/state.sqlite`.

### Bind one project to the Agent

If you mainly work on one novel, set `CHAPTERFLOW_PROJECT` in the MCP configuration:

```json
{
  "mcpServers": {
    "chapterflow": {
      "command": "node",
      "args": [
        "/absolute/path/to/ChapterFlow/skill-kit/bin/chapterflow-mcp.mjs"
      ],
      "env": {
        "CHAPTERFLOW_PROJECT": "/absolute/path/to/my-novel"
      }
    }
  }
}
```

After this, most tool calls do not need to repeat the project path.

If you work on multiple novels, omit `CHAPTERFLOW_PROJECT` and let the Agent pass the appropriate project root when calling ChapterFlow tools.

## 5. Verify the complete installation

After installing the Skills and MCP Runtime, start a new Agent conversation and try:

```text
使用 ChapterFlow 帮我开一本番茄男频都市悬疑小说。
核心脑洞：一个落魄刑警能听见死者临终前七秒的声音。
先做作品定位，不要直接写正文。
```

A correctly installed Agent should:

1. route the request to the ChapterFlow/start-book workflow;
2. use ChapterFlow project/context or knowledge tools when appropriate;
3. generate a positioning candidate instead of silently overwriting formal project state;
4. ask for author confirmation before accepting formal creative decisions.

Then try a visual request:

```text
把当前作品的人物关系可视化给我看。
```

After story data exists, `story-visualizer` can call the ChapterFlow view tools and generate a standalone HTML file under:

```text
<novel-project>/outputs/
```

## 6. Minimal installation choices

| Mode                    | Install              | Suitable for                                |
| ----------------------- | -------------------- | ------------------------------------------- |
| Skill instructions only | `skill-kit/skills/*` | Trying the workflow/prompt methodology      |
| **Recommended**         | Skills + MCP Runtime | Real writing projects with persistent state |
| Runtime only            | MCP / CLI            | Custom Agent orchestration or development   |
| CLI only                | `chapterflow.mjs`    | Automation, debugging and manual inspection |

For normal AI-assisted novel writing, use **Skills + MCP Runtime**.

## 7. Upgrade

When using Git:

```bash
cd /absolute/path/to/ChapterFlow
git pull
```

If you installed Skills with symbolic links, no additional copy step is needed. If you copied the Skill directories, copy the updated `skill-kit/skills/*` directories again.

Restart/reload the Agent after updating Skill or MCP files.

Before upgrading a long-running writing project, keeping a normal filesystem backup of the novel project directory is recommended.

## 8. Uninstall

To remove ChapterFlow from an Agent:

1. remove the ChapterFlow Skill directories from the Agent's local Skills directory;
2. remove the `chapterflow` MCP entry from the Agent configuration;
3. restart/reload the Agent.

Your novel project folders are independent data. Do **not** delete them unless you also want to delete the manuscript and ChapterFlow project state.

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
