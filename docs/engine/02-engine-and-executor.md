# engine/02 — Engine & Executor

`packages/walkthrough-core/src/engine/`. Headless, no DOM, no React. The widget plugs in adapter + store; the engine drives them.

This is the same shape as the old walkthrough-plan engine, with one major change: **the engine reads from a streaming `StepQueue` instead of a fully-loaded `Walkthrough`.** It plays whatever is available and pauses (`awaiting-stream` state) when the queue runs dry before `done`.

---

## Classes

```
WalkthroughEngine          ← orchestrator
  ├── StepQueue            ← append-as-they-stream; engine drains it
  ├── TimelineBuilder      ← (Phase 2) seek; MVP plays linearly
  ├── StepExecutor         ← per-step runner
  └── CleanupStack         ← LIFO teardown
```

---

## `WalkthroughEngine`

```ts
export interface EngineConfig {
  registry: ActionHandlerRegistry
  adapter:  HostAdapter
  store:    WalkthroughStoreApi
  queue:    StepQueue
}

export class WalkthroughEngine {
  constructor(cfg: EngineConfig)

  start(meta: WalkthroughMeta): Promise<void>        // begins draining the queue
  pause(): void
  resume(): void
  abort(reason?: string): void
  setSpeed(speed: number): void

  // For branching: drop everything queued past N and let StepQueue refill from new stream
  truncateAfter(stepId: string): void
}
```

### Status state machine

```
            start()
   idle ─────────────► running ──────────► awaiting-stream
     ▲                   │  ▲                   │
     │                pause/                queue.append
     │                resume                    │
     │                   │  │                   ▼
     │                   ▼  └────── running ◄──┘
     │                paused
     │                   │
     └── abort() ◄───────┘
                         │
                  done event   ▼
                       complete
```

`awaiting-stream` is new vs. the old plan — it's what makes streamed playback work.

### Play loop (pseudocode)

```ts
async start(meta: WalkthroughMeta) {
  this.store.setMeta(meta)
  this.setStatus('running')

  while (!this.aborted) {
    const step = await this.queue.next()       // blocks if queue empty + stream open
    if (step === 'stream-closed') break        // done event received and queue drained
    if (step === 'stream-error')  break        // error event received

    this.store.setCurrentStep(step)

    // PHASE 1 — actions
    const exec = new StepExecutor(step, {
      registry: this.registry,
      adapter:  this.adapter,
      store:    this.store,
      signal:   this.abortController.signal,
      cleanup:  this.cleanupStack,
      speed:    this.speed,
    })
    await exec.run()
    if (this.aborted) break

    // PHASE 2 — popover + typewriter
    if (step.popover) {
      this.store.setPopover(step.popover)
      this.store.resetTypewriter(step.popover.body)
      await this.runTypewriter(step.popover.body)
    }
    if (this.aborted) break

    // PHASE 3 — post-pause
    await abortableSleep(DEFAULT_POST_POPOVER_PAUSE / this.speed, this.abortController.signal)
  }

  this.setStatus(this.aborted ? 'idle' : 'complete')
}
```

`queue.next()` is the only place the engine waits on the network. While the queue is empty but the stream is still open, `queue.next()` is pending and the engine status flips to `awaiting-stream` (set by a side-channel — see `engine/03-step-queue.md`).

### Pause / Resume

`pause()` aborts the current `AbortController` and stashes the current step + character index so resume can continue from there. Resume creates a new `AbortController` and re-enters the loop, but instead of consuming the next step from the queue it **re-runs the current step's remaining actions** from a saved offset (the `fastExecuteTo` path inherited from the old plan).

---

## `StepExecutor`

Runs one step's `actions` sequentially. Same duration-pacing model from the old plan — handlers execute instantly, the engine waits out the remaining duration.

```ts
export class StepExecutor {
  constructor(step: Step, ctx: StepExecutorContext)
  run(): Promise<void>
  cleanup(): void
}

interface StepExecutorContext {
  registry: ActionHandlerRegistry
  adapter:  HostAdapter
  store:    WalkthroughStoreApi
  signal:   AbortSignal
  cleanup:  CleanupStack
  speed:    number
}
```

Run loop:

```ts
async run() {
  for (const action of this.step.actions) {
    if (this.signal.aborted) return

    const handler = this.registry.get(action.type)
    if (!handler) throw new Error(`No handler for ${action.type}`)

    const start = performance.now()

    // 1. Handler executes — usually fast (toggles a state, paints overlay)
    await handler(action, {
      adapter: this.adapter,
      store:   this.store,
      signal:  this.signal,
      cleanup: this.cleanup,
    })
    if (this.signal.aborted) return

    // 2. Wait out remaining duration (buffer for the user to absorb)
    const elapsed = performance.now() - start
    const target  = effectiveDuration(action) / this.speed
    if (target > elapsed) {
      await abortableSleep(target - elapsed, this.signal)
    }
  }
}

function effectiveDuration(a: Action): number {
  if (a.type === 'wait') return a.ms
  if (a.type === 'wait-for-element' || a.type === 'wait-for-click') return 0
  return a.duration ?? defaultDuration(a.type)
}
```

The event-driven `wait-for-*` handlers don't return until the event fires (or `signal` aborts) — so the executor naturally blocks on them with no extra logic.

---

## `CleanupStack`

LIFO stack of teardown functions registered by handlers. Same as the old plan:

```ts
export class CleanupStack {
  private fns: Array<() => void> = []
  push(fn: () => void) { this.fns.push(fn) }
  flushOne() { this.fns.pop()?.() }   // for fine-grained cleanup
  flush() {
    while (this.fns.length) {
      try { this.fns.pop()!() } catch (e) { console.error('cleanup', e) }
    }
  }
}
```

When the engine moves to the next step, it does **not** flush automatically. The next step's actions are expected to handle transition (close the previous popover, clear the previous highlight). This matches the old plan's authoring model. The engine flushes only on `abort()` and `complete`.

---

## Typewriter loop

```ts
private async runTypewriter(text: string) {
  const msPerChar = TYPEWRITER_MS_PER_CHAR / this.speed
  for (let i = 0; i <= text.length; i++) {
    if (this.aborted || this.paused) {
      this.store.setTypewriter({ charIndex: i, visibleText: text.slice(0, i), isTyping: false })
      // wait for resume / abort
      await this.waitForUnpause()
      if (this.aborted) return
    }
    this.store.setTypewriter({
      charIndex: i,
      visibleText: text.slice(0, i),
      isTyping: i < text.length,
    })
    if (i < text.length) await abortableSleep(msPerChar, this.abortController.signal)
  }
}
```

`charIndex` is preserved on pause; resume continues from there. Same as the old plan.

---

## Differences from the old `WalkthroughEngine`

| Old | New |
|---|---|
| Loads a complete `Walkthrough` up-front | Drains a `StepQueue` while the stream is open |
| Pre-built `WalkthroughTimeline` for O(1) seek | Timeline built lazily as steps arrive; seek limited to already-played range |
| Cleanup between steps is author-driven | Same — kept the rule |
| Targets React Flow via `CanvasAdapter` | Targets arbitrary DOM via `HostAdapter` |
| All actions deterministic-duration | New `wait-for-element` / `wait-for-click` actions are event-driven |
| No `awaiting-stream` state | Added — handles LLM-slower-than-engine |
| No `truncateAfter` | Added — branching needs to drop queued steps after a pause point |
