# Fix 01 — patcher / `initialConv` divergence

> The chat-agent path emits chat events (`hello`, `run-started`,
> `message-started`, `pending-tool-call`) but **never emits any
> `patch` frames**. Result: the widget sees no user bubble, no
> assistant bubble, no text part — tool-call card has nothing to
> attach to. The "background" wire log the visitor pasted is correct
> for what the server actually sent.

---

## Symptom (the wire the user pasted)

```jsonc
{"kind":"hello","runId":"RF1Ne_NSAt","protocol":2,"conversation":{"sessionId":"…","agentName":"Eregna Guide","messages":[]}}
{"kind":"run-started","runId":"RF1Ne_NSAt"}
{"kind":"message-started","messageId":"xT3bL7LnQD"}
{"kind":"pending-tool-call","toolCallId":"…","name":"openPricingDialog","args":{}}
```

What's **missing** between every pair of those lines:

```jsonc
{"kind":"patch","seq":0,"ops":[…addUserMessage…]}      // ◄ should appear after hello
{"kind":"patch","seq":1,"ops":[…addAssistantMessage…]} // ◄ should appear before message-started
{"kind":"patch","seq":2,"ops":[…addTextPart…]}         // ◄ should appear before message-started
```

The widget renders bubbles from `patch` frames. No patches → empty
conversation → nothing rendered. The chat events are still emitted
because they bypass the patcher entirely.

---

## Root cause: two conversation objects, one of them ignored

```
   chat/run.ts:41-47
        │
        │   initialConv = { sessionId, agentName, messages: [] }
        ▼
   createPatcher(initialConv, onFrame)            patcher/createPatcher.ts:12-17
        │
        │   conv = structuredClone(initialConv)   ◄ patcher's OWN copy
        │   observer = observe(conv)              ◄ observes the CLONE
        ▼
   patcher.conversation === conv (the clone)
                                                  ─────────────────────────────────
   chat/run.ts:74,78,79,83  ─►  h.addUserMessage(initialConv, …)
                                h.addAssistantMessage(initialConv, …)
                                h.addTextPart(initialConv, …)
                                       │
                                       │   mutates initialConv, NOT conv
                                       ▼
   patcher.emit()  ─►  generate(observer)  ─►  0 ops  ─►  no frame
```

`createPatcher` clones its input (line 16). The patcher's observer
watches *the clone*. The chat runner then mutates `initialConv`
(the *original*), which is invisible to the observer. `generate()`
returns an empty op list, `emit()` short-circuits at
`createPatcher.ts:24`, no frame is written.

This matches the live wire output exactly:
- `hello` carries the original `initialConv` (still empty) → OK.
- `run-started` / `message-started` / `pending-tool-call` go through
  `onChatEvent` (not `onFrame`) → OK.
- Every `patcher.emit()` between them is a no-op.

The old `streamText` path didn't have this bug because it did:

```ts
// nodes/streamText.ts:12
const conv = patcher.conversation;
h.addUserMessage(conv, …);     // ◄ mutates the patcher's clone
```

The new `chat/run.ts` uses `initialConv` instead — that's the
regression.

---

## Fix: use `patcher.conversation` for every mutation

One file: `apps/api/src/services/agent/chat/run.ts`.

### Lines to change

Replace every read or mutation of `initialConv` *after* `createPatcher`
returns with a read or mutation of `patcher.conversation`. Concretely:

| Line | Current | Change to |
|---|---|---|
| 72 | `initialConv.agentName = fullCtx.agent.name ?? initialConv.agentName;` | `patcher.conversation.agentName = fullCtx.agent.name ?? patcher.conversation.agentName;` |
| 74 | `h.addUserMessage(initialConv, nanoid(10), opts.query);` | `h.addUserMessage(patcher.conversation, nanoid(10), opts.query);` |
| 78 | `h.addAssistantMessage(initialConv, messageId);` | `h.addAssistantMessage(patcher.conversation, messageId);` |
| 79 | `const assistantMsgIndex = initialConv.messages.length - 1;` | `const assistantMsgIndex = patcher.conversation.messages.length - 1;` |
| 83 | `const textPartIndex = h.addTextPart(initialConv, assistantMsgIndex);` | `const textPartIndex = h.addTextPart(patcher.conversation, assistantMsgIndex);` |

The `hello` frame at line 53-58 should keep emitting `initialConv`
— that's the *initial* document the widget bootstraps from. After
that, every mutation must go through `patcher.conversation`.

### Optional cleanup

Rename `initialConv` → `bootstrapConv` (or similar) and stop touching
it after the `hello` frame goes out. This makes the seam explicit
and prevents the same regression next time.

---

## Why the patches order matters

The widget reads frames in order. The bubble shape depends on patches
arriving *before* the events that reference them:

```
   patch:addUserMessage     ──►  user bubble appears
   patch:addAssistantMessage ──► empty assistant bubble appears
   patch:addTextPart         ──► empty text part inside assistant bubble
   chat-event: message-started ◄ widget can now attach token deltas
   chat-event: pending-tool-call ◄ widget can now attach a tool card
                                  to the (now-existing) assistant bubble
```

If the patches never arrive, the widget has nowhere to attach the
text-delta or pending-tool-call events — they're effectively dropped.

---

## Verification checklist

After applying the change:

- [ ] Server stream contains `patch` frames between `hello` and
      `message-started`.
- [ ] First `patch` frame's ops include `addUserMessage` for the
      query the visitor typed.
- [ ] Second `patch` frame's ops include `addAssistantMessage`.
- [ ] Third `patch` frame's ops include `addTextPart`.
- [ ] Widget renders the user bubble, empty assistant bubble, then a
      tool-call card (pending) when the client tool fires.
- [ ] Resuming via `/agent/resume` produces `text-delta` frames and a
      `message-complete` frame; widget completes the bubble.

A unit test would catch this. Suggested shape: invoke the chat
runner with a stub `onFrame` collector and assert that at least one
`patch` frame is written before the first `chat-event` beyond
`run-started` fires.

---

## Same trap to check elsewhere

`apps/api/src/services/agent/chat/resume.ts` does similar bookkeeping
on the resume path. Re-read it for the same pattern — every mutation
must use `cached.patcher.conversation`, not a separately-held
conversation reference. The cache shape (`runs/cache.ts`) stores
`patcher`, so `cached.patcher.conversation` is the correct accessor.

---

## Related

- `9-chat-with-tools/06-events.md` § "The widget's join logic" — the
  event-order contract that this bug violates.
- `8-chat-subagent-review/06-context-and-runtime.md` — the old
  `streamText` path that this code was meant to replace.
- Original buggy commit: introduces `chat/run.ts` as the entry point
  but holds on to `initialConv` post-`createPatcher`.
