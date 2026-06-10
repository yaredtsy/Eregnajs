# 6.2 — Learning Map

> The same roadmap, viewed as a curriculum. Three tracks — **agent building**, **context
> engineering**, **dynamic tool orchestration** — each skill tied to the phase where you practice
> it for real. Reading teaches vocabulary; only building teaches judgment.

---

## Track A — Agent building

| Skill | Where you practice it | The judgment being trained |
|---|---|---|
| Workflows before agents | P0/P4: the fixed graph; `3-server/02` §3 | when a `for` loop beats model autonomy — and the specific trigger (reacting to tool results) that justifies graduating |
| Role decomposition | P4: tuning planner/stepper/narrator separately | small scoped calls vs. one smart call; per-role output modes (structured vs. stream) |
| Schema as behavior control | P4: `thought`-first schemas, `.max(6)` caps, `describe()` strings | the schema is half the prompt; field *order* shapes generation |
| Failure design | P0: retry / degrade / terminal frame | errors as states, not exceptions; partial value beats clean death |
| Validate model output like user input | P4: post-parse checks + self-repair retry | schema-valid ≠ semantically valid |
| Evaluation instinct | P5: scenario matrix C1–C6 as a manual eval set | before formal evals exist, a fixed scenario set + diffing behavior is your eval |

## Track B — Context engineering

| Skill | Where you practice it | The judgment being trained |
|---|---|---|
| Closed source sets | P3: adding `siteFacts`/`hostKnowledge` as *named* sources | every token traceable to a source; extension = deliberate act |
| Projection over dumping | P3/P4: component index vs. focused chapter slice vs. narrator voice | each call sees what *its decision* needs — breadth/depth/voice gradient |
| Budgets that bite | P4: caps + truncation markers + counters | budgets are real only when enforced and *observable* |
| Symbol/address separation | P3: keys for the model, manifest for the engine | models reason over stable symbols; executors hold brittle addresses |
| Untrusted context | P4/P5: hostState framing, C5 injection scenario | data-vs-instruction separation; reasoning about blast radius, not just blocking |
| Inspectability | P4/P5: debug endpoints + Context panel | "what did the model actually see?" answerable in one click — the #1 debugging move |
| Retrieval as a swap, not a rewrite | Phase 6+: loader swap when components outgrow budgets | retrieval is a context-source implementation detail, not an architecture |

## Track C — Dynamic tool orchestration

| Skill | Where you practice it | The judgment being trained |
|---|---|---|
| Descriptor/implementation split | P1/P5: specs over the wire, `run()` stays client-side | orchestrate what you can't execute; execute what you didn't choose |
| Runtime registries | P5: per-request toolsets, re-registration, buffering | nothing compile-time about a toolset; prompts rebuilt per run |
| Rendering toolsets into prompts | P4/P5: names-only for planner, full schemas for stepper | tool *presentation* is context engineering |
| Two-ended validation | P5: route ⇒ post-stepper ⇒ pre-execution | trust nothing across a gap; the page mutates between ask and play |
| Declarative capabilities | P5: `api` tool kind + same-origin guard | capability surfaces a non-programmer can declare; safety as constraints, not review |
| Result round-trips | Phase 6+: `tool-result` + parked graph | why feedback loops force resumable orchestration — and why you designed the seam early |

## Cross-cutting: streaming & protocol (the bonus track)

State replication over message passing (`3-server/05` §1, P0/P2); append semantics + sequence
numbers + terminal frames (P0); "new UI feature = new document field, not new event type" —
proven when the ticker/plan/timeline all land with zero wire changes (P4).

## How to study while building

1. **Before a phase**: reread its design files (the build-order names them); write down the one
   decision you'd have made differently. Revisit after the demo — that diff is the lesson.
2. **During**: when stuck, find which *boundary* is being crossed wrong (context? schema?
   manifest? trust?) — almost every bug in this system is a boundary bug.
3. **After**: each phase's demo line is also a journal prompt — what surprised you? Surprise =
   your model of the system was wrong = the most valuable thing to write down.

## Outside reading that pairs well

- Anthropic — *Building Effective Agents* (workflows vs. agents; mirrors Track A).
- Anthropic — *Effective context engineering for AI agents* (Track B's vocabulary).
- The "12-Factor Agents" repo by HumanLayer (own your prompts, own your context window, tools as
  structured output — this codebase is practically an exercise set for it).
- RFC 6902 (JSON Patch) — short; you've already implemented the interesting half.
