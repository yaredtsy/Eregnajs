# player/02 — Pause & Follow-up (Branch)

> **Status.** Pause is shipped; follow-up branching is not. The widget can pause/resume a walkthrough through `usePlayer` + the reducer, but there is no agent to generate a follow-up walkthrough, and `parentContext` is plumbed through the types but only ever read for the static sample. This doc is the design for when the streamer arrives.

The defining UX of Eregna: at any point during a walkthrough the visitor can pause, ask a follow-up, and the agent generates a new walkthrough that picks up from that exact point. There is no tree, no fork graph — just the next `Message` in the conversation, carrying a `Position` that says *where I was when I asked*. The Timeline (`00-timeline-model.md`) stitches it end-to-end.

This doc specifies the behavior. The conversation/message shape is in `00-timeline-model.md`; the Bar and Popup surfaces are in `01-store-and-controls.md`.

---

## The Composer (recap)

The text input row at the bottom of the Bar is the same DOM element in every state. Two intents, one field — switches on **content × engine status**:

| Activity | Composer empty | Composer non-empty |
|---|---|---|
| idle (no active walkthrough) | placeholder; Enter no-op | Enter → start a new top-level turn |
| active, `playing` | placeholder; Space toggles | typing pauses engine; Enter submits follow-up |
| active, `paused` | placeholder; Enter resumes | Enter submits follow-up |
| active, `awaiting-stream` | disabled | Enter aborts active stream + submits follow-up |
| active, `complete` | placeholder | Enter submits follow-up (next turn) |

The input never loses focus when the activity changes. Placeholder text is the only signal that mode flipped. This is the same affordance as "type to type, Enter to send" in any chat — with the bonus that pressing space (on an empty input, during playback) is the universal video-player pause.

---

## Pause-to-ask transition

```
Visitor starts typing during a walkthrough
   │
   ▼
Engine.pause()                    ← preserves current Step + stepOffsetMs
   │
   ▼
Composer accumulates text. Bar status badge: "Paused".
   │
   ▼
Visitor presses Enter
   │
   ▼
appendMessage({ role: 'user', parts: [{ type: 'text', text }] })
   │
   ▼
sendFollowup({
  sessionId,
  parentContext: store.timeline.playhead,    ← Position the visitor is parked at
  text,
})
   │
   ▼
   POST /v1/walkthroughs/run with parentContext
   ▼
   Server opens a new assistant Message with [TextPart, WalkthroughPart];
   the WalkthroughPart's parentContext mirrors the visitor's.
   ▼
SSE arrives: TextPart lands first ("Sure — quick comparison.")
             then WalkthroughPart card placeholder
             then Plan
             then Steps streaming in
   ▼
store.setActiveWalkthrough(newWalkthroughId)
store.setPlayhead({ branchId: newWalkthroughId, stepIndex: 0, offsetMs: 0 })
Engine.resume() → plays the new walkthrough on the host DOM
```

The Bar stays in active mode the whole time — it just swaps the controls' chapter context to the new walkthrough's chapters and continues. The Popup's message list (when bubble mode is open) appends the user message and the agent's intro text live as the SSE fires.

---

## The Position carried in `parentContext`

`Position` from `00-timeline-model.md`:

```ts
{
  messageId: string             // the assistant message whose walkthrough was active
  walkthroughId: string         // which walkthrough part of that message
  stepIndex: number             // index into walkthrough.steps
  stepOffsetMs: number          // [0, stepDuration(step)]
}
```

The server gets enough to reconstruct *what the visitor saw*: which message, which walkthrough, exactly which Step (and how deep into it). The planner uses that to write a focused follow-up plan (see `agent/05-prompts.md` § branch variant).

---

## Scrubbed-back follow-up

The visitor can rewind first, then ask. The flow is the same — `parentContext` carries whatever `playhead` is at the moment of submit. The agent treats it identically: *"the visitor was here when they asked."* That position might be in the middle of an earlier walkthrough (turns back from the live edge); the planner still gets the right context.

What the abandoned forward content does:

- The previous walkthrough's stream may still be open on the server. The server keeps emitting Steps into the DB until its own `done`/`error`. The Timeline shows the new walkthrough taking over from `parentContext`; the abandoned tail is not on the visitor's Timeline.
- If aborting the original stream is cheaper than letting it finish (LLM cost), the widget may call `AbortController.abort()` on the in-flight fetch. MVP lets it finish to keep the wire protocol simple.

The dashboard's replay viewer (Phase 2) can show the abandoned tail as *"what the agent had planned to say next"*.

---

## What the agent sees on a follow-up

```jsonc
POST /v1/walkthroughs/run
{
  "publicId": "acme-abc123",
  "sessionId": "sess_01H...",
  "pageUrl": "https://acme.com/pricing",
  "text": "wait, what does 'team' tier mean?",
  "parentContext": {
    "messageId": "msg_02",
    "walkthroughId": "w_01",
    "stepIndex": 1,
    "stepOffsetMs": 1340
  }
}
```

The server reads:

- The conversation rows → original user query, prior assistant text/walkthrough parts, page selection.
- `walkthrough_steps` rows tied to `parentContext.walkthroughId`, up to and including `parentContext.stepIndex` — what the visitor has actually seen.
- The element tree for the active page — same context as before.

The planner is invoked with the branch prompt variant (`agent/05-prompts.md`):

```
Original goal: "{original user text}"
Original plan: [titles of plan.steps]
Visitor has seen steps 1..N: [titles]
At step {N}, the visitor asked: "{follow-up text}"
Generate a focused mini-walkthrough that answers the follow-up.
End with a recap or a step that re-anchors to the next parent step if it makes sense.
```

The output is the same shape — a new assistant `Message` with one (or two) parts:

```jsonc
{
  "id": "msg_04",
  "role": "assistant",
  "parts": [
    { "type": "text", "text": "Sure — quick comparison." },
    { "type": "walkthrough", "walkthroughId": "w_02",
      "plan": { /* compare team vs pro */ },
      "steps": [ /* stream */ ],
      "streamStatus": "open",
      "parentContext": { /* mirrors what the client sent */ }
    }
  ]
}
```

---

## How the Popup renders follow-ups

In bubble mode the Popup shows the new `Message`s as they stream in (see `01-store-and-controls.md` § "Streaming sequence inside the Popup"):

```
You · paused at "Highlight Subscribe"        ← inline tag derived from parentContext
"wait, what does 'team' tier mean?"

Agent
Sure — quick comparison.                     ← TextPart
┌───────────────────────────────┐
│ ▶  Compare Team vs Pro        │             ← WalkthroughPart card (lazy)
│    2 chapters · streaming…    │
└───────────────────────────────┘
```

The visitor sees the chat history grow exactly like any messaging app. The walkthrough card is the handle into the actual playback, which is happening on the host DOM in parallel.

---

## Follow-ups while detached

In detached mode the Popup is closed; only the Bar is visible. The flow is unchanged:

- Type during playback → pause → Enter → new turn.
- The user/assistant TextParts are *not* shown anywhere in detached mode (the Popup is the message-list surface). They are persisted on the conversation and will appear when the visitor re-attaches.
- The host-DOM popover/spotlight transitions to the new walkthrough as soon as its first Step arrives.

To see the conversation log without leaving playback, the visitor re-attaches via the FAB (the Bar slides back into the Popup, history appears).

---

## Multiple follow-ups in sequence

There's no special case. Each follow-up is just another message appended to `conversation.messages`. Its `parentContext` points at wherever the playhead happened to be — which is usually inside the prior assistant's walkthrough, but could be anywhere along the Timeline. The Timeline keeps stitching: the chapters of each successive walkthrough append at the point where the visitor branched off.

```
Timeline:  ──[ w_01 chapters 1, 2 ]──┐
                                      ↓ parentContext on w_02
              [ w_02 chapters 1, 2, 3 ]──┐
                                          ↓ parentContext on w_03
                                          [ w_03 chapters 1, 2 ] ──● (live edge)
```

Three messages of agent walkthroughs, one continuous Timeline. The visitor scrubs across all of them with a single scrubber.

---

## Aborting and closing

| Action | Effect on conversation | Effect on engine |
|---|---|---|
| ⋯ → "Exit walkthrough" on the Bar | conversation untouched | engine.abort(); `activeWalkthroughId := null`; Bar morphs to idle. The walkthrough card stays in the Popup; visitor can re-play later. |
| Close Popup (× in bubble) → mode: closed | conversation untouched | engine.pause(); cleanup teardown. Re-opening the FAB rehydrates. |
| Tab closed entirely | conversation persists server-side; in-memory state lost | server marks `streamStatus: 'aborted'` on the latest open walkthrough. |

There is no global "end conversation" — the conversation is the durable record of the session and lives for the agent's lifetime. The visitor can come back the next day and replay any past walkthrough (Phase 2 dashboard replay; widget-side persistence is a Phase 2 nice-to-have).

---

## What we explicitly don't do in MVP

- **No follow-up suggestion chips.** The Composer is a single text input. Suggestions are Phase 2.
- **No branch tree visualization.** There is no tree. There are only follow-up messages on a linear conversation.
- **No multi-tab sync.** If the visitor opens two tabs, two independent sessions run.
- **No voice input.** Maybe one day.

---

## Engine API surface used here

```
engine.pause()
engine.resume()
engine.seek(position)            // playhead := position; replays target Step from clean state
engine.abort()
```

And on the SSE consumer:

```
useStream.send({ text, parentContext? })
queue.append(step)
queue.closeStream()
queue.fail(error)
```

The follow-up flow added one optional field (`parentContext`) to the existing send method and one universal `seek(position)` to the engine. No new subsystem.
