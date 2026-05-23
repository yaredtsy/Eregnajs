# api/02 — Streaming Protocol

`POST /v1/walkthroughs/run` returns a `text/event-stream`. This doc fully specifies the wire format.

The widget consumes the stream with `EventSource`-style parsing (fetch + ReadableStream, since `EventSource` doesn't support POST). The engine appends `Step` events to its `StepQueue` as they arrive and plays them with no delay between LLM and renderer.

---

## Event types

| `event:` | Frequency | Payload shape | When emitted |
|---|---|---|---|
| `session` | once, first | `{ id, pickedPageId? }` | After `walkthrough_sessions` row is inserted |
| `plan` | once, after planner | `{ outline: { stepTitles: string[] } }` | After the planner finishes; lets the player render a progress skeleton |
| `step` | many | `Step` (see `engine/01-action-schema.md`) | Each time the streamer produces a complete `Step` |
| `narration_chunk` | many (within a step) | `{ stepId, charDelta: string }` | If the popover narration is streamed token-by-token instead of as a whole `Step` field |
| `done` | once, last | `{}` | After all steps are emitted and the session row is updated to `complete` |
| `error` | once, terminal | `{ message }` | On any failure; the session row is updated to `error` |

`session` and `plan` always precede the first `step`. `done` or `error` always closes the stream.

---

## Why streamed `Step` objects, not streamed text

The agent does not stream a markdown answer that the widget then parses. It streams **structured `Step` objects** that the engine queues and executes. Two reasons:

1. **No parser fragility.** Markdown-to-actions parsing is hand-wavy and ambiguous. A typed schema is enforceable.
2. **Engine-friendly streaming.** The engine wants to start playing step 1 while the LLM is still producing step 3. Whole `Step` objects are the natural unit — partial actions don't make sense.

The narration body inside a step **can** stream char-by-char via `narration_chunk` if we want sub-step responsiveness. MVP emits whole-step narration; `narration_chunk` is reserved for Phase 2 polish.

---

## Frame layout

```
event: session
data: {"id":"sess_01H...","pickedPageId":"pg_01..."}

event: plan
data: {"outline":{"stepTitles":["Find the Pro card","Highlight Subscribe","Wait for click"]}}

event: step
data: {"id":"step_01","actions":[{"type":"scroll-to","selector":"#pro-card","duration":600}],"popover":null}

event: step
data: {"id":"step_02","actions":[{"type":"highlight-element","selector":"#pro-subscribe"}],"popover":{"body":"Click Subscribe to start the Pro signup.","anchor":{"type":"element","selector":"#pro-subscribe"},"side":"top"}}

event: step
data: {"id":"step_03","actions":[{"type":"wait-for-click","selector":"#pro-subscribe","timeoutMs":30000}],"popover":null}

event: done
data: {}
```

Each `event:` / `data:` pair is followed by a blank line per the SSE spec. Hono's `streamSSE` handles that.

---

## Client parsing

```ts
// packages/widget/src/hooks/useStream.ts (sketch)
async function consumeStream(url: string, body: unknown, queue: StepQueue) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(body),
  })
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })

    // SSE frames are separated by \n\n
    let idx
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const frame = buf.slice(0, idx)
      buf = buf.slice(idx + 2)
      const { event, data } = parseFrame(frame)
      dispatch(event, data, queue)
    }
  }
}

function dispatch(event: string, data: any, queue: StepQueue) {
  switch (event) {
    case 'session':         queue.setSession(data); break
    case 'plan':            queue.setPlan(data.outline); break
    case 'step':            queue.append(data); break
    case 'narration_chunk': queue.appendNarrationChunk(data); break
    case 'done':            queue.closeStream(); break
    case 'error':           queue.failStream(data.message); break
  }
}
```

`StepQueue` is detailed in `engine/03-step-queue.md`. The key property is that `append()` is non-blocking — the engine consumes the queue on its own clock.

---

## Backpressure

The LLM emits faster than the engine plays. That's fine — the queue holds steps until the engine catches up. The streamer never waits for the engine.

The reverse case (engine outpaces LLM) is the interesting one: the engine reaches the end of the queue while `done` hasn't fired. Behavior:

1. Engine enters `awaiting-stream` state.
2. Player UI shows a subtle "thinking…" indicator on the player bar.
3. As soon as a new `step` arrives, the engine resumes from where it stopped.

This is the same state machine as paused, except the user can't "play" out of it — only the server can unblock it (or the user can abort).

---

## Reconnection (Phase 2)

If the connection drops mid-stream, we lose unstreamed steps. MVP just surfaces the error and lets the user retry. Phase 2 plan:

- Server includes `lastStreamIndex` in each `step` event.
- Client reconnects with `resumeFromIndex: N` and the server replays already-persisted steps from `walkthrough_steps` then continues the live stream.

The schema already supports this (`stream_index` column).

---

## Branching: same protocol, different entry point

When the user pauses and asks a follow-up, the widget calls `POST /v1/walkthroughs/run` again with `resumeSessionId` set. The server returns a **new** stream that the engine treats as a branch: steps from the new stream are appended after the user's current step in the queue. The original stream's `done` event is honored independently if it ever fires (we ignore it for the engine but persist for replay).

See `player/02-pause-and-branch.md` for the player-side behavior.
