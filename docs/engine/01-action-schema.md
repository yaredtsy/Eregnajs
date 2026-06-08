# engine/01 — Action Schema

> **Status: design spec, not shipped.** Neither the `packages/walkthrough-core` package nor the engine described in these `engine/*` docs exists yet. The widget renders a much smaller subset of actions (`scroll-to`, `highlight`, `wait`) defined in `packages/widget/src/types/conversation.ts`. This document is the target the streamer + headless engine will be built against — keep it as the agreed contract.

The contract between the planner/streamer (server) and the engine (client). All types are intended to live in `packages/walkthrough-core/src/types/walkthrough.ts` once that package is split out (today they're in `packages/widget/src/types/conversation.ts`).

This is the single point of coupling between server and client. Bumping the schema requires a `version` bump on `Walkthrough.meta`.

---

## Top-level shapes

```ts
export interface Walkthrough {
  meta: WalkthroughMeta
  steps: Step[]                  // populated incrementally as the stream arrives
}

export interface WalkthroughMeta {
  sessionId: string              // matches walkthrough_sessions.id
  agentId: string
  pickedPageId?: string
  version: 1                     // schema version
}

export interface Step {
  id: string                     // stable, server-assigned
  streamIndex: number            // monotonic, matches walkthrough_steps.stream_index
  actions: Action[]              // ordered, executed sequentially
  popover?: PopoverConfig
}
```

A `Walkthrough` is **append-only** during streaming. The engine's `StepQueue` writes new steps into it as `step` events arrive.

---

## Action union

The engine dispatches on `action.type`. Every variant carries optional `duration` (the buffer the engine waits before moving to the next action — same model as the old plan).

```ts
export interface ActionBase {
  duration?: number       // ms; overrides default for this action's type
}

export type Action =
  | HighlightElementAction
  | ScrollToAction
  | WaitAction
  | WaitForElementAction
  | WaitForClickAction
  | NavigateAction          // Phase 2
  | SimulateClickAction     // Phase 2 — gated by element trust flag
  | FillInputAction         // Phase 2 — gated
```

### `highlight-element`

```ts
interface HighlightElementAction extends ActionBase {
  type: 'highlight-element'
  selector: SelectorSpec          // see "Selector resolution" below
  variant?: 'primary' | 'subtle'  // visual style
}
```

Default duration: 400ms. Adapter renders the spotlight ring and registers a teardown on the cleanup stack.

### `scroll-to`

```ts
interface ScrollToAction extends ActionBase {
  type: 'scroll-to'
  selector: SelectorSpec
  block?: 'start' | 'center' | 'end'    // default: 'center'
  behavior?: 'smooth' | 'instant'       // default: 'smooth'
}
```

Default duration: 600ms (covers the smooth scroll).

### `wait`

```ts
interface WaitAction extends ActionBase {
  type: 'wait'
  ms: number              // overrides ActionBase.duration
}
```

### `wait-for-element`

Waits until the selector resolves, with a timeout. Use case: after a `navigate` or after the user does something async.

```ts
interface WaitForElementAction extends ActionBase {
  type: 'wait-for-element'
  selector: SelectorSpec
  timeoutMs: number       // hard cap
}
```

### `wait-for-click`

User must click the highlighted element to advance. The engine subscribes to clicks on the element and resolves on first match.

```ts
interface WaitForClickAction extends ActionBase {
  type: 'wait-for-click'
  selector: SelectorSpec
  timeoutMs?: number      // optional; if absent, waits indefinitely
}
```

### Phase 2 actions

```ts
interface NavigateAction extends ActionBase {
  type: 'navigate'
  url: string             // must be same-origin
}

interface SimulateClickAction extends ActionBase {
  type: 'simulate-click'
  selector: SelectorSpec
}

interface FillInputAction extends ActionBase {
  type: 'fill-input'
  selector: SelectorSpec
  value: string
}
```

These are in the union so the streamer can emit them when we lift the gate, but the MVP engine **throws on dispatch** for these types. The cost of forward-compat is one more case in a switch.

---

## `SelectorSpec`

A small union that lets the streamer reference elements by registered ID or by raw CSS:

```ts
export type SelectorSpec =
  | { kind: 'element-id'; elementId: string }     // resolves via the registered element row
  | { kind: 'css'; css: string }                  // raw CSS selector — fallback only
  | { kind: 'xpath'; xpath: string }              // last-resort
```

The planner is strongly biased to emit `element-id` because:

1. The element row has `dom_id`, `css_selector`, `xpath` — the adapter tries them in order, with retries.
2. Customers can change selectors in the dashboard without re-generating prompts.
3. We get a stable ID for analytics.

Raw `css` is allowed for cases where the LLM truly needs to point at an unregistered element (rare). The adapter still applies the same retry logic but loses the fallback chain.

---

## `PopoverConfig`

```ts
export interface PopoverConfig {
  title?: string
  body: string                          // typewritten char-by-char
  anchor: PopoverAnchor
  side?: 'top' | 'bottom' | 'left' | 'right'
}

export type PopoverAnchor =
  | { type: 'element'; selector: SelectorSpec }
  | { type: 'viewport-center' }
  | { type: 'coordinates'; x: number; y: number }
```

The popover renders **after** all of a step's actions complete. The next step's first actions handle cleanup/transition (close the popover, clear the highlight). No implicit auto-cleanup between steps — same model as the original walkthrough-plan, because it lets the author chain narration smoothly.

---

## Duration model (same as old plan, adapted)

```ts
export const TYPEWRITER_MS_PER_CHAR = 28
export const DEFAULT_POST_POPOVER_PAUSE = 500

export function defaultDuration(type: Action['type']): number {
  switch (type) {
    case 'highlight-element':  return 400
    case 'scroll-to':          return 600
    case 'wait':               return 0       // uses .ms
    case 'wait-for-element':   return 0       // event-driven
    case 'wait-for-click':     return 0       // event-driven
    case 'navigate':           return 0
    case 'simulate-click':     return 200
    case 'fill-input':         return 300
  }
}

export function stepDuration(step: Step): number {
  const actions = step.actions.reduce((sum, a) => {
    if (a.type === 'wait') return sum + a.ms
    if (a.type === 'wait-for-element' || a.type === 'wait-for-click') return sum + 0
    return sum + (a.duration ?? defaultDuration(a.type))
  }, 0)
  const tw = step.popover ? step.popover.body.length * TYPEWRITER_MS_PER_CHAR : 0
  const post = step.popover ? DEFAULT_POST_POPOVER_PAUSE : 0
  return actions + tw + post
}
```

Event-driven actions (`wait-for-*`) contribute zero to the deterministic duration. The timeline is **only meaningful between event-driven gates**. That's fine — seeking past a gate just lands you at the gate; the engine waits for the event from there.

---

## Why a discriminated union (recap)

- Type-safe `switch` — adding a new type fails the exhaustive check until handled.
- One handler per type — no megafunction.
- Forward-compat: Phase 2 actions live in the union but the executor rejects them in MVP.

Adding a new action is documented in `engine/04-dom-adapter.md` (it touches the adapter, the handler, and the registry).

---

## Example: a 3-step walkthrough as it streams

```jsonc
// frame 1
{ "event": "session", "data": { "id": "sess_01H..." } }

// frame 2
{ "event": "plan", "data": { "outline": { "stepTitles": ["Find Pro", "Highlight CTA", "Wait for click"] } } }

// frame 3 — step 1 arrives, engine starts playing
{ "event": "step", "data": {
  "id": "step_01", "streamIndex": 0,
  "actions": [{ "type": "scroll-to", "selector": { "kind": "element-id", "elementId": "el_pro_card" } }],
  "popover": null
}}

// frame 4 — step 2, engine queues it; will play after step 1 finishes
{ "event": "step", "data": {
  "id": "step_02", "streamIndex": 1,
  "actions": [{ "type": "highlight-element", "selector": { "kind": "element-id", "elementId": "el_pro_subscribe" } }],
  "popover": {
    "body": "Click Subscribe to start the Pro signup. You'll go to Stripe checkout next.",
    "anchor": { "type": "element", "selector": { "kind": "element-id", "elementId": "el_pro_subscribe" } },
    "side": "top"
  }
}}

// frame 5 — step 3
{ "event": "step", "data": {
  "id": "step_03", "streamIndex": 2,
  "actions": [{ "type": "wait-for-click", "selector": { "kind": "element-id", "elementId": "el_pro_subscribe" }, "timeoutMs": 30000 }],
  "popover": null
}}

// frame 6
{ "event": "done", "data": {} }
```
