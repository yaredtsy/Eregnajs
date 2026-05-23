# reliability/01 — Robust Playback

The host page is hostile. Elements appear late, get re-rendered, change selectors. Network drops. The LLM produces a step for an element that's gone. This doc enumerates the failure modes and the engine's response to each.

---

## Failure taxonomy

```
┌─────────────────────────────────────────────────────────────────────┐
│  Class             │ Example                              │ Handled by │
├─────────────────────────────────────────────────────────────────────┤
│  Selector misses   │ #pro-subscribe renamed to .subscribe-pro │ Adapter retry chain │
│  Async DOM         │ Modal not in DOM yet                      │ wait-for-element    │
│  Element moves     │ React re-render mid-highlight             │ Observer-driven ring update │
│  Element off-screen│ Page scrolled away                        │ scroll-marker on overlay  │
│  Network drop      │ SSE connection breaks                     │ Surface error; manual retry │
│  Slow LLM          │ Stream stalls between steps               │ awaiting-stream state │
│  Malformed step    │ LLM emits an unknown action type          │ Skip step; log     │
│  Step cycle        │ wait-for-click on a button that won't fire│ Per-action timeout │
│  Host CSS attack   │ z-index: max on a host element            │ Overlay z-index near INT32_MAX │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Selector resolution: retries with budgets

When the adapter resolves a `SelectorSpec`, the order is:

1. `dom_id` (the most stable — customers set it explicitly).
2. `css_selector`.
3. `xpath`.

Each is one query attempt. If all three miss, we treat it as "element not yet in DOM" and start a bounded `MutationObserver` wait — **but only for actions that justify waiting**:

| Action | Wait on miss? | Budget |
|---|---|---|
| `highlight-element` | yes | 1500ms |
| `scroll-to` | yes | 1500ms |
| `wait-for-element` | yes | the action's `timeoutMs` |
| `wait-for-click` | yes | 1500ms to find the element, then full `timeoutMs` for the click |
| Popover with element anchor | yes | 800ms (popover can fall back to viewport-center) |

If the budget expires:

- The step is **skipped**, not failed. A `step_skipped` event is logged to `walkthrough_sessions.error_message` (appended).
- The popover, if present, still renders at `viewport-center` with the narration body — the visitor sees the explanation even if the visual cue is missing.
- The engine continues to the next step.

This "skip-and-narrate" behavior is critical for first-time customers whose selectors will inevitably drift. A broken walkthrough that gives up entirely is worse than one that loses its visuals but still talks the visitor through.

---

## Live element tracking

Once an element is resolved and highlighted, it can move. The adapter wires two observers (see `engine/04-dom-adapter.md`):

- `ResizeObserver` on the element.
- `scroll` + `resize` capture listeners on the window.

Both call a throttled `update()` that re-reads `getBoundingClientRect()` and repositions the spotlight. If `getBoundingClientRect()` returns zero-size for two consecutive frames (i.e. the element got removed from the DOM), the spotlight fades out and the engine logs an in-step error. The step's remaining actions continue if independent; otherwise the cleanup stack flushes and the next step runs.

---

## Off-screen elements

If the resolved element's rect is outside the viewport at highlight time:

1. The adapter prepends an implicit `scroll-to` with `block: 'center', behavior: 'smooth'`.
2. After scroll settles, the highlight paints normally.
3. If scrolling doesn't bring the element into view (e.g. inside an overflow:hidden parent), a **scroll marker** is painted on the closest viewport edge with an arrow pointing toward the element. The popover narration continues; the marker disappears when the element becomes visible.

This is overlay-only (the marker is part of `overlay.css`).

---

## SSE failure modes

| Wire event | Engine reaction | UI |
|---|---|---|
| Connection drops mid-stream | Queue resolves remaining buffered steps; `awaiting-stream` until manual retry | Banner: "Connection lost. Retry?" |
| `event: error` | Engine completes the current step then halts | Player bar shows red badge with message |
| Stream silent > 30s with no `done` | Soft warning; player shows "Still thinking…" | Optional manual abort button |
| Server returns 5xx before stream opens | No `session` event ever fires; widget shows toast | Same retry banner |

Manual retry on connection drop: re-issue `POST /v1/walkthroughs/run` with `resumeSessionId` set. Server reads `walkthrough_steps` already persisted and re-emits them in order before continuing. (Phase 2 — MVP just restarts the session.)

---

## LLM malformed output

The streamer validates every `Step` against the Zod-derived schema before persisting and emitting. On validation failure:

1. The bad step is **not** persisted or emitted.
2. The streamer logs the bad payload + validator error to `walkthrough_sessions.error_message`.
3. The streamer asks the LLM to retry once with the validator message appended ("Your last step failed validation: X. Emit a valid Step.").
4. If retry also fails, that one step is skipped — the streamer moves on.

The visitor only sees valid steps. They might see a slightly shorter walkthrough than the plan promised; the UI gracefully shows "5 of 5 steps" even if the plan said 6 (we adjust `planOutline` server-side when a step is dropped).

---

## Step cycles & infinite waits

Every `wait-for-*` action **must** have a `timeoutMs` set by the streamer (the schema requires it for `wait-for-element`; `wait-for-click` is optional). If a streamer-produced step omits `timeoutMs` on `wait-for-click`, the server fills in a default of 60s before persisting.

The engine never waits forever. The player bar surfaces a "Skip" button when a `wait-for-*` action is active for more than 5s — a manual escape hatch.

---

## Idempotent re-execution

When the engine resumes after pause (or replays a step via "Prev"), it re-runs the step's actions from a clean state. Two implications:

1. Handlers must be **idempotent**. Calling `highlightElement` twice on the same element is fine; the second call returns a teardown that supersedes the first.
2. Cleanup runs **before** re-execution. The engine flushes the previous step's `CleanupStack` slice before running `runStep(N-1)` on prev.

Phase 2 seek will exercise this hard — we want it bullet-proof in MVP because pause/resume already uses it.

---

## Host page DOM mutations during a step

Specifically: customer's site replaces the entire pricing section while we're highlighting "Subscribe". Sequence:

1. Spotlight is anchored to the original DOM node, which is now detached.
2. Resize observer fires `update()`, but `getBoundingClientRect()` returns zeros.
3. Adapter detects zero-rect persistence (2 frames), fades the spotlight, and re-runs `resolve(spec)` — picking up the new node.
4. If a new node matches the spec, spotlight re-anchors with a brief crossfade.
5. If not, spotlight stays hidden and the engine logs.

The same recovery path covers framework re-renders that swap node references.

---

## Logging & observability

Every recoverable failure is appended (not replaced) to `walkthrough_sessions.error_message` as a JSONL line:

```
{"t":"2026-05-22T11:03:21Z","kind":"selector_miss","stepId":"step_02","spec":{"kind":"element-id","elementId":"el_pro_subscribe"}}
```

This is a poor man's analytics for Phase 1. Phase 2 adds a proper events table.

---

## What we accept will break and how we'll know

| Failure | Detection | First customer who hits it triggers… |
|---|---|---|
| Customer-built widget overlay conflicts with `z-index: 2147483646` | Visible reports + screenshot | Configurable `zIndexBase` init option |
| Customer page lazy-loads elements via `IntersectionObserver` not in viewport | "Element not found" rate climbs | Pre-warm: adapter forces `scrollIntoView` before initial resolve |
| Customer page uses canvas/WebGL widgets (no DOM nodes to highlight) | Selector miss + no recovery | Out of scope; we tell customers this |
| Customer is in an iframe inside another customer's site | `window.location.origin` weirdness | Defer until reported |

We resist building Phase 2 features speculatively. The list above is a known-issues backlog, not a TODO.
