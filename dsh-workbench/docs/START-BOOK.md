# StartBook Workflow V0.1

> Status: Implemented  
> Runtime: DeepSeek Harness Workflow + ChapterFlow Candidate boundary

## 1. Goal

StartBook V0.1 turns a raw story idea into the six committed opening artifacts required before chapter writing:

~~~
idea
→ direction
→ positioning
→ story_engine
→ packaging
→ opening_blueprint
→ first_3_chapters
~~~

It deliberately does **not** generate and commit all six artifacts in one workflow run.

Every run handles exactly one current lifecycle stage.

---

## 2. Why one stage per run

All ChapterFlow candidates carry `baseProjectRevision`.

If one workflow generated six staged candidates at revision 0:

1. accepting `idea` would move the project to revision 1;
2. the other five candidates would immediately be stale.

Therefore StartBook is a resumable loop:

~~~
read committed state
→ run one bounded workflow
→ validate structured artifact
→ stage candidate
→ show author
→ explicit accept / reject
→ revision +1
→ derive next lifecycle stage
→ run StartBook again
~~~

This preserves the Candidate-first invariant instead of working around it.

---

## 3. Harness workflow

`chapterflow_start_book` is the stable product-facing Tool façade.

Internally it runs three Harness workflow phases:

### draft

A StartBook specialist proposes the current-stage artifact using:

- project metadata;
- current revision;
- accepted upstream artifacts;
- optional author brief;
- the stage output contract.

### critique

A second specialist audits:

- continuity with accepted facts;
- specificity;
- sustainable conflict;
- reader expectation;
- serialization potential;
- repetition risk;
- generic AI phrasing;
- unsupported platform claims.

The critic does not write committed state.

### synthesize

A lead editor combines the draft and critique into one final JSON artifact matching the current stage contract.

The Harness Workflow result itself is still temporary output.

---

## 4. Commit boundary

After the Workflow completes:

1. ChapterFlow parses the final JSON.
2. `@chapterflow/start-book` validates the stage-specific schema.
3. Project Store checks that project revision is still the revision used to build context.
4. Only then is one `book_artifact` Candidate staged.
5. Project revision remains unchanged.
6. The author must explicitly accept or reject the Candidate.

Only `chapterflow_candidate_accept` changes committed state and advances lifecycle.

---

## 5. Concurrent revision protection

StartBook records the revision before launching the subagents.

When the generated artifact returns, staging uses `expectedProjectRevision` inside the Project Store's same-project write lock.

If another Session accepted a mutation while the Workflow was running:

~~~text
context revision = 4
current revision = 5
~~~

the generated result is rejected before Candidate creation.

This prevents a model result based on stale story context from entering the review queue as if it were current.

---

## 6. Stage contracts

### idea

Required: `premise / protagonist / disruption / coreHook / stakes`.

### direction

Required: `genre / subGenre[] / protagonistPath / coreConflict / emotionalTone / serializationPotential / differentiation / boundaries[]`.

### positioning

Required: `premise / genre / subGenre[] / targetReader / coreFantasy / protagonistHook / centralConflict / emotionalValue / differentiation / readerPromise / boundaries[]`.

### story_engine

Required: `protagonist / desire / lack / externalGoal / primaryOpposition / escalationMechanism / repeatableStoryLoop / firstArcGoal / failureConsequences`.

Optional: `coreAbilityOrAdvantage / abilityCost / longTermMystery / relationshipEngine`.

### packaging

Required: `title / introduction / tags[] / sellingPoints[] / promiseAlignment / openingAlignment / samenessRisks[]`.

The contract explicitly forbids invented CTR, ranking, signing probability, or platform guarantees.

### opening_blueprint

Required: `corePromise / incitingEvent / protagonistPredicament / firstPayoff / firstMajorQuestion / chapterIntents[1..3] / firstArcMilestones[]`.

Each of the first three intents requires `chapter / purpose / readerExpectation / emotionTarget / goal / conflict / payoff / hook`.

---

## 7. Context rules

StartBook Context contains only:

- project identity and metadata;
- current committed revision;
- current lifecycle stage;
- active accepted upstream artifacts.

Rejected or merely staged Candidate payloads are not treated as book facts.

This is intentional: model context must reflect committed Domain Truth.

---

## 8. Tools

### `chapterflow_start_book`

Inputs: `projectId` and optional `userBrief`.

`userBrief` is required at `idea` stage and optional later.

Output includes stage, project revision used for generation, workflow run id, agents started, staged Candidate, critic feedback, `requiresAcceptance: true`, and next action.

### Existing commit tools

- `chapterflow_candidate_accept`
- `chapterflow_candidate_reject`

StartBook never calls acceptance internally.

---

## 9. Automated acceptance

Tests cover:

- stage schema validation;
- rejection of unsupported fields;
- fenced model JSON parsing;
- exactly three ordered opening chapter intents;
- context excludes rejected Candidate payloads;
- Workflow stages but does not auto-accept;
- accepted artifact advances revision and lifecycle;
- concurrent revision change blocks stale workflow output;
- full six-stage loop reaches `first_3_chapters` only after six explicit Candidate accepts.

---

## 10. Manual real-model smoke

After configuring a Harness model:

~~~text
帮我创建一本都市悬疑小说。
脑洞是：一个普通银行职员突然可以看到别人未来 24 小时内的一次重大财务决定。
~~~

Expected conductor behavior:

1. create the project if needed;
2. read next action;
3. call `chapterflow_start_book` for `idea`;
4. present the staged Candidate;
5. wait for explicit approval;
6. accept only after approval;
7. continue to `direction`;
8. repeat until `opening_blueprint` is accepted;
9. stop when lifecycle becomes `first_3_chapters`.

The author should not need to select individual specialist agents.

---

## 11. Next slice

StartBook stops at `first_3_chapters`.

The next implementation slice should introduce:

- Chapter aggregate and versioning;
- Chapter Intent projection from accepted Opening Blueprint;
- Context Compiler V0.1;
- `write_chapter` bounded Workflow;
- draft Candidate / accept boundary;
- Chapter 1 end-to-end acceptance.

Story Memory / Reader Memory Settlement should follow immediately after the first accepted chapter rather than being deferred until all three chapters are written.
