# player/00 — Conversation & Timeline Model

A conversation in Eregna is a **standard message conversation** — same shape as any chat product. Messages have roles, messages have **parts**, parts have **types**. What's new is one part type: **`walkthrough`**. It's modelled the way `tool_use` is modelled in the Anthropic / OpenAI message formats — a typed, structured content block that the renderer treats specially.

This doc defines that shape. The DVR controls in `01-store-and-controls.md` are just a viewer over the `walkthrough` parts. The pause-and-ask flow in `02-pause-and-branch.md` appends new messages with `walkthrough` parts that carry a position context.

---

## Why "message + parts" and not a custom shape

The core logic of a conversation — append a message, render a message, scroll back through history, restart a session — is already solved. We keep all of it. The only thing we add is a new part-type the renderer knows how to play instead of typeset.

| Convention | Eregna |
|---|---|
| `messages: { role, content }[]` | Same. `role: 'user' \| 'assistant'`. |
| `content` is an array of typed parts | Same. We call it `parts`. |
| Part types: `text`, `tool_use`, `tool_result`, `image`, … | We add `walkthrough`. MVP uses `text` + `walkthrough`. |
| Streaming a message means streaming new parts and growing existing ones | Same. A `walkthrough` part grows as Steps arrive. |

If you've worked with the Anthropic SDK's content blocks, you already know this model.

---

## Top-level types

```ts
// packages/walkthrough-core/src/types/conversation.ts

export interface Conversation {
  sessionId: string                     // = walkthrough_sessions.id
  messages: Message[]                   // ordered, append-only
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  parts: MessagePart[]
  createdAt: number                     // ms epoch
}

export type MessagePart =
  | TextPart
  | WalkthroughPart
  // future: ToolUsePart, ToolResultPart, ImagePart, …

export interface TextPart {
  type: 'text'
  text: string                          // plain text (markdown allowed for assistant; user is raw)
}

export interface WalkthroughPart {
  type: 'walkthrough'
  walkthroughId: string                 // stable id (= server row id)

  plan: Plan                            // committed plan (see agent/03)
  steps: Step[]                         // append-only as the streamer emits

  streamStatus: 'open' | 'closed' | 'aborted' | 'error'
  streamError?: string

  /**
   * If non-null, this walkthrough started from a pause point in an earlier
   * walkthrough part — the visitor asked a follow-up mid-playback.
   * Lets the renderer stitch the timeline end-to-end.
   */
  parentContext: Position | null
}

export interface Position {
  messageId: string
  walkthroughId: string                 // a Message may have >1 walkthrough part
  stepIndex: number                     // index into WalkthroughPart.steps
  stepOffsetMs: number                  // 0..stepDuration(step) — mid-step is allowed
}
```

A `Position` is the universal coordinate — written by the scrubber, read by the engine, stamped on follow-ups.

---

## What a turn looks like

A normal back-and-forth:

```jsonc
{
  "sessionId": "sess_01H...",
  "messages": [
    { "id": "msg_01", "role": "user",
      "parts": [{ "type": "text", "text": "how do I subscribe to pro?" }],
      "createdAt": 1716_500_000_000 },

    { "id": "msg_02", "role": "assistant",
      "parts": [
        { "type": "walkthrough", "walkthroughId": "w_01",
          "plan":  { /* … */ }, "steps": [ /* streaming in */ ],
          "streamStatus": "open", "parentContext": null }
      ],
      "createdAt": 1716_500_000_120 }
  ]
}
```

A follow-up asked **while msg_02's walkthrough was paused at step 2 (mid-popover)**:

```jsonc
{
  "messages": [
    /* msg_01, msg_02 as above */,

    { "id": "msg_03", "role": "user",
      "parts": [{ "type": "text", "text": "wait, what is team tier?" }],
      "createdAt": 1716_500_018_400 },

    { "id": "msg_04", "role": "assistant",
      "parts": [
        { "type": "walkthrough", "walkthroughId": "w_02",
          "plan":  { /* compare team vs pro */ }, "steps": [ /* streaming */ ],
          "streamStatus": "open",
          "parentContext": {
            "messageId": "msg_02", "walkthroughId": "w_01",
            "stepIndex": 1, "stepOffsetMs": 1340
          }
        }
      ],
      "createdAt": 1716_500_018_500 }
  ]
}
```

That's it. Two new messages — one user, one assistant. No new top-level container. No tree. The `parentContext` on the assistant's `walkthrough` part is the only follow-up-specific field.

Mixed-content messages are allowed by the schema. An assistant could combine `text` + `walkthrough` ("Sure, let me show you" + the tour) — same way Claude can emit a text block plus a tool call in one assistant message.

---

## Streaming maps onto the parts model

When a new assistant message is being produced:

1. Server emits `message_start` → client appends an empty assistant `Message` with one empty `WalkthroughPart`.
2. Server emits `plan` → client sets `walkthroughPart.plan`.
3. Server emits `step` (many) → client pushes to `walkthroughPart.steps`.
4. Server emits `message_end` (or `done`) → client sets `streamStatus: 'closed'`.

This matches the Anthropic streaming convention: `message_start` → `content_block_start` → `content_block_delta`* → `content_block_stop` → `message_stop`. Our SSE protocol is the same idea, scoped to our part-types (see follow-ups in `api/02-streaming-protocol.md`).

A part can grow — `WalkthroughPart.steps` is append-only — without needing a new event type. The store mutates in place; React renders the latest length.

---

## The Timeline is a derived view

The conversation is the source of truth. The Timeline is what the DVR renders **over** the conversation — concatenating every `walkthrough` part's Steps in message order.

```ts
export interface Timeline {
  conversationId: string
  chapters: Chapter[]                   // one per Step across all walkthrough parts
  totalDurationMs: number
  liveEdge: Position                    // newest position the active stream has reached
  playhead: Position                    // where the visitor is right now
  isAtLive: boolean
}

export interface Chapter {
  position: Position                    // start of this chapter
  title: string                         // walkthroughPart.plan.steps[i].title
  messageId: string
  walkthroughId: string
  isWalkthroughStart: boolean           // first chapter of its walkthrough — visually distinct
  cumulativeMs: number                  // ms from timeline start to chapter start
  durationMs: number                    // = stepDuration(step)
}
```

Rebuild rules:

- New Step lands → push one Chapter onto `chapters`, bump `totalDurationMs`, advance `liveEdge`.
- New assistant message opens (follow-up) → `chapters` from the prior walkthrough are **truncated to the `parentContext.stepIndex`** and the new walkthrough's chapters append from there. The truncated chapters still live in `Conversation` for the dashboard's replay viewer; the Timeline simply doesn't show them.
- Visitor scrubs → `playhead` updates; `liveEdge` doesn't.

Never persist the Timeline. Recompute from `Conversation` on hydration.

---

## Live edge vs. playhead

```
0 ─────── playhead ─────── liveEdge ────●     (●  = newest Step received)
          ▲                 ▲
          │                 └── advances as Steps stream in
          └── advances as the engine plays
```

Invariant: `playhead ≤ liveEdge`. The scrubber's right hand caps at `liveEdge`. Dragging past it parks `playhead` at `liveEdge`; the engine enters `awaiting-stream` until more Steps arrive. "Go live" is `playhead := liveEdge`.

Step replay-from-mid is deterministic against the host DOM (registered selectors + cleanup-stack baseline). No per-frame snapshots needed. See `engine/01-action-schema.md` for `stepDuration` and the action contract.

Event-driven actions (`wait-for-click`, `wait-for-element`) contribute 0 ms — they are **gates** between scrubbable spans, not scrubbable themselves.

---

## What the chat surface renders

Bubble mode (see `01-store-and-controls.md`) lists the messages the way any chat app does — but renders each part by its type:

- `TextPart` → typeset as text in a bubble.
- `WalkthroughPart` → a tile with the plan's `goal` + a "▶ Play" affordance. Clicking detaches the widget to player mode and seeks the playhead to the start of that walkthrough.

The assistant's answer is never typeset as a paragraph; the spread-out version lives on the DOM. The bubble tile is just a handle into it.

---

## What lives where

| Layer | Holds | Lifetime |
|---|---|---|
| Bubble popup | `messages[]` rendered as text + walkthrough tiles | Visible only in bubble mode |
| Detached player | `Timeline` view over `messages[].parts` | Visible only in detached mode |
| Browser store | `Conversation` + derived `Timeline` + local UI (mode, speed, mute) | One widget tab |
| Server | `walkthrough_sessions` + per-message rows + per-walkthrough rows + `walkthrough_steps` | Forever |

The chat input is the only DOM element shared between modes. Both modes append a new `user` `Message` with a `TextPart` (and a `Position` on `parentContext` of the next assistant walkthrough if asked while paused).

---

## Comparison: what changed vs. a normal chat schema

| Concern | Normal chat | Eregna |
|---|---|---|
| Top-level container | `Conversation { messages }` | Same |
| Message | `{ role, parts, createdAt }` | Same |
| Part: text | `{ type: 'text', text }` | Same |
| Part: agent action | `tool_use` / `tool_result` | `walkthrough` (one part-type covers plan + streamed steps) |
| Streaming | `message_start → content_block_*` | Same idea, scoped to our part-types |
| Follow-up context | Just position in the message list | Same, **plus** an optional `Position` on a `WalkthroughPart` to anchor playback |

Everything that isn't in the right column is unchanged. We did not invent a new conversation model.

---

## Quick checklist when extending the model

1. Adding a new part-type → make it a `MessagePart` union member; renderer dispatches on `type`. No schema migration if additive.
2. Adding a field to `WalkthroughPart` that affects timing → contribute to `stepDuration()` so the scrubber stays accurate.
3. Adding a per-message field → mirror on the persisted `messages` row; additive needs no migration.
4. Visitor preferences (mute, default speed) → keep them out of `Conversation`. The conversation is the agent's record; preferences live in local store.

---

## MVP follow-ups (owned elsewhere)

- **Persistence shape.** `data/01-drizzle-schema.md` currently stores a flat `walkthrough_sessions` + `walkthrough_steps`. The message/parts model needs a `messages` row (`session_id`, `role`, `created_at`) and a `walkthroughs` row (`message_id`, `plan_json`, `parent_context_json`, `stream_status`), with `walkthrough_steps.walkthrough_id` + `cumulative_ms`. Until that lands, the client keeps `Conversation` in memory and the single-session-row fallback represents the most recent walkthrough.
- **SSE protocol.** `api/02-streaming-protocol.md` emits `session` → `plan` → `step`* → `done`. With message/parts as first-class, it needs `message_start` (carries `messageId`, `role`) and `walkthrough_start` (carries `walkthroughId`, `parentContext`) before the existing `plan` and `step` events, plus `message_end`.
- **Replay endpoint.** Dashboard playback reads the persisted `messages` + parts and rehydrates `Conversation`. Not in MVP UI; the data shape is in place.
