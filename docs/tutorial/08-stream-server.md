# tutorial/08 — Streaming on the server

File:

```
apps/api/src/services/agent/chat/streamAgent.ts
```

`streamAgent` is the glue between LangGraph's stream output and our wire (frames + chat events). It does two jobs:

1. Read the agent's stream in **two modes** at once.
2. Translate model output into **patches** on the conversation, and translate interrupts into a `pending-tool-call` chat event.

## The dual-mode stream

```ts
const stream = await agent.stream(input, {
  ...config,
  streamMode: ["messages", "updates"],
  signal,
})
```

LangGraph lets you pick what kind of chunks the stream produces. We ask for both:

- **`messages`** — every token of every LLM message. Each chunk looks like `[mode, [aiMessageChunk, metadata]]`.
- **`updates`** — every state change in the graph (including the special `__interrupt__` event).

When you pass an array of modes, each chunk is a tuple: `[mode, payload]`. We branch on `mode`.

## The loop

```ts
for await (const chunk of stream) {
  if (!Array.isArray(chunk)) continue
  const [mode, payload] = chunk as [string, unknown]

  if (mode === "messages") {
    const tuple = payload as [unknown, unknown]
    const msg = tuple[0]
    if (!isAssistantStreamChunk(msg)) continue   // skip ToolMessage chunks etc.

    const text = textFromChunk(msg as BaseMessage)
    if (!text) continue

    assertTextPart(patcher, assistantMsgIndex, textPartIndex)
    h.appendTextChunk(patcher.conversation, assistantMsgIndex, textPartIndex, text)
    await patcher.emit()      // → server writes a patch frame
    await emit({ kind: "text-delta", text })
    continue
  }

  if (mode === "updates") {
    const interruptPayload = extractInterruptPayload(payload)
    if (interruptPayload) {
      await emit(toPendingToolCallEvent(interruptPayload))
      return { paused: true, interrupt: interruptPayload }
    }
  }
}

return { paused: false }
```

### Messages mode — token to patch

For every assistant text chunk:

1. `isAssistantStreamChunk(msg)` filters out non-AI messages like `ToolMessage` resume payloads, which also flow through `messages` mode.
2. `textFromChunk(msg)` extracts the new text from the LangChain chunk.
3. `h.appendTextChunk(...)` mutates the conversation: it appends `text` to `messages[i].parts[j].text`.
4. `patcher.emit()` asks the observer for new diffs, converts them to a `PatchFrame` (using `string-append` for that text path), and writes the frame.
5. `emit({ kind: "text-delta", text })` writes a chat event with the same chunk. Most renderers ignore this and listen only to patches.

### Updates mode — catch the interrupt

`extractInterruptPayload(payload)` looks for `data[INTERRUPT]?.[0]?.value` with `kind === "client-tool-call"`. When found:

- Send `pending-tool-call` to the client.
- Return `{ paused: true, interrupt }`. The caller (`runChatAgent` or `resumeChatAgent`) remembers the `toolCallId` and stops writing to the stream.

The graph state is already saved by `interrupt(...)` — the checkpointer has the snapshot for this `thread_id`. Nothing else to do.

## Safety checks

```ts
function assertTextPart(patcher, assistantMsgIndex, textPartIndex) {
  const part = patcher.conversation.messages[assistantMsgIndex]?.parts[textPartIndex]
  if (!part || part.type !== "text") throw new Error("streamAgent: stale indices ...")
}
```

The indices are captured **once** in `runChatAgent` and reused across patches. If something else mutated the conversation in between, these would point at the wrong slot. The assert turns a silent corruption into a loud failure.

Right after `patcher.emit()`:

```ts
if (patcher.getLog().length === logLen) {
  throw new Error("streamAgent: append produced no patch ops ...")
}
```

If emit produced zero ops, our append did nothing — that means the patcher and conversation are out of sync. Better to crash now than to lose tokens silently.

## Aborts

`agent.stream(input, { signal })` — the `AbortSignal` is forwarded. When the visitor hits stop, `runChatAgent`'s catch block sees the abort, marks streaming messages complete, and rethrows.

## What `streamAgent` does NOT do

- It does not write `hello` (that is `runChatAgent` / `resumeChatAgent`).
- It does not write `end` (same).
- It does not mark the message `complete` or `error` (same).
- It does not save the run to disk (same).

`streamAgent` is just the **inner loop**. The two callers (`run.ts` and `resume.ts`) own the envelope.

Next: [the wire shape end-to-end →](09-stream-wire.md)
