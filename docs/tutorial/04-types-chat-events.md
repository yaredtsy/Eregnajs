# tutorial/04 — Types: ChatEvent

All types in this file live in:

```
apps/api/src/services/agent/chat/events.ts
```

Frames (`hello` / `patch` / `end`) carry **document changes**. `ChatEvent`s carry **lifecycle signals** — start, stop, tool-call requests, errors. They flow on the same NDJSON stream but have a different shape.

## The full union

```ts
export type ChatEvent =
  | { kind: "run-started";    runId: string }
  | { kind: "run-resumed";    runId: string; toolCallId: string; elapsedMs?: number }
  | { kind: "message-started"; messageId: string }
  | { kind: "text-delta";      text: string }
  | { kind: "pending-tool-call"; toolCallId: string; name: string; args: Record<string, unknown> }
  | { kind: "message-complete"; messageId: string }
  | { kind: "error";           code: string; message: string }
```

One by one:

### `run-started`

The very first chat event after `hello`. The runId here matches the `hello.runId`.

### `run-resumed`

Sent on the `/resume` request when a paused run picks back up. `elapsedMs` is how long the client took to run the tool.

### `message-started`

A new assistant message is about to receive tokens. The `messageId` matches the `Message.id` already added to the document.

### `text-delta`

A small chunk of assistant text. The widget can show it directly for instant feedback, but the source of truth is still the patch that arrives at the same time and appends to `parts/0/text`. (Most renderers just listen to the patches and ignore `text-delta`.)

### `pending-tool-call`

The agent wants to call a tool that lives in the browser. The server stops the agent, sends this event, and waits for `/resume` with the result.

- `toolCallId` — id the client must echo back when it resumes.
- `name` — the tool name registered by the host page.
- `args` — what the model wants to pass to the tool.

### `message-complete`

The assistant message is done streaming. The status flips from `streaming` to `complete`.

### `error`

Something went wrong inside the agent.

## How does the wire tell a frame from a chat event?

Same NDJSON stream, but they have **different shapes**:

- A frame has `kind: "hello" | "patch" | "end"`.
- A `ChatEvent` has any of the kinds above.

On the widget, `consumeAgentStream` parses each line and looks at `kind`:

```ts
if (isChatEvent(parsed)) handlers.onChatEvent?.(parsed)
else {
  const frame = toRunFrame(parsed)
  if (frame) handlers.onFrame(frame)
}
```

## Why two channels?

- **Frames** are about the **document**. Anyone replaying the run can apply patches to rebuild the conversation.
- **Chat events** are about the **run lifecycle**. They are useful for the UI (show a spinner, animate a tool card) and for resume control (the runId, the toolCallId), but they do not change the document.

The split keeps replay simple: drop all chat events, apply all frames, you get the same conversation back.

## Helper

When the agent middleware interrupts for a client tool, the payload is a `ClientToolInterruptPayload`. A tiny helper turns it into a `pending-tool-call` event:

```ts
export interface ClientToolInterruptPayload {
  kind: "client-tool-call"
  toolCallId: string
  name: string
  args: Record<string, unknown>
}

export function toPendingToolCallEvent(p: ClientToolInterruptPayload) {
  return { kind: "pending-tool-call", toolCallId: p.toolCallId, name: p.name, args: p.args }
}
```

Next: [the agent-facing types — tools and context →](05-types-tools-context.md)
