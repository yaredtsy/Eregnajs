# Flow 03 — Awaited vs Pre-calculated Paths

> Not every step is "play like a video." Some paths must be **awaited and validated** —
> the run pauses until an action really happened and its outcome checks out — before the
> agent continues generating, or before playback advances. This file separates the four
> pacing regimes and defines the step-level contract for the gated one.

---

## 1. The four pacing regimes

| Regime | Who waits on what | Exists today? |
|---|---|---|
| **Video-like** | nobody — steps are pre-calculated, playback advances on action completion / typewriter clock | yes (live + history modes) |
| **Human-gated** | playback waits for the *visitor* (`wait-for-click`) | yes — action exists; timeout lands Phase 3 |
| **Tool-gated, playback only** | playback waits for the *tool* to finish (≤10s), then advances regardless of result | Phase 3 engine |
| **Tool-gated, generation** | the *server* waits — generation of the next steps is parked until the validated result returns | Phase 5 (round-trip) |

The user-facing intuition: the first three pause the *picture*; the last one pauses the
*author*.

## 2. The flowchart

```
                       step about to play
                              │
              ┌───────────────┼──────────────────┐
              ▼               ▼                  ▼
        plain actions   wait-for-click      call-tool action
        (scroll,        ── pulse target,         │
        highlight,      wait for click   ┌───────┴────────┐
        wait ms)        or 30s timeout   │ awaitResult?    │
              │               │          └──┬──────────┬──┘
              ▼               ▼          no │          │ yes (Phase 5)
        advance when    advance on          ▼          ▼
        actions done    click; skip    execute (≤10s) execute → VALIDATE
        (video-like)    + thought on   record result    result against
                        timeout        card, advance    expect{} predicate
                                       (playback-gated)      │
                                                    ┌────────┴────────┐
                                                    ▼ valid           ▼ invalid
                                              POST tool-result   guided recovery
                                              → graph node       (Flow 02): notice
                                              waitForToolResult  + hint, or agent
                                              resumes → stepper  plans the fix from
                                              generates the      the error result
                                              NEXT steps WITH
                                              the result
                                                    │
                              ┌─────────────────────┘
                              ▼
               …unless the answer was PRE-CALCULATED:
               hostState/knowledge already contained it, the plan
               never emitted a gate, and the whole run stays
               video-like. Cheapest path wins (Flow 01 §4).
```

## 3. The step-level contract (designed now, server honors it in Phase 5)

```ts
// walkthrough-core: CallToolAction gains (additive, optional)
interface CallToolAction {
  type: "call-tool";
  toolName: string;
  args: Record<string, unknown>;
  awaitResult?: boolean;       // true ⇒ generation parks until result lands
  expect?: {
    kind: "truthy" | "equals" | "shape";
    value?: unknown;           // for equals
    keys?: string[];           // for shape: required keys on an object result
  };
}
```

- The **engine** can honor `expect` immediately (Phase 3): validate locally, route
  failures into the notice/red-segment path. That alone covers "awaited and validated
  instead of just running."
- The **server** honors `awaitResult` only when the round-trip exists; until then the
  stepper is prompted not to emit it. The field shipping early is deliberate — old runs
  stay replayable when the feature lands.

## 4. Condition table

| # | Condition | Expected behavior | Phase |
|---|-----------|-------------------|-------|
| A-C1 | video-like chapter (no gates) | plays through; pacing = actions/typewriter | works now |
| A-C2 | wait-for-click honored | pulse + "click to continue" + advance on click | 3 |
| A-C3 | wait-for-click timeout (30s) | auto-skip + thought + continue | 3 |
| A-C4 | call-tool, no expect | execute ≤10s, result card, advance | 3 |
| A-C5 | call-tool + expect, valid | same as C4, telemetry notes `validated: true` | 3 |
| A-C6 | call-tool + expect, INVALID | step skipped `expectation-failed`, notice + red slice | 3 |
| A-C7 | tool exceeds 10s | skip `tool-timeout`, never hangs | 3 |
| A-C8 | awaitResult: generation parked, result valid | graph resumes, next steps reference result | 5 |
| A-C9 | awaitResult: result invalid | stepper re-entry plans correction (Flow 02 reactive) | 5 |
| A-C10 | replay of a run containing gates | history mode replays *recorded* outcomes; gates do not re-execute tools — replay is a recording, not a rerun | 3 (decide now) |

A-C10 is the sleeper decision: **replays never re-execute tools.** A replay that re-ran
`clickExport` would mutate the customer's real data from a history viewer. Recorded
result cards display; tools stay cold. (Drift handling for stale recordings is Flow 04.)

## 5. What this teaches

This is the **workflow-vs-agent boundary drawn at step granularity**. Pre-calculated paths
are workflows: everything knowable up front, model consulted once. Awaited paths are the
first truly agentic loop: act → observe → decide. The architecture lets a single walkthrough
mix both — and the prompt (via notes and hostState) keeps pushing steps toward the cheap
side. When you later flip on `awaitResult`, you'll have a precise list of the only steps
that ever needed it.
