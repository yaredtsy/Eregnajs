# 3.2 — Orchestration

> The deterministic core. v1's graph survives intact; v2 adds the orchestrator interface, error
> recovery, thought emission, and debug entry points.

> **What you're learning here:** workflows-before-agents — when control flow is knowable, encode
> it; spend model intelligence only on decisions that need it. Plus: failure design (degrade,
> never die) and why orchestrators should be swappable behind a contract.

---

## 1. The graph (unchanged shape, two additions)

```
START → enrich → plan → ┌─▶ streamChapter → streamBody ─┐
                        │        ▲              │ more steps? loop
                        │        └── more chapters? ─────┘
                        └────────────── all done ──▶ complete → END
```

- `enrich` (no LLM): seed assistant message + walkthrough part, **emit the element manifest**
  (`2-system/02` §4) and a first thought (`phase:"system"`, "Reading your question…").
- `plan` → Planner: chapters + plan-level thought.
- `streamChapter` → Stepper, once per chapter; flips `chapter.status` `pending→active`.
- `streamBody` → Narrator, once per step.
- `complete` (no LLM): flip statuses, write the `end` frame, save the run.

`routeStep` / `routeChapter` stay pure conditional-edge functions.

## 2. The orchestrator contract

The graph hides behind `Orchestrator` (`2-system/03` §1). `run.ts` becomes:

```ts
const orchestrator: Orchestrator = createLangGraphOrchestrator(deps)
await orchestrator.run({ ctx, conversation, signal })
```

That's the whole swap seam. When you later want a model-driven loop ("look at tool results,
decide next step"), you write a second implementation and flip a config — widget and wire never know.

## 3. Why a fixed graph is *right* for this product (and when it stops being)

The walkthrough domain has a knowable shape: plan, then per-chapter steps, then narration. A model
choosing "what to do next" here would burn tokens rediscovering a loop you could write in 10 lines.
The honest trade-off: a fixed graph cannot *react* — it can't re-plan when a tool result reveals
the page is in an unexpected state. That's exactly the moment to graduate to a reactive
orchestrator — **after** tool results round-trip (Phase 5), not before. Write the dumb thing first;
let a real limitation, not aesthetics, trigger the upgrade.

## 4. Failure design (fix #3)

Three nested containment levels — error at level N stays at level N:

| Level | Failure | Containment |
|---|---|---|
| **call** | LLM timeout/5xx/schema-parse failure | `withRetry(fn, {tries: 2, backoff})` around every subagent call; schema failures retry once with the validation error appended to the prompt |
| **chapter** | retries exhausted in Stepper/Narrator; planner emitted unknown component key | chapter `status: "failed"` + thought (`phase:"system"`, label: "Skipped chapter: …") + continue to next chapter |
| **run** | planner fails after retries; context compose throws; abort | flip walkthrough `status:"error"`, emit terminal `end` frame with message, save partial run |

Rules: the visitor-facing stream **always** terminates with an `end` frame; partial runs persist
(failures are data — the dashboard surfaces them); `signal.aborted` is checked between nodes so a
closed tab stops token burn within one step.

## 5. Debug entry points (owner-auth, used by the playground)

| Endpoint | Runs | Returns |
|---|---|---|
| `/v1/agent/debug/context` | compose only | AgentContext + rendered sections + token counts |
| `/v1/agent/debug/plan` | enrich + plan | planner prompt, raw output, parsed chapters, thoughts |
| `/v1/agent/debug/step` | one chapter through Stepper | focused projection, prompt, steps |
| `/v1/agent/debug/narrate` | one step through Narrator | prompt, streamed text (non-stream JSON) |

Implementation cost is low *because* the graph nodes are thin wrappers over subagent functions —
the debug endpoints call the same functions directly. If this turns out hard to build, that's a
smell that orchestration and logic got coupled.

## 6. As-built notes

- The uncommitted `graph.ts` change (channel `default: () => null` placeholder instead of a
  throwing function) is correct — LangGraph invokes defaults at module load. Commit it with a test
  that imports the graph at module scope.
- Channels are all replace-semantics references into one mutated `conversation` — fine, but
  document the invariant in `workflow/types.ts`: *nodes may mutate `conversation` in place (the
  patcher is watching); everything else flows through channel returns.*
