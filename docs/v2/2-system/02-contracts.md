# 2.2 — Contracts (the sacred shapes)

> The few types every actor shares. v1's `01-conversation-shape.md` remains the base; this file
> lists only **deltas** and the two new contracts (thoughts, element manifest). All of it lives in
> `packages/walkthrough-core`; API and widget import, never redeclare.

---

## 1. Unchanged from v1

`Conversation`, `Message` (+`status`), `TextPart`, `WalkthroughPart` (+`status`),
`WalkthroughChapter` (+`description`, `elementId`), `WalkthroughStep` (+`status`, `skipReason`),
`PopoverConfig`, the five actions (`scroll-to`, `highlight`, `wait`, `wait-for-click`,
`call-tool`), JSON Patch over NDJSON with the string-append convention.

> `elementId` everywhere now means **component key** (e.g. `billing.export-button`) — a semantic
> slug from the knowledgebase, not necessarily a literal DOM id. The rename is conceptual; the
> field name stays to avoid churn.

## 2. Delta: `WalkthroughChapter` gains `status`

```ts
chapterStatus: "pending" | "active" | "done" | "failed"
```

Why stored, not derived: the timeline needs to color a *chapter segment* red even when the chapter
produced zero steps (planner targeted a component the stepper couldn't use). Same argument as v1's
§3.3 — statuses exist where inference is ambiguous.

## 3. New: thoughts (structured reasoning summaries)

```ts
// packages/walkthrough-core/src/walkthrough/thoughts.ts
export interface Thought {
  id: string
  phase: "plan" | "chapter" | "step" | "tool" | "system"
  label: string        // one line, ticker-sized: "Found 3 relevant components"
  detail?: string      // optional expansion, streamed via string-append
  chapterIndex?: number
  ts: number
}

// WalkthroughPart gains:
thoughts: Thought[]
```

Rules:
- Thoughts are **summaries the subagents are asked to produce** (a `thought` field in their output
  schemas), never raw chain-of-thought dumps. You control tone and length in the schema description.
- They stream like everything else — `add` patch per thought, string-append for `detail`.
- The player's ticker renders `label`s; the plan panel groups them by `phase`/`chapterIndex`.
- They persist with the run → replays show the same thinking. Free inspectability.

## 4. New: the element manifest

The LLM speaks component **keys**; the engine needs **selector queries**. The manifest is the
bridge, emitted once by the `enrich` node before any LLM output:

```ts
// WalkthroughPart gains:
manifest: Record<string, ManifestEntry>   // key → how to find + describe it

export interface ManifestEntry {
  label: string
  selectors: SelectorQuery[]      // ordered; engine tries in order
}

export type SelectorQuery =
  | { kind: "dom-id"; value: string }
  | { kind: "css";    value: string }
  | { kind: "text";   value: string; tag?: string }   // visible-text match, optional tag filter
```

Why this matters (and what it teaches): the model's **symbol space** (semantic keys it can reason
about) is deliberately separated from the executor's **address space** (brittle DOM selectors).
The model can't hallucinate a selector; the engine can't misread an intention; selectors can be
fixed in the dashboard without invalidating old runs (replays re-resolve through their stored
manifest). This symbol/address split is the same pattern as tool *names* vs tool *implementations*.

## 5. New: run envelope (first NDJSON line)

Patches need something to apply onto. Frame 0 is not a patch:

```ts
{ kind: "hello", runId: string, conversation: Conversation /* seeded */, protocol: 2 }
// every subsequent line:
{ kind: "patch", seq: number, ops: JsonPatchOp[] }
// always the final line, even on failure:
{ kind: "end", seq: number, status: "complete" | "error", message?: string }
```

The guaranteed `end` frame is fix #3's client half: the widget never hangs on a silent death.

## 6. Host-injection contracts (request body of `/public/agent/run`)

```ts
hostState:     Record<string, unknown>                    // claims about page state
hostTools:     { name, description, parameters }[]        // declared capabilities (no run fn)
hostKnowledge: { id?, title, content }[]                  // runtime facts, same shape as site facts
```

Zod-validated at the route; size-capped (state 16KB, knowledge 32KB, ≤20 tools) — caps enforced
*here*, budgets enforced again at the prompt layer (`3-server/01` §5). Two doors, two guards.

## 7. Change control

A contract change requires: the field's *reason* added to this file, the sample fixture updated in
the same PR (it is the regression test), and a `protocol` bump only if old widgets would misread
new frames (additive fields never bump).
