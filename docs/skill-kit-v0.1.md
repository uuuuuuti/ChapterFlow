# ChapterFlow Skill Kit V0.1

## Decision

The Skill Kit is an independent capability set inside the repository. It does **not** require the existing ChapterFlow Web application at runtime and may later be extracted to its own repository.

The Web product remains untouched in this branch. Its role is no longer assumed to be the primary user interface for the Skill Kit.

## Product model

```text
General-purpose Agent / Host Model
            |
            | Skills + MCP/CLI tools
            v
     ChapterFlow Skill Kit
            |
     +------+-------+----------------+
     |              |                |
 Story state   Official knowledge   Review
     |              |                |
     +--------------+----------------+
                    |
             Project workspace
       Markdown + JSON + SQLite
                    |
             Optional HTML Views
```

### Host Model First

The host Agent performs reasoning and prose generation. The runtime does not call another model by default.

ChapterFlow is responsible for:

- durable story state;
- compact context assembly;
- Reader Promise lifecycle;
- story relationships, timeline and foreshadow state;
- traceable Fanqie official knowledge;
- candidate/version safety;
- deterministic review signals;
- signing-preparation checks;
- visualization specs and HTML rendering.

## Skills

The root `chapterflow` skill routes to seven specialized skills:

1. `start-book`
2. `plan-story`
3. `write-chapter`
4. `novel-editor`
5. `signing-sprint`
6. `fanqie-writing`
7. `story-visualizer`

Skills contain workflow and behavior guidance, not duplicated story content or copied course articles.

## Runtime boundary

`skill-kit/runtime` is built using Node.js 24 standard-library APIs only.

- `project.mjs` — workspace and Markdown manuscript indexing
- `state.mjs` — built-in SQLite schema
- `candidates.mjs` — candidate-first formal mutations and stale guard
- `story.mjs` — entities, relationships, timeline, foreshadows and Reader Promises
- `knowledge.mjs` — structured official knowledge retrieval
- `context.mjs` — host-Agent task packets
- `review.mjs` — opening signals and signing-preparation review
- `view-spec.mjs` — normalized visualization contracts
- `tools.mjs` — MCP/CLI-safe tool registry

## Persistence

The design intentionally uses two layers:

### Human/Agent-readable files

- `chapterflow.json`
- `manuscript/*.md`
- future `outline/`, `characters/`, `world/`, `notes/` mirrors

### Machine state

`.chapterflow/state.sqlite` stores IDs, hashes, versions, candidate decisions, relationships, timeline events, Reader Promise events and other indexed state.

This keeps the project understandable to file-oriented Agents while preserving transactional state where it matters.

## Candidate-first contract

AI-generated formal changes are not committed immediately.

```text
Host Agent generates
      ↓
chapterflow_candidate_stage
      ↓
Author reviews
      ↓
accept / reject
      ↓
Formal project state
```

The candidate records the project version used at generation time. Acceptance fails if the project changes in between, preventing stale Agent output from overwriting newer author work.

V0.1 covers candidates for:

- book positioning;
- story engine;
- packaging;
- opening blueprint;
- chapter draft.

## Visualization

The visual layer is deliberately **not** a permanent dashboard.

`chapterflow_view_render` creates a self-contained HTML snapshot in the project's `outputs/` directory.

Available views:

- character relationship graph;
- story timeline;
- Reader Promise board;
- foreshadow map;
- story map;
- opening chapter health.

Views are read-only and derive from the same project state used by the Agent.

## Official knowledge

V0.1 contains a small structured Fanqie seed containing metadata, source URLs, authority type and distilled knowledge cards. It is not an article mirror.

Next iteration should add:

```text
Fetch
→ Extract main article
→ Semantic diff
→ Extract claims
→ Candidate Knowledge Cards
→ Human review
→ Activate
```

A remote source update must never silently change active Agent guidance.

## Validation

`.github/workflows/skill-kit-test.yml` runs on Node.js 24 without installing the existing ChapterFlow application dependencies.

The acceptance test covers:

```text
blank workspace
→ positioning candidate
→ story-engine candidate
→ packaging candidate
→ opening blueprint
→ three accepted Markdown chapters
→ entities + relationship
→ timeline + foreshadow
→ Reader Promise OPEN/ADVANCE
→ host-Agent context
→ opening review
→ signing review
→ HTML visualizations
→ stale-candidate rejection
```

This is the V0.1 proof that the capability layer can operate independently from the Web application.

## Not in V0.1

- live browser server / auto-refresh views;
- automatic Fanqie source crawling and semantic diff;
- automatic third-party publishing;
- recommendation/royalty analytics;
- full migration of legacy ChapterFlow databases;
- long-running autonomous batch writing;
- cloud account/sync/billing.

These remain separate future goals and are not prerequisites for using the Skill Kit.
