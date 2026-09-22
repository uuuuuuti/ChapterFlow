# Chapter Settlement & Memory V0.1

> Status: Implemented  
> Runtime: ChapterFlow Domain + Local Project Store + DeepSeek Harness Workflow

## 1. Goal

Chapter Settlement is the commit boundary between accepted prose and long-form memory.

An accepted chapter body is not automatically treated as fully normalized story truth.

The required loop is:

~~~
write chapter
→ stage chapter_draft
→ explicit accept
→ accepted immutable ChapterVersion
→ settle chapter
→ stage chapter_settlement
→ explicit accept
→ Story Memory / Reader Memory / Handoff
→ write next chapter
~~~

This makes memory extraction reviewable and prevents model-generated summaries from silently becoming canon.

## 2. Candidate kind

New candidate kind:

`chapter_settlement`

Payload:

~~~
ChapterSettlementCandidatePayload
- chapterIndex
- chapterVersionId
- summary
- characterStates[]
- relationshipEvents[]
- timelineEvents[]
- readerPromiseOperations[]
- handoff
~~~

A Settlement must bind the exact currently accepted `ChapterVersion`.

If the accepted chapter version changes or the project revision changes, an older Settlement Candidate cannot be silently applied.

## 3. Story Memory

V0.1 commits:

### Character state

~~~
CharacterMemoryState
- characterKey
- name
- physicalState?
- emotionalState?
- location?
- knows[]
- believes[]
- hides[]
- possessions[]
- unresolvedConflicts[]
- chapterIndex
- chapterVersionId
- settlementId
~~~

The newest accepted state for one `characterKey` replaces its prior current-state snapshot.

### Relationship events

~~~
RelationshipMemoryEvent
- id
- fromCharacterKey
- toCharacterKey
- type
- change
- evidence
- tension?
- trust?
- affinity?
- chapterIndex
- chapterVersionId
- settlementId
~~~

A relationship event must reference known characters and cannot point from a character to itself.

### Timeline events

~~~
StoryEvent
- id
- title
- summary
- storyOrder
- characterKeys[]
- location?
- chapterIndex
- chapterVersionId
- settlementId
~~~

V0.1 stores durable plot events only. Fine-grained causal graph edges are deferred.

## 4. Reader Memory

Reader-facing expectations are stored independently from Story Memory.

~~~
ReaderPromise
- key
- title
- description
- status
- openedChapterIndex
- events[]
~~~

Operations:

- `OPEN`
- `ADVANCE`
- `PAYOFF`

Rules:

1. `OPEN` requires title + description + evidence.
2. `ADVANCE` requires an existing open Promise.
3. `PAYOFF` requires an existing open Promise.
4. A paid-off Promise cannot be advanced again unless a later explicit design introduces reopening semantics.
5. Promise operations are applied in candidate order, so a Promise may be OPENed and then ADVANCEd in the same accepted Settlement.

This prevents the model from inventing payoff state that never existed in committed Reader Memory.

## 5. Chapter Handoff

Each accepted Settlement records a compact continuation handoff:

~~~
ChapterHandoff
- endingSituation
- unresolvedConflicts[]
- immediateQuestions[]
- activeCharacterKeys[]
- nextChapterPressures[]
- continuityWarnings[]
~~~

The accepted Handoff is bound to:

- chapterIndex
- chapterVersionId
- settlementId

## 6. Context Compiler behavior

Before Settlement existed, Chapter N context had to include the full accepted body of Chapter N-1.

Now the preferred path is:

~~~
accepted + settled previous chapter
        ↓
Chapter Handoff
+ current Character Memory
+ Relationship Memory
+ Timeline Memory
+ Reader Promise Memory
        ↓
Context Packet
~~~

The full previous chapter body becomes a legacy/fallback continuity source only when a valid accepted Handoff is unavailable.

For normal ChapterFlow flow, the next chapter is blocked until the previous accepted version has been settled.

This is the first real token-growth control for long serialization.

## 7. Deterministic lifecycle rule

`first_3_chapters` is complete only when Chapters 1–3 are both:

1. accepted;
2. settled against the same accepted version.

If a chapter is accepted but not settled:

`chapterflow_book_get_next_action`

returns a deterministic blocker such as:

~~~
Settle accepted chapter 1 into Story Memory,
Reader Memory, and Chapter Handoff before writing the next chapter.
~~~

The system does not rely on the LLM to remember this process rule.

## 8. Harness Workflow

Product-facing Tool:

`chapterflow_settle_chapter`

The bounded Workflow contains two phases.

### extract

A memory analyst reads:

- accepted immutable chapter body;
- current Story Memory;
- current Reader Memory;
- previous Handoff.

It proposes a structured Settlement.

### verify

A second memory editor checks:

- unsupported facts;
- duplicate plot events;
- fake relationship changes;
- invalid Promise operations;
- character key stability;
- evidence grounding.

The final JSON is Domain-validated and then staged as a Candidate.

The Workflow never calls Candidate accept.

## 9. Commit boundary

The final flow is:

~~~
Harness Workflow output
→ parse JSON
→ Domain schema validation
→ expectedProjectRevision check
→ stage chapter_settlement Candidate
→ author review
→ explicit candidate_accept
→ revision +1
→ Story Memory / Reader Memory / Handoff committed
~~~

## 10. Tests

Automated tests cover:

- Story Memory commit.
- Reader Memory commit.
- Handoff commit.
- exact ChapterVersion binding.
- duplicate Settlement rejection.
- unknown relationship-character rejection.
- invalid PAYOFF / ADVANCE rejection.
- Settlement Workflow stages but does not auto-commit.
- Next Action blocks on missing Settlement.
- next chapter cannot be written before prior Settlement.
- Context Compiler prefers Handoff over full previous chapter body.
- first-three-chapter lifecycle completes only after all three Settlements.

## 11. Deferred

Not part of Settlement V0.1:

- locked CanonFact conflict resolution;
- historical CharacterState query by chapter;
- relationship snapshot materialization;
- Timeline causal edge graph;
- Foreshadow Memory;
- automatic confidence scoring;
- auto-accept Settlement;
- vector retrieval;
- cross-process store locking.

These can be added without changing the Candidate boundary established here.

## 12. Next slice

The next product bottleneck is now `opening_review`.

Recommended next implementation:

~~~
Editor Review V0.1
→ structured ReviewFinding
→ blocker / high-risk / improvement / observation
→ evidence bound to accepted ChapterVersion
→ revision candidate
→ diff
→ accept
→ recheck
~~~

That closes the first real quality-improvement loop after the three opening chapters.
