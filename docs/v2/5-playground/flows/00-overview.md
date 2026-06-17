# 5.F — Playground Flows (overview)

> One file per condition. Each flow file has: the flowchart, the condition table,
> what it teaches, and a **phase map** — which branch works today and which waits on a
> named seam. Read these before building or using the playground: they are the product's
> hardest interaction problems, each isolated.

---

## The five flows

| # | Flow | The question it answers | Hinges on |
|---|------|------------------------|-----------|
| [01](./01-table-tools.md) | **Table read-tools** | "How does the agent *answer from* a complex component (summary, summation)?" | exposing component functions as tools; hostState as the pre-calculated channel |
| [02](./02-guided-recovery.md) | **Guided precondition recovery** | "A condition error happens — how does the popup say *do this first, then this*?" | knowledgebase notes (planned) / tool errors (reactive) |
| [03](./03-awaited-paths.md) | **Awaited vs pre-calculated paths** | "When must playback *wait and validate* instead of running like a video?" | `wait-for-click` today; tool-result round-trip later |
| [04](./04-replay-drift.md) | **Replay drift** | "Old history replays on a changed page — regenerate or stop?" | manifest pre-flight; `ask()` re-entry |
| [05](./05-combined-scenario.md) | **Combined scenario** | All of the above in one step-by-step session | everything |

## How the flows relate (the big picture)

```
                          visitor asks a question
                                   │
                     ┌─────────────┴──────────────┐
                     │  is the answer already      │
                     │  in context (hostState/KB)? │
                     └───────┬──────────────┬──────┘
                         yes │              │ no — needs the page
                             ▼              ▼
                      narrate directly   walkthrough with steps
                                            │
                       ┌────────────────────┼─────────────────────┐
                       ▼                    ▼                     ▼
               video-like steps      awaited steps          read-tool steps
               (scroll/highlight,    (wait-for-click,       (call-tool returns
               pre-calculated,       call-tool with         data → result card
               plays through)        validation — F03)      or round-trip — F01)
                       │                    │                     │
                       └───────── any step can fail ─────────────┘
                                            │
                          ┌─────────────────┴────────────────┐
                          ▼                                  ▼
                  single miss (live run):           replay on changed page:
                  not-found path — notice,          drift dialog — regenerate
                  red segment, continue             or stop (F04)
                          │
                          ▼
                  precondition miss:
                  guided recovery —
                  "do this first" (F02)
```

## Phase map (honest version)

| Capability | Status |
|---|---|
| Tools exported from components (`fn` kind), engine executes | **works now** (Phase 1 wire + Phase 3 engine) |
| Result shown to the *visitor* (result card) | Phase 3/5 widget work — no server change needed |
| Result fed back to the *agent* (narrated answers, re-planning) | **Phase 5+ seam** — tool-result round-trip (`3-server/04` §5) |
| Pre-calculated answers via `hostState` | **works now** — the cheap alternative to round-trips |
| Planned guidance from KB notes ("disabled until…") | **works now** — it's prompt content |
| Reactive guidance from tool errors | **Phase 5+** — needs round-trip |
| `wait-for-click` human gate | **works now** (action exists; engine timeout in Phase 3) |
| Replay drift detection + regenerate dialog | **Phase 3/4 widget work** — pre-flight resolve + `ask()` re-entry |

The recurring lesson: for every "agent reacts to the page" feature there is a cheaper
"page tells the agent up front" version (notes, hostState, hostKnowledge). Build the cheap
version first; the playground proves whether the expensive one is actually needed.
