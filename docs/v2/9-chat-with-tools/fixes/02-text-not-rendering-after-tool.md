# Fix 02 — assistant text doesn't render after a client-tool call

> **Symptom (from the debug log):**
> ```
> message-started id=wqbPlFWUWn
> pending-tool-call switchTab { "tab": "c" }
> /resume → ok elapsedMs=1
> text-delta "{"ok":true,"value":{"tab":"c"}}"      ◄ this is wrong (Bug A)
> text-delta "I've"
> text-delta " switched"
> ...                                                 ◄ correct prose tokens
> text-delta "!"
> message-complete
> end status=complete
> ```
> Tool-call card renders. Text bubble stays empty. **Two bugs at play
> — the first explains the garbage delta; the second explains why
> *nothing* renders.**

---

## Bug A — ToolMessage content streamed as assistant text

The middleware in `workflow/middleware/clientToolInterrupt.ts:24-27`
returns a `ToolMessage` carrying the resumed value:

```ts
return new ToolMessage({
  tool_call_id: call.id ?? "",
  content: JSON.stringify(resumed),     // {"ok":true,"value":{"tab":"c"}}
});
```

LangGraph's `streamMode: "messages"` re-emits any new message in
state, including this `ToolMessage`, as a stream chunk.
`streamAgent.ts:60` then runs `textFromChunk(msg)` on it
indiscriminately and gets back the JSON string. The result is emitted
as a `text-delta`:

```
text-delta "{"ok":true,"value":{"tab":"c"}}"
```

If the rendering were working, the assistant bubble would start with
that JSON, then continue with the prose. That's not desirable
either — `ToolMessage` chunks should be skipped.

### Fix A (small, targeted)

In `streamAgent.ts`, only treat chunks as text if they came from an
AI message. The streamed tuple is `[message, metadata]`:

```ts
import type { AIMessage, AIMessageChunk } from "@langchain/core/messages";

// ...inside the for-await loop, mode === "messages":
const tuple = payload as [unknown, unknown];
const msg = tuple[0] as { _getType?: () => string } | null;

// Only AI message chunks carry assistant prose.
if (msg?._getType?.() !== "ai") continue;

const text = textFromChunk(msg as AIMessage | AIMessageChunk);
if (text) { /* ... unchanged ... */ }
```

`_getType()` returns `"ai"`, `"tool"`, `"human"`, `"system"` for the
respective `BaseMessage` subclasses. Filtering to `"ai"` drops the
ToolMessage chunk cleanly.

This is independent of Bug B below — apply both.

---

## Bug B — text deltas appear on the wire but no `patch` frames carry them

This is the one that's actually hiding the text.

### How text reaches the bubble (the contract)

```
   server                                          widget
   ──────                                          ──────

   streamAgent.ts:60-64
        │
        ├─► h.appendTextChunk(                      [reducer]
        │      patcher.conversation,                APPLY_PATCH ──► applyPatchFrame
        │      assistantMsgIndex,                          │
        │      textPartIndex, text)                        │
        │                                                  ▼
        ├─► patcher.emit()  ◄── generates ops?      state.conversation.messages[N].parts[0].text grows
        │      │                                          │
        │      ▼                                          ▼
        │   onFrame({ kind: "patch", ... })         MessageList → MessageBubble → Part
        │      │                                          │
        │      ▼                                          ▼
        │   PATCH frame on wire                     <p className="eregna-msg__text">{part.text}</p>
        │
        └─► emit({ kind: "text-delta", text })      onChatEvent — only used for debug tail
                                                    (useAgentRun.tsx:89-96)
```

**The `text-delta` chat event you see in the debug tail and the
`patch` frame that actually carries the text are two separate emit()
calls.** The chat event fires unconditionally inside
`if (text)`; the patch fires only when `appendTextChunk` produced a
real mutation that `patcher.emit()` then observes.

### Why `appendTextChunk` is silently no-op'ing

`patcher/helpers.ts:30-40`:

```ts
export function appendTextChunk(conv, messageIndex, partIndex, chunk): void {
  const part = conv.messages[messageIndex]?.parts[partIndex];
  if (part?.type === "text") {
    part.text += chunk;
  }
}
```

Optional chaining. If `conv.messages[messageIndex]?.parts[partIndex]`
is `undefined`, the `if` is skipped, nothing mutates, `patcher.emit()`
finds 0 ops, **no patch frame is written** — but `text-delta` *still
fires* because it's emitted right after, unconditionally.

That's exactly what the wire log shows: many `text-delta`s, zero
visible text in the bubble.

### What's gone stale, exactly

The tool card renders, so we know `state.toolCalls` has an entry with
`messageId === wqbPlFWUWn`. We also know — because `MessageList:22`
filters `state.toolCalls` by `message.id` and the card actually
renders — that `state.conversation.messages` **does** contain a
message with id `wqbPlFWUWn`. So the `addUserMessage` and
`addAssistantMessage` patches reached the widget.

What we **don't** know: whether the `addTextPart` patch also reached
the widget, and whether the server's `cached.patcher.conversation`
*still has* the text part at `messages[assistantMsgIndex].parts[textPartIndex]`
when the resume stream calls `appendTextChunk`.

The two most likely places it broke:

1. **`addTextPart` patch never emits.** If `patcher.emit()` between
   `addTextPart` and `streamAgent` finds no ops (race with `await`s),
   the widget never adds the text part, and *every later*
   `appendTextChunk` no-ops because `parts[0]` is undefined on the
   widget side. (Server-side it works, but widget never sees text.)

2. **The cached `assistantMsgIndex` / `textPartIndex` are off by one
   on the resume path.** If the widget's clone of the conversation
   started with non-empty `messages` (from `getConversation()` in
   `useAgentRun.tsx:79`) and the server's `initialConv` was empty,
   the server's index says `1` but the widget expects it at e.g. `3`.
   The patch ops carry absolute paths (`/messages/3/parts/0/text`)
   that don't exist on the server's mirror.

### Diagnostic — three minutes

These three checks pin down the cause:

#### Check 1 — Network panel

Open DevTools → Network → click the `/agent/resume` request → Response.
You should see lines like:

```jsonc
{"seq":5,"ops":[{"op":"string-append","path":"/messages/1/parts/0/text","value":"I've"}]}
```

between every `text-delta`. If you only see `text-delta` lines and no
`patch` frames during resume → **Case 1** (patcher generating zero ops).

If you see patch frames but the path is `/messages/3/...` while the
hello-frame's conversation has fewer messages → **Case 2** (index
mismatch).

If you see patch frames with `/messages/N/parts/0/text` and the
widget has at least N+1 messages → patches *should* be applying.
Jump to Check 3.

#### Check 2 — Server-side log

Add a one-line probe to `streamAgent.ts:60`, just before
`appendTextChunk`:

```ts
const part = patcher.conversation
  .messages[assistantMsgIndex]?.parts[textPartIndex];
console.log("[chat] append", {
  text: text.slice(0, 20),
  msgCount: patcher.conversation.messages.length,
  assistantMsgIndex,
  textPartIndex,
  hasPart: part?.type === "text",
});
h.appendTextChunk(patcher.conversation, assistantMsgIndex, textPartIndex, text);
```

If `hasPart: false` fires on resume → **Case 1**. The cached patcher's
conversation lost the text part somewhere between `/agent/run`
returning `"paused"` and `/agent/resume` calling `streamAgent`.

#### Check 3 — Widget state inspection

React DevTools → widget context provider → `state.conversation.messages`.

- Find the assistant message (`id === "wqbPlFWUWn"` per the log).
- Inspect its `parts` array.
- If `parts` is empty → the `addTextPart` patch never landed.
- If `parts` has a text part but `text` is empty → text-delta patches
  aren't applying (path mismatch with `applyPatchFrame`).
- If `parts` has the text and it's populated → it's a CSS/render
  problem; check that `.eregna-msg__text` is visible.

---

## Likely root cause and fix

Given:
- `text-delta` events fire (so the model is producing text).
- Tool card renders (so the assistant message is in widget state).
- No text renders (so either the text part is missing on the widget
  side, or the appendTextChunk on the server is no-op'ing).

The strongest single hypothesis is **Case 2 — index mismatch**.

Look at `useAgentRun.tsx:79`:
```ts
conversation: getConversation(),  // ◄ widget sends its conv to server
```

And `chat/run.ts:41-47`:
```ts
const initialConv = opts.conversation
  ? structuredClone(opts.conversation)
  : { sessionId: runId, agentName: ..., messages: [] };
```

If the widget had prior turns, `initialConv` arrives with those
messages already in `messages: [...]`. Then:

- Server: `assistantMsgIndex = patcher.conversation.messages.length - 1`
  → say `5` (4 prior + 1 just-added).
- Server emits patches with paths `/messages/5/...`. Correct.
- Widget applies them — they match its own message at index `5`. ✓

So that *should* line up. **Unless the server's `initialConv` is
not what the widget sent.** Probe by logging
`initialConv.messages.length` on entry to `chat/run.ts`.

**If `initialConv.messages.length === 0` on entry but the widget
believes it has prior turns**, that's the bug — the request body's
`conversation` field is being dropped somewhere between
`useAgentRun.tsx:79` and `chat/run.ts:41`. Likely culprits:

- The HTTP route handler not forwarding `body.conversation` to
  `runAgent` opts.
- A validator stripping unknown fields.

Verify: log the request body's `conversation` field at the route
handler (`routes/agent.ts` or `routes/public.ts` where `runAgent`
is called).

---

## Add an assertion to fail loud

Either way, this class of bug should never silently produce blank
text. Add this in `streamAgent.ts` right before `appendTextChunk`:

```ts
const msg = patcher.conversation.messages[assistantMsgIndex];
const part = msg?.parts[textPartIndex];
if (!part || part.type !== "text") {
  throw new Error(
    `streamAgent: stale indices — msgCount=${patcher.conversation.messages.length}` +
    ` assistantMsgIndex=${assistantMsgIndex}` +
    ` partType=${part?.type ?? "missing"}`,
  );
}
```

If this throws, you have an immediate, attributable error in the
server log instead of silently-empty text. Catch it once, fix the
cause, then it never fires again.

---

## Verification checklist after the fix

- [ ] Bug A fix landed: only AI chunks emit `text-delta` (no
      `{"ok":true,...}` line on the wire).
- [ ] Bug B fix landed: assertion in `streamAgent` passes; patch
      frames with `string-append` to `/messages/N/parts/0/text` appear
      on the resume stream between every `text-delta`.
- [ ] Widget assistant bubble shows the prose after the tool card.
- [ ] React DevTools confirms `state.conversation.messages[N].parts[0].text`
      grows as deltas arrive.

---

## Related

- `01-patcher-conv-divergence.md` — same family of trap; same
  technique (assert the patcher mirror has what we expect before
  mutating).
- `9-chat-with-tools/06-events.md` § "The widget's join logic" — text
  rides on `patch`, not on `text-delta`.
- `apps/api/src/services/agent/runs/cache.ts` — verify
  `cached.patcher` is the live reference (it is — stored as
  `Patcher` in a `Map`, no serialization).
