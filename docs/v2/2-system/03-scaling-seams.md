# 2.3 — Scaling Seams

> "Simple now, easy to swap and scale later" only works if the swap points are *named interfaces*,
> not hopes. This file lists every seam, its MVP implementation, and what slots in later.
> If a future feature doesn't fit a seam here, the design conversation happens *before* the code.

---

## 1. The orchestrator seam (the big one)

```ts
// apps/api/src/services/agent/orchestrator.ts
export interface Orchestrator {
  run(input: {
    ctx: AgentContext
    conversation: Conversation        // pre-seeded; mutate it, patcher watches
    signal: AbortSignal
  }): Promise<void>
}
```

| Now | Later candidates |
|---|---|
| `LangGraphOrchestrator` — the fixed plan→step→narrate graph | a tool-calling loop agent (model decides next move); parallel chapter generation; a re-planning graph that reacts to tool results; a different framework entirely |

The route and `run.ts` know only this interface. The *wire contract* (patches on the Conversation)
is what makes the swap safe: any orchestrator that mutates the document correctly is
indistinguishable to the widget. **This is the lesson**: stable contracts at the edges buy you
freedom in the middle.

## 2. The model seam

`llm/provider.ts` → `pickModel(role, agentConfig)`. MVP: one provider, same model per role.
Later: per-role map (cheap narrator, smart planner), fallback chains, A/B by agent. The roles are
already separate calls, so this is config, not surgery.

## 3. The context-source seam

Each `AgentContext` field is loaded by one named loader (v1's provider idea, kept conceptually
even though MVP inlines them in `compose.ts` — see as-built note in `3-server/01`). Scaling moves:

| Field | MVP | Later |
|---|---|---|
| `components` | load all for matched page | embedding retrieval top-K (the unused vector column finally earns its index) |
| `siteFacts` | load all | retrieval top-K |
| `conversationHistory` | empty | prior runs of this visitor, summarized |
| (new source) | — | one new loader + one new prompt section; nothing else changes |

## 4. The transport seam

NDJSON over held-open fetch. The patcher emits frames to an `onFrame` callback — it does not know
about HTTP. Later: WebSocket (needed for tool-result round-trip), resumable streams
(`Last-Event-Id`-style replay from the run journal). The frame shapes (`2-system/02` §5) don't change.

## 5. The persistence seam

`runs/{save,load,list}` is already a module boundary. MVP: SQLite. Later: Postgres (when runs need
joins with KB for analytics) — the module signature is the contract, the storage is detail.

## 6. The selector-resolution seam

`SelectorQuery` is a discriminated union resolved by one engine function. New strategies
(aria-label, role+name, XPath, fuzzy text) are new union members + one resolver case. Old runs keep
replaying because manifests are stored per run.

## 7. The tool-execution seam

`executeTool(spec, args)` in the widget engine dispatches on `kind` (`fn` | `api`). Later kinds
(`navigate`, `clipboard`, postMessage-to-iframe) are new cases. Server-side, tools are only
descriptors — adding a kind costs the server *nothing* except validation.

## 8. What is deliberately NOT a seam

- **The Conversation document.** It is the one thing everything depends on; changing it is a
  versioned event (`protocol` bump), not a swap.
- **JSON Patch as the mutation language.** Replacing it would rewrite both ends simultaneously —
  accept it as bedrock.
- **The widget/engine split.** Shadow-DOM UI vs host-DOM toucher is a security boundary, not a
  preference.

## The meta-lesson

Every seam above is the same trick: *name the interface, ship the dumbest implementation, record
the upgrade*. The skill being practiced is judging **which** boundaries deserve a seam (the ones
with a plausible second implementation) and which are bedrock. Too many seams is its own failure
mode — v1's `ContextProvider` interface was a seam nobody needed yet, and the code rightly inlined
it; the *concept* survived as "one loader per source," which is enough.
