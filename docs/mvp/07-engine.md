# 07 — Engine (Widget Playback)

> What the widget *does* with the `Conversation` once patches have been applied. Two play modes — **live** (event-driven, network is the clock) and **history** (offset-driven, the existing rAF typewriter). One subscription to the conversation store; one per-step action runner; one selector resolver.

Folder: `packages/widget/src/engine/`

---

## 1. Two modes — recap

| Mode      | Trigger                                                  | Step advances when                                                  | Popover body renders as                                                  |
|-----------|----------------------------------------------------------|---------------------------------------------------------------------|--------------------------------------------------------------------------|
| **live**  | `runStream()` open; first patch arrived                  | Step's actions complete **and** (next step exists OR walkthrough complete) | the literal `popover.body` string in the store — grows by network patches |
| **history**| `Conversation` loaded from `agent_runs.state_snapshot` | `localOffsetMs` exceeds `computeStepDuration(step)` (existing `usePlayer`) | `body.slice(0, Math.floor(localOffsetMs / TYPEWRITER_MS_PER_CHAR))` |

A single ternary in `WalkthroughOverlay.tsx` (`01-conversation-shape.md` §4.3) handles the body-rendering switch. The engine module here covers everything else: when does the next action start, when does the next step begin.

---

## 2. The engine's core loop

```ts
// packages/widget/src/engine/playStep.ts
export async function playStep(step: WalkthroughStep, ctx: PlayContext): Promise<PlayResult> {
  // 1) Set step.status = "running" (engine → store, via SET_STEP_STATUS action)
  ctx.dispatch({ type: "SET_STEP_STATUS", stepId: step.id, status: "running" })

  // 2) Run actions in order
  for (const action of step.actions) {
    const ok = await runAction(action, ctx)
    if (!ok) {
      ctx.dispatch({ type: "SET_STEP_STATUS", stepId: step.id, status: "skipped", skipReason: "action failed" })
      return { advanced: true }
    }
    if (ctx.aborted) return { advanced: false }
  }

  // 3) Render popover (no-op for the engine — the overlay subscribes to the store and renders on its own clock)

  // 4) Wait for the right "next" signal
  if (ctx.playMode === "history") {
    await waitOffsetDriven(step, ctx)        // ticks until computeStepDuration is consumed
  } else {
    await waitLiveAdvance(step, ctx)          // resolves when (a) next step is appended OR (b) walkthrough completes
  }

  ctx.dispatch({ type: "SET_STEP_STATUS", stepId: step.id, status: "done" })
  return { advanced: true }
}
```

`runAction` dispatches by `action.type` into the per-action handlers. Each handler returns a boolean: did it run successfully? It does **not** advance the step — advancement is the loop's job.

---

## 3. The action handlers

```
packages/widget/src/engine/actions/
├── scrollTo.ts
├── highlight.ts
├── waitMs.ts
├── waitForClick.ts
├── callTool.ts
└── index.ts                // runAction dispatcher
```

Each handler is one short async function:

```ts
// actions/index.ts
export async function runAction(a: WalkthroughAction, ctx: PlayContext): Promise<boolean> {
  switch (a.type) {
    case "scroll-to":       return await scrollTo(a, ctx)
    case "highlight":       return await highlight(a, ctx)
    case "wait":            return await waitMs(a, ctx)
    case "wait-for-click":  return await waitForClick(a, ctx)
    case "call-tool":       return await callTool(a, ctx)
  }
}
```

### 3.1 `scrollTo.ts`

```ts
export async function scrollTo(a: { elementId: string }, ctx: PlayContext): Promise<boolean> {
  const el = resolveElement(a.elementId)
  if (!el) return false
  el.scrollIntoView({ behavior: "smooth", block: "center" })
  await sleep(600, ctx.signal)        // hold while the browser animates
  return true
}
```

### 3.2 `highlight.ts`

```ts
export async function highlight(a: { elementId: string }, ctx: PlayContext): Promise<boolean> {
  if (!resolveElement(a.elementId)) return false
  // No work here: the WalkthroughOverlay already reads the current step's first
  // highlight action's elementId and draws the spotlight via useElementRect.
  // This handler exists only for completeness in the action loop.
  await sleep(400, ctx.signal)
  return true
}
```

The existing overlay component owns the spotlight rendering. The engine's only job is to honour the action's nominal duration so the loop doesn't race past the visual transition.

### 3.3 `waitMs.ts`

```ts
export async function waitMs(a: { ms: number }, ctx: PlayContext): Promise<boolean> {
  await sleep(a.ms, ctx.signal)
  return true
}
```

### 3.4 `waitForClick.ts`

The user gate. Resolves when the user clicks the targeted element (or the optional timeout fires).

```ts
export async function waitForClick(a: { elementId: string; timeoutMs?: number }, ctx: PlayContext): Promise<boolean> {
  const el = resolveElement(a.elementId)
  if (!el) return false
  return new Promise<boolean>((resolve) => {
    const onClick = () => { cleanup(); resolve(true) }
    const onTimeout = () => { cleanup(); resolve(false) }
    const onAbort = () => { cleanup(); resolve(false) }
    function cleanup() {
      el.removeEventListener("click", onClick, { capture: true } as any)
      ctx.signal.removeEventListener("abort", onAbort)
      if (timeoutHandle) clearTimeout(timeoutHandle)
    }
    el.addEventListener("click", onClick, { capture: true, once: true })
    ctx.signal.addEventListener("abort", onAbort, { once: true })
    const timeoutHandle = a.timeoutMs ? setTimeout(onTimeout, a.timeoutMs) : null
  })
}
```

Notes:
- Capture-phase listener wins over any stop-propagation on the host page.
- Returning `false` on timeout/abort lets the loop mark the step `skipped`.
- The visitor's actual interaction with the page is preserved (we don't `preventDefault`).

### 3.5 `callTool.ts`

```ts
export async function callTool(a: { toolName: string; args: Record<string, unknown> }, ctx: PlayContext): Promise<boolean> {
  const dispatched = await ctx.hostTools.dispatch(a.toolName, a.args)
  return dispatched.ok
}
```

`ctx.hostTools` is the in-memory registry from `08-embed-and-host-api.md`. `dispatch` invokes the host's `run(args)` and returns `{ ok, result }`. MVP doesn't round-trip `result` to the agent; the engine just advances.

---

## 4. Selector resolution

```
packages/widget/src/engine/selectors.ts
```

```ts
export function resolveElement(elementId: string): HTMLElement | null {
  return document.getElementById(elementId)
}
```

That's it for MVP. `useElementRect` (already shipped) wraps a per-frame `getElementById` for rect tracking; we reuse it for the overlay. No `querySelector`, no XPath, no `SelectorSpec` union — `01-conversation-shape.md` §3.1 explains the trade-off.

### Retry budget for missing elements

Selector misses happen when the page loads slowly. We retry once per second up to a 2-second budget before giving up:

```ts
export async function resolveElementWithRetry(elementId: string, signal: AbortSignal): Promise<HTMLElement | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const el = resolveElement(elementId)
    if (el) return el
    if (signal.aborted) return null
    await sleep(700, signal)
  }
  return null
}
```

Each action's handler calls `resolveElementWithRetry` instead of `resolveElement` directly. If still null, the action returns `false`, the loop marks the step skipped.

---

## 5. Step advancement in live vs. history mode

### 5.1 Live mode — event-driven

```ts
// engine/waitLiveAdvance.ts
async function waitLiveAdvance(step: WalkthroughStep, ctx: PlayContext): Promise<void> {
  return new Promise((resolve) => {
    const off = ctx.store.subscribe(({ conversation }) => {
      const wt = findCurrentWalkthrough(conversation)
      if (!wt) return
      const nextStep = wt.steps.find(s => s.id !== step.id && wt.steps.indexOf(s) > wt.steps.indexOf(step))
      if (nextStep || wt.status === "complete") { off(); resolve() }
    })
    ctx.signal.addEventListener("abort", () => { off(); resolve() }, { once: true })
  })
}
```

The engine subscribes to the store. When a new step is appended (i.e., the next step exists) or the walkthrough completes, it resolves and the loop advances. No clock; the network is the clock.

### 5.2 History mode — offset-driven

We delegate to the existing `usePlayer` rAF tick. The engine doesn't run the action loop in history mode at all — `WalkthroughOverlay` + `usePlayer` already animate the conversation directly off `localOffsetMs`, just as they do today against `sample-conversation.ts`.

In short: **the engine action loop only runs in live mode.** History mode replays declaratively from the existing components.

```ts
// engine/index.ts (entry)
export function startEngineIfLive(ctx: PlayContext) {
  if (ctx.playMode !== "live") return                // history mode handled by usePlayer
  ctx.store.subscribe(({ conversation }) => {
    const step = nextPendingStepFor(conversation, ctx)
    if (step) playStep(step, ctx)                      // fire-and-forget; one in flight at a time
  })
}
```

We use a tiny semaphore so only one `playStep` is in flight per walkthrough.

---

## 6. `PlayContext`

```ts
// engine/types.ts
export interface PlayContext {
  store:      AgentStore                       // get/subscribe; dispatch APPLY_PATCH, SET_STEP_STATUS, etc.
  playMode:   "live" | "history"
  hostTools:  HostToolRegistry                 // from packages/widget/src/embed/hostTools.ts
  signal:     AbortSignal
  // Derived state for the engine — refreshed via subscription:
  get aborted(): boolean
}
```

The engine doesn't know about React. The overlay components do; they subscribe to the store independently. The engine and overlay only talk through the store's shape.

---

## 7. Skip semantics (consistency table)

| Trigger                                          | Step status        | What the widget shows                              |
|--------------------------------------------------|--------------------|----------------------------------------------------|
| Action handler returns `false`                   | `"skipped"` with `skipReason: "action failed"` | step row struck through in chat; overlay clears, advances |
| Missing `elementId` after retry budget           | `"skipped"` with `skipReason: "element not found"` | same                                                |
| Missing `toolName` in `call-tool`                | `"skipped"` with `skipReason: "tool not found"` | same                                                |
| `wait-for-click` timed out                       | `"skipped"` with `skipReason: "click timeout"`  | same                                                |
| User aborts (closes widget)                      | `"skipped"` with `skipReason: "aborted"` (only the in-flight step) | overlay clears immediately                          |

A `skipReason` is the same field exposed in `WalkthroughStep.status` (`01-conversation-shape.md` §1.2 (F)). Persistence picks it up automatically.

---

## 8. Interaction with the existing components

| Component (existing)                                 | What changes                                                                                                |
|------------------------------------------------------|-------------------------------------------------------------------------------------------------------------|
| `packages/widget/src/store/widget-context.tsx`       | Adds `playMode` to state; adds `APPLY_PATCH`, `SET_PLAY_MODE`, `SET_STEP_STATUS` actions. Existing actions untouched. |
| `packages/widget/src/components/WalkthroughOverlay/index.tsx` | One ternary on `playMode` for the popover body source (`01-conversation-shape.md` §4.3). Everything else unchanged. |
| `packages/widget/src/components/PlayerBar/index.tsx` | History mode unchanged. Live mode: scrubber position derived from `currentStepIndex / steps.length`. Prev/next disabled in live mode (the agent advances). |
| `packages/widget/src/hooks/usePlayer.ts`             | Skips its tick loop when `playMode === "live"` (the engine drives advancement). |
| `packages/widget/src/components/ChatPopup/MessageList.tsx` | No change. Already renders text + WalkthroughCard parts. |
| `packages/widget/src/components/ChatPopup/WalkthroughCard.tsx` | Renders chapters as a checklist when `walkthrough.status === "planning"`. Already shows chapters count; add per-row description + a checkmark that flips when `chapter.stepIndex !== -1` and all its steps are `"done"`. |

No new component files for MVP. The engine is new code; the rendering is augmentation.

---

## 9. Failure handling (engine side)

| Failure                                              | Behaviour                                                                                    |
|------------------------------------------------------|----------------------------------------------------------------------------------------------|
| Server stream errors mid-run                         | `runStream` rejects; widget dispatches `RUN_ERROR`; existing in-flight step continues if possible (it has the actions it needs); overlay shows the error reason. |
| Browser tab backgrounded for > 1 min                 | Stream may stall; widget shows "reconnecting…"; Phase 2 implements resume. MVP: visitor refreshes; new run. |
| Patch applied but referenced step disappears         | Can't happen — we don't `remove` from `/steps` in MVP. If it ever does, engine logs and skips. |
| Visitor clicks the wrong element                     | `wait-for-click` ignores it (its listener is on the targeted element only). |

---

## 10. Module file list

```
engine/
├── index.ts                         # startEngineIfLive entry
├── types.ts                         # PlayContext
├── playStep.ts                      # the main loop
├── selectors.ts                     # resolveElement + resolveElementWithRetry
├── waitLiveAdvance.ts
└── actions/
    ├── scrollTo.ts
    ├── highlight.ts
    ├── waitMs.ts
    ├── waitForClick.ts
    ├── callTool.ts
    └── index.ts                     # runAction dispatcher
```

Each `actions/*` < ~35 LOC. `playStep.ts` ~50 LOC. `selectors.ts` ~30 LOC. `waitLiveAdvance.ts` ~30 LOC.

---

## 11. References

- `01-conversation-shape.md` — `WalkthroughStep`, `WalkthroughAction`, `Message.status`, play-mode contract.
- `06-patcher-and-wire.md` — `applyOps` and the store reducer's `APPLY_PATCH` case.
- `08-embed-and-host-api.md` — `hostTools` registry the engine dispatches into.
- The shipped `packages/widget/src/hooks/useElementRect.ts` — used by the overlay; the engine doesn't call it directly.
- The shipped `packages/widget/src/hooks/usePlayer.ts` — drives history mode; gated off in live mode.
