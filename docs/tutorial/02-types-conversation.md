# tutorial/02 — Types: the Conversation document

All types in this file live in:

```
packages/walkthrough-core/src/conversation/types.ts
```

This is the **chat document** — the thing both server and client hold a copy of. Every patch the agent emits is a small change to one of these objects.

## The top: `Conversation`

```ts
export type Conversation = {
  sessionId: string
  agentName: string
  messages: Message[]
}
```

A conversation is a list of `Message`s. That is the whole top-level shape.

## One step down: `Message`

```ts
export type Message = {
  id: string
  role: "user" | "assistant"
  parts: MessagePart[]
  status: "streaming" | "complete" | "error"
  createdAt: number
  metadata?: MessageMetadata
}
```

- `role`: who said it. The visitor is `user`, the agent is `assistant`.
- `parts`: a message is **not just a string**. It is a list of typed parts (so we can mix prose with rich UI like a walkthrough).
- `status`: lifecycle of this message.
  - `streaming` while the model is still writing it.
  - `complete` once we send `message-complete`.
  - `error` if the run failed.
- `metadata.tokenUsage`: cost report we attach when the run is done.
- `metadata.stopped`: client sets this when the visitor hits stop.

## `MessagePart` — text or walkthrough

```ts
export type MessagePart = TextPart | WalkthroughPart
```

For the **chat agent**, you will only see `TextPart` in normal use:

```ts
export type TextPart = { type: "text"; text: string }
```

A message can have many parts. Today the chat agent adds exactly **one** text part per assistant message and appends tokens to it as the model writes. The `WalkthroughPart` type is used by the older walkthrough agent path; the chat agent does not produce one yet.

## Why parts and not just a string?

So the same `Message` type works for:

- A plain chat reply (one `TextPart`).
- A walkthrough reply (a `WalkthroughPart` with steps and popovers).
- A future reply that mixes text, a tool-call card, and a chart.

The renderer walks `parts` in order. Adding a new kind of content means adding a new part type, not changing the message shape.

## Where it is created

For a normal chat turn, the server builds the assistant message like this (in `services/agent/chat/run.ts`):

```ts
h.addAssistantMessage(conv, messageId)           // empty message
const textPartIndex = h.addTextPart(conv, msgIx) // one empty text part
// ... then streamAgent appends tokens to that part
```

The helpers in `services/agent/patcher/helpers.ts` are the only place we should mutate the conversation. They keep the shape sound and produce clean patches.

## Why the type matters

Every line on the wire is a small change to **this exact shape**. If you understand `Conversation → Message → MessagePart`, you can read any patch the server sends and know what field it is touching.

Next: [types for what travels on the wire →](03-types-frames.md)
