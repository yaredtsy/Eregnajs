# 01 — Conversation Shape

> What the wire and the store look like. Everything the agent writes and the widget reads is one document of this shape. This file is the canonical contract; every later doc refers back to type names defined here.

The shape **already exists** in `packages/widget/src/types/conversation.ts` and is rendered today from `packages/widget/src/data/sample-conversation.ts`. We **lift it into `packages/walkthrough-core`** so the API can import the same types, then add a small number of fields. The existing widget components must keep building unchanged against the superset.

---

## 1. Convergence policy

> **If the shipped sample renders it today, the type stays.** Extensions only where the embeddable agent has a real new need; each extension states its reason.

### 1.1 Verbatim from the sample (no changes)

- `Conversation = { sessionId, agentName, messages: Message[] }`
- `Message = { id, role, parts, createdAt }`
- `TextPart = { type: "text", text }`
- `WalkthroughPart` fields: `type`, `walkthroughId`, `planGoal`, `planRationale?`, `chapters`, `steps`, `parentContext`.
- `WalkthroughStep` fields: `id`, `actions`, `popover?`.
- `PopoverConfig = { title?, body, elementId? }` — `elementId` undefined ⇒ viewport-center anchor. **No new `anchor` discriminated union.**
- `WalkthroughAction.elementId: string` — plain DOM id, *not* a `SelectorSpec` union. Engine resolves via `document.getElementById`.
- `WalkthroughChapter` fields: `title`, `stepIndex`.
- `WalkthroughPosition = { messageId, walkthroughId, stepIndex, stepOffsetMs }` (used by parentContext when branching).
- Timing constants: `TYPEWRITER_MS_PER_CHAR`, `POST_POPOVER_PAUSE_MS`, `ACTION_DURATION_MS`. Keep — history mode uses them.
- `computeStepDuration(step)`. Keep — history mode uses it; live mode bypasses it.

### 1.2 Six minimal extensions (and why)

| # | Extension                                                                                | Reason                                                                                                                                          |
|---|------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------|
| A | `WalkthroughAction` gains `{ type: "call-tool"; toolName: string; args: …}`              | The whole product premise: agent calls host-registered JS. Sample has no host interaction.                                                      |
| B | `WalkthroughAction` gains `{ type: "wait-for-click"; elementId: string; timeoutMs? }`    | Required by Phase 1 AC#7 (`docs/02-roadmap.md`). Sample auto-plays with no gates.                                                               |
| C | `WalkthroughChapter` gains `description: string` and `elementId: string`                 | The plan/checklist needs to name (a) what each step does, (b) the component it targets. The agent uses `elementId` to focus the per-chapter prompt context (load that element's DB row). |
| D | `WalkthroughPart` gains `status: "planning" \| "playing" \| "complete" \| "error"`        | Need to mean "chapters rendered, no steps yet" without inferring from `steps.length === 0` (which can't distinguish complete vs. nothing yet vs. errored). |
| E | `Message` gains `status: "streaming" \| "complete" \| "error"`                            | Standard streaming-chat affordance. Composer disables; spinner binds to this. Sample has no streaming.                                          |
| F | `WalkthroughStep` gains `status: "pending" \| "running" \| "done" \| "skipped"` + optional `skipReason: string` | Engine needs to record steps it couldn't run (missing elementId, unknown toolName) without throwing. Replay viewer in Phase 2 needs this too. |

Anything outside this list is **not** changing in MVP, and additions to the type file should justify themselves in PR review against this list.

---

## 2. Canonical type definitions

These are the exact types `packages/walkthrough-core/src/conversation/types.ts` and `packages/walkthrough-core/src/walkthrough/types.ts` will export. `packages/widget/src/types/conversation.ts` becomes a re-export.

```ts
// packages/walkthrough-core/src/conversation/types.ts

export type ChatRole = "user" | "assistant"

export type MessageStatus = "streaming" | "complete" | "error"

export interface Message {
  id: string
  role: ChatRole
  parts: MessagePart[]
  status: MessageStatus
  createdAt: number
}

export type MessagePart = TextPart | WalkthroughPart

export interface TextPart {
  type: "text"
  text: string
}

export interface Conversation {
  sessionId: string
  agentName: string
  messages: Message[]
}
```

```ts
// packages/walkthrough-core/src/walkthrough/types.ts
import type { WalkthroughAction } from "./actions"

export type WalkthroughStatus = "planning" | "playing" | "complete" | "error"

export interface WalkthroughPart {
  type: "walkthrough"
  walkthroughId: string
  planGoal: string
  planRationale?: string
  status: WalkthroughStatus
  chapters: WalkthroughChapter[]
  steps: WalkthroughStep[]
  parentContext: WalkthroughPosition | null
}

export interface WalkthroughChapter {
  title: string
  description: string
  elementId: string                 // every chapter targets a component (see §3.2)
  stepIndex: number                 // -1 until the chapter's first step exists
}

export type StepStatus = "pending" | "running" | "done" | "skipped"

export interface WalkthroughStep {
  id: string
  actions: WalkthroughAction[]
  popover?: PopoverConfig
  status: StepStatus
  skipReason?: string
}

export interface PopoverConfig {
  title?: string
  body: string                      // grows by string-append patches in live mode
  elementId?: string                // undefined = viewport-center anchor
}

export interface WalkthroughPosition {
  messageId: string
  walkthroughId: string
  stepIndex: number
  stepOffsetMs: number
}
```

```ts
// packages/walkthrough-core/src/walkthrough/actions.ts

export type WalkthroughAction =
  | ScrollToAction
  | HighlightAction
  | WaitAction
  | WaitForClickAction
  | CallToolAction

export interface ScrollToAction {
  type: "scroll-to"
  elementId: string
}

export interface HighlightAction {
  type: "highlight"
  elementId: string
}

export interface WaitAction {
  type: "wait"
  ms: number
}

export interface WaitForClickAction {
  type: "wait-for-click"
  elementId: string
  timeoutMs?: number
}

export interface CallToolAction {
  type: "call-tool"
  toolName: string
  args: Record<string, unknown>
}
```

`packages/widget/src/types/conversation.ts` after the lift:

```ts
export * from "@repo/walkthrough-core/conversation/types"
export * from "@repo/walkthrough-core/walkthrough/types"
export * from "@repo/walkthrough-core/walkthrough/actions"
export {
  TYPEWRITER_MS_PER_CHAR,
  POST_POPOVER_PAUSE_MS,
  ACTION_DURATION_MS,
  computeStepDuration,
} from "@repo/walkthrough-core/walkthrough/timing"
```

Existing imports across the widget keep working with no changes.

---

## 3. Why these specific extension choices (decision log)

### 3.1 Why `elementId` stays a plain string

Decision: action `elementId` and popover `elementId` stay `string`, not a `SelectorSpec` union (`{ kind: "element-id" | "css" | "xpath", … }`).

Trade-off accepted: customers must give every registered element a stable DOM `id` attribute. We re-use `elements.dom_id` from the dashboard as that string.

Why not the union now:
- The existing overlay reads `popover.elementId` and calls `document.getElementById`. A union forces a switch in every render path for no MVP benefit.
- Re-pointing without redeploy (the union's main value) is a Phase 2 feature; nothing in MVP needs it.
- Promotion later: change `elementId: string` to `elementId: string | SelectorSpec`; one new resolver file in the engine; no breaking change to existing data.

### 3.2 Why every chapter has an `elementId` (no optional)

Decision: `WalkthroughChapter.elementId: string` is required, not optional.

A chapter without a target component is rare in walkthroughs (the case is "intro/outro"). To avoid two code paths in the per-chapter prompt builder (`§03-prompts.md`):

- An intro/outro chapter still names an element — the page root or page hero — so the per-chapter prompt always has a focus.
- The renderer doesn't need a branch for "chapter with no element".

If a customer later needs a true contextless chapter, we make `elementId` optional. One-line change; no migration.

### 3.3 Why we add three `status` enums (Message, Walkthrough, Step) instead of inferring

Each status answers a question that can't be inferred from sibling fields:

- `Message.status` — "is the model still typing?" The composer should disable. There's no other signal.
- `WalkthroughPart.status` — "has the model finished planning?" `chapters.length > 0 && steps.length === 0` is **ambiguous** (could mean "planning done, streaming about to start" or "error before any step"). One field, one truth.
- `WalkthroughStep.status` — "did the engine actually run this step?" An "highlighted but the element wasn't found" step needs to be visibly skipped, not silently dropped. Replay viewer needs this anyway.

### 3.4 Why we do *not* introduce a top-level `playMode` field on the Conversation

`playMode` is widget-side state (it depends on whether the document came from a live stream or DB), not server data. The server doesn't know or care; the widget reducer holds it. Putting it on the Conversation would mean serialising widget UI state, which crosses a layering boundary we'd regret.

Where it lives: `WidgetState.playMode: "live" | "history"`, set when the conversation is first loaded into the store.

---

## 4. The two play modes (mechanics)

This is the single most important behavioural difference between MVP and the shipped sample. Detail in `07-engine.md`; the contract lives here.

### 4.1 Live mode

- Source: `runStream()` opens a `fetch`; NDJSON frames arrive; `applyPatch` mutates the store; renderers re-render on every change.
- `popover.body` starts `""`. Server appends chunks via `add` patches. Widget shows exactly the current string.
- Step advancement: when actions complete, engine advances iff `steps[currentIndex + 1]` exists or `WalkthroughPart.status === "complete"`. `wait-for-click` gates on the user; `wait` gates on `ms`.
- No clock-driven typewriter for popover; the network *is* the clock.
- `computeStepDuration` is not used. The scrubber renders as `currentStepIndex / steps.length`.

### 4.2 History mode

- Source: load a `Conversation` from `agent_runs.state_snapshot` (or any other persisted source).
- `popover.body` is the full string in the row.
- Step advancement is offset-driven via existing `usePlayer` rAF tick + `localOffsetMs / TYPEWRITER_MS_PER_CHAR`.
- `computeStepDuration` is the authoritative duration model.
- Existing `WalkthroughOverlay` + `Popover` + `PlayerBar` behave exactly as they do today.

### 4.3 Mode selection

```ts
// packages/widget/src/agent/store.ts
type PlayMode = "live" | "history"

// runStream.ts dispatches when it starts:
dispatch({ type: "SET_PLAY_MODE", playMode: "live" })

// the history loader dispatches when it loads a persisted run:
dispatch({ type: "SET_PLAY_MODE", playMode: "history" })
```

`WalkthroughOverlay` reads `playMode` from the store and branches the popover-body rendering:

```ts
const visibleText = playMode === "history"
  ? popover.body.slice(0, Math.floor(localOffsetMs / TYPEWRITER_MS_PER_CHAR))
  : popover.body                                  // live: render what's there
```

That single ternary is the only behavioural change required in `WalkthroughOverlay.tsx`. Everything else in the overlay stays.

---

## 5. What the widget reducer adds (one action)

The shipped reducer in `packages/widget/src/store/widget-context.tsx` already owns `mode`, `status`, speed, etc. The MVP adds **one new action** and one piece of state:

```ts
// addition to WidgetAction union
| { type: "APPLY_PATCH"; ops: JsonPatchOp[] }
| { type: "SET_PLAY_MODE"; playMode: PlayMode }

// addition to WidgetState
playMode: PlayMode
```

`APPLY_PATCH` is handled by calling `applyPatch(state.conversation, ops)` (uses `fast-json-patch` + string-append wrapper from `packages/walkthrough-core/src/conversation/applyPatch.ts`) and returning the new state. No other action changes. No other existing field changes. The reducer is the same reducer; it just has one more case.

`PLAY_WALKTHROUGH`, `TICK`, `SET_STATUS`, `SEEK`, `PREV_STEP`, `NEXT_STEP`, `SET_SPEED`, `SET_COMPOSER`, `MARK_READ`, `SET_MODE` — all unchanged.

---

## 6. Backwards compatibility with the sample fixture

After the type extension, the shipped `sample-conversation.ts` will fail to type-check unless we fill in the new required fields. Two ways to handle:

1. **Update the sample** to include `status: "complete"` on Message, `status: "complete"` on WalkthroughPart, `status: "done"` on each Step, `description: …` and `elementId: …` on each chapter. The sample becomes a valid **history-mode** conversation, demonstrably playable through the existing overlay with zero behavioural change.
2. Make the new fields optional with defaults, and rely on runtime defaults. **Rejected**: optional fields propagate "do I have to check for undefined?" through every renderer. One-time fixture update is cheaper.

Recommendation: option 1. Update `sample-conversation.ts` in the same commit that lifts the types. That's also the regression test that the new shape didn't break history playback.

---

## 7. References

- `02-context.md` — how `chapter.elementId` is used to load focused per-chapter context.
- `03-prompts.md` — the per-chapter prompt template that consumes that element row.
- `04-workflow.md` — the loop that emits chapters first, then iterates per chapter.
- `06-patcher-and-wire.md` — the JSON Patch + NDJSON wire that mutates these shapes.
- `07-engine.md` — engine consequences of the two play modes.
