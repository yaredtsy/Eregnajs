# engine/03 — Step Queue

The queue is the seam between the SSE stream and the engine's play loop. Steps land in it as soon as they arrive on the wire; the engine pulls them on its own clock.

`packages/walkthrough-core/src/engine/StepQueue.ts`.

---

## Why a queue, not direct calls

The naive design is: `useStream.ts` calls `engine.play(step)` for every `step` event. Don't do that:

- Stream and engine run at different speeds — the LLM bursts steps faster than the engine can show them.
- The engine has its own play/pause/branch state. The stream shouldn't drive timing.
- Branching requires dropping pending steps cleanly — a queue makes that one method.

The queue is a thin, awaitable, FIFO buffer with a stream-status side channel.

---

## Shape

```ts
export class StepQueue {
  // Mutators (called by useStream.ts)
  append(step: Step): void
  appendNarrationChunk(chunk: { stepId: string; charDelta: string }): void
  closeStream(reason?: 'done' | 'aborted'): void
  failStream(message: string): void

  // Consumer (called by the engine loop)
  next(): Promise<Step | 'stream-closed' | 'stream-error'>

  // Branching (called by the engine in response to user pause+ask)
  truncateAfter(stepId: string): void

  // Observation (read by the store / player UI)
  size(): number
  isStreamOpen(): boolean
  onStateChange(listener: (s: QueueState) => void): () => void
}

interface QueueState {
  size: number
  streamOpen: boolean
  error: string | null
}
```

---

## `next()` semantics

The only awaitable consumer method.

```ts
next(): Promise<Step | 'stream-closed' | 'stream-error'>
```

- If a step is buffered → resolves immediately with the next step.
- If the buffer is empty and the stream is open → resolves when the next `append()` happens.
- If the buffer is empty and the stream is closed → resolves with `'stream-closed'`.
- If the buffer is empty and the stream errored → resolves with `'stream-error'`.

Implementation: a single internal `pendingResolver` slot. `append()` checks for a waiter and resolves it; otherwise pushes to the buffer.

The engine consumes the queue serially — there is never more than one pending `next()` call at a time.

---

## Stream state side-channel

The engine and player UI both want to know "is the LLM still streaming?" without polling. `onStateChange` fires on every mutation. The player UI maps this to:

- `streamOpen && size === 0` while engine status is `running` → show a "thinking…" indicator on the player bar.
- `!streamOpen && size === 0` after engine finishes the last step → engine status flips to `complete`.

---

## Narration chunks

`narration_chunk` events are buffered per `stepId`. When the engine reaches the step's popover phase, the typewriter reads from `queue.getNarration(stepId)` and follows the chunks as they arrive. MVP doesn't use this — every step ships its full popover body inline. The hook exists so we can switch on token-level streaming later without changing the engine.

```ts
appendNarrationChunk({ stepId, charDelta }) {
  const existing = this.narrationByStep.get(stepId) ?? { chars: '', closed: false }
  this.narrationByStep.set(stepId, { ...existing, chars: existing.chars + charDelta })
  this.emit()
}

// Engine reads:
async getNarration(stepId: string): Promise<string> {
  // resolves when narration for stepId is marked closed or the stream closes
}
```

---

## `truncateAfter(stepId)` — branching primitive

When the user pauses at a step, asks a follow-up, and the API streams a new branch, we want:

1. The new stream's steps to start playing **after** the user's current step.
2. Any queued steps from the original stream (the ones the engine hadn't reached) to be dropped.

`truncateAfter(currentStepId)` does exactly that — it walks the buffer, drops everything after the named step, and resets the stream-open flag for the **previous** stream so its eventual `done` doesn't terminate the engine. The new stream then drives its own `append()` and `closeStream()` calls.

The previous stream's `walkthrough_sessions` row stays `streaming` until its server-side `done` fires. We persist its tail steps even though we won't play them — useful for the Phase 2 replay viewer.

---

## Multiple streams alive at once

Branching means **two concurrent streams** can be alive in the API for one engine. The widget tracks them per-stream:

```ts
class StreamSet {
  private streams = new Map<string, AbortController>()
  open(streamId: string): AbortController { ... }
  close(streamId: string) { ... }
  abortAll() { ... }
}
```

The queue itself doesn't know about stream IDs — it just sees `append` / `closeStream` calls. The `useStream` hook tags each call by stream and decides whether the close should propagate to `queue.closeStream()` (i.e. only the **active** branch's close matters).

---

## Persistence side-effect

The streamer writes every emitted step to `walkthrough_steps` server-side, indexed by `stream_index`. The client doesn't need to persist — the queue lives in memory and dies with the widget. Replay is server-driven (Phase 2): load `walkthrough_steps` ordered by `stream_index` and `append()` them all up front, then `closeStream()`.

---

## Edge cases

| Scenario | Behavior |
|---|---|
| `append()` after `closeStream()` | Logs a warning, ignored. The stream is closed; later steps belong to a new stream. |
| `closeStream()` called twice | Second call is a no-op. |
| Engine aborts while `next()` is pending | Engine's `AbortController` signals; the queue's pending resolver rejects with a `DOMException('aborted')`. Engine loop swallows it. |
| Stream error mid-playback | Engine finishes the current step, then `next()` returns `'stream-error'`. Engine status flips to `complete` with the error stored. |
| `truncateAfter` for an unknown stepId | Throws — this is a programming error in the player code. |

---

## Why no priority or reordering

We could, in theory, let the planner re-prioritize steps. We won't. Steps play in stream order; branching is the only mechanism that changes playback order. Simpler engine, simpler debugging.
