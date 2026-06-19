# 9.6 — Wire protocol: events and resume

> The NDJSON event vocabulary the server emits on `/agent/run` and
> `/agent/resume`, plus the request/response shapes the widget speaks
> back. Everything text-only; no binary frames.

---

## Where this fits

```
   chapter 04 ──► WHY: pause/resume + lifecycle
        │
        ▼
   chapter 05 ──► HOW: createAgent + middleware (code)
        │
        ▼
   chapter 06 ──► WIRE: every line on the network ◄── you are here
        │
        ▼
   chapter 07 ──► UI: how the widget renders these
```

---

## Stream format

Both endpoints respond with `Content-Type: application/x-ndjson`. Each
line is a JSON object with a `kind` discriminator.

```jsonc
{"kind": "run-started", "runId": "R1"}
{"kind": "message-started", "messageId": "m_abc"}
{"kind": "text-delta", "text": "Let me check"}
{"kind": "text-delta", "text": " that for you."}
{"kind": "pending-tool-call", "toolCallId": "call_1", "name": "addToCart", "args": {"productId": "sku-12"}}
```

The widget parses one line at a time. A line that fails to parse is
logged and skipped, not fatal.

---

## Event vocabulary

| `kind` | Direction | Payload | When |
|---|---|---|---|
| `run-started` | server → widget | `{ runId }` | First line of `/agent/run` |
| `run-resumed` | server → widget | `{ runId, toolCallId, elapsedMs }` | First line of `/agent/resume` |
| `message-started` | server → widget | `{ messageId }` | A new assistant message begins (often once per turn) |
| `text-delta` | server → widget | `{ text }` | An LLM token chunk |
| `tool-call-started` | server → widget | `{ toolCallId, name, args, kind: "server" \| "client" }` | Optional preview — server tool about to run |
| `tool-call-result` | server → widget | `{ toolCallId, ok, value, error, elapsedMs }` | Server tool finished (client tools surface this via the next stream) |
| `pending-tool-call` | server → widget | `{ toolCallId, name, args }` | Client tool — widget must execute and POST `/resume` |
| `message-complete` | server → widget | `{ messageId }` | Final assistant reply finished |
| `error` | server → widget | `{ code, message }` | Recoverable; widget shows + stops |

Two design notes:

- The order matters but isn't strict — `text-delta`s can land before
  *or* after `pending-tool-call` depending on whether the model wrote
  any preface text before calling the tool.
- `tool-call-started` is **optional** today (server tools are stubbed).
  Reserve the kind so we don't break the widget when we wire them.

---

## Request bodies

### `POST /agent/run`

```jsonc
{
  "agentPublicId": "abc",
  "query": "add the blue mug to my cart",

  "context": {
    "state":     { "user": "alice", "cartCount": 0 },
    "knowledge": [ { "title": "Returns", "content": "30-day window…" } ],
    "tools": [
      {
        "name": "addToCart",
        "description": "Add a product to the cart…",
        "parameters": { /* JSON Schema with per-field description (chapter 03) */ },
        "runsIn": "client",
        "display": { "icon": "🛒", "label": "Add to cart" }
      }
    ]
  }
}
```

Response: an NDJSON stream of the events above.

### `POST /agent/resume`

```jsonc
{
  "runId": "R1",
  "toolCallId": "call_1",
  "result": { "cartCount": 3 },         // present iff handler succeeded
  "error":  null,                        // string iff handler threw
  "elapsedMs": 197
}
```

Server validates: `runId` exists, latest interrupt's `toolCallId`
matches. On mismatch → 409 `no-matching-pause`. On success →
NDJSON stream that continues the same conversation.

**Multi-call resume (deferred, but reserved shape):**

```jsonc
{
  "runId": "R1",
  "results": [
    { "toolCallId": "call_1", "ok": true,  "value": {...}, "elapsedMs": 197 },
    { "toolCallId": "call_2", "ok": false, "error": "..."  }
  ]
}
```

When we adopt the `id → value` map pattern from HITL § Multiple
Interrupts, the body grows but stays backward-compatible (single-call
form is the degenerate case).

---

## The widget's join logic

A single user turn may span 1..N stream pairs (`/run`, then 0..N
`/resume`s). The widget joins them by **runId** and **messageId**:

```
   POST /agent/run
        ├── run-started        runId = R1
        ├── message-started    messageId = m_1
        ├── text-delta         "Let me check…"
        └── pending-tool-call  toolCallId = c_1
   (close)
                                                      ┌─ widget renders
                                                      │  tool card; runs
                                                      │  handler; gets result
                                                      ▼
   POST /agent/resume { runId:R1, toolCallId:c_1, result, elapsedMs }
        ├── run-resumed        runId = R1, toolCallId = c_1, elapsedMs
        ├── text-delta         "Done — 3 in cart."
        └── message-complete   messageId = m_1
   (close)
```

`messageId` is what the widget uses to **append** text deltas to the
right bubble. The widget treats `pending-tool-call` as a clean
close, not an error.

---

## Idempotency on the wire

- `/agent/resume` is idempotent on `(runId, toolCallId)`. The server
  may safely receive the same payload twice (network retry); the
  second one returns either the same continuation or a 409 if the
  graph already advanced past that pause.
- Each NDJSON event carries enough state to be **replay-safe**: a
  `text-delta` is appended; a `message-complete` finalizes the
  message but is a no-op if already complete.

---

## Error handling

| Server condition | Server response |
|---|---|
| Bad body, validation fails | HTTP 400 JSON (no stream) |
| `runId` unknown on `/resume` | HTTP 409 `no-such-run` (no stream) |
| Interrupt mismatch on `/resume` | HTTP 409 `no-matching-pause` (no stream) |
| Recoverable error mid-stream (LLM 5xx etc.) | NDJSON `error` line, then close |
| Unrecoverable server crash | Connection reset; widget retries `/resume` once |

Widget reaction:

- 4xx → reset the turn, show "Try again."
- 5xx → backoff retry on `/resume`.
- mid-stream `error` → render in the bubble, leave the rest as-is.

---

## A complete trace

```
POST /agent/run
   {"kind":"run-started","runId":"R1"}
   {"kind":"message-started","messageId":"m_1"}
   {"kind":"text-delta","text":"Let me check that for you."}
   {"kind":"pending-tool-call","toolCallId":"c_1","name":"addToCart","args":{"productId":"sku-12"}}
   (close)

POST /agent/resume {runId:"R1",toolCallId:"c_1",result:{cartCount:3},elapsedMs:197}
   {"kind":"run-resumed","runId":"R1","toolCallId":"c_1","elapsedMs":197}
   {"kind":"text-delta","text":"Done — your cart has 3 items."}
   {"kind":"message-complete","messageId":"m_1"}
   (close)
```

That's the whole turn. Two HTTP requests. One assistant bubble.

---

## Cross-references

- `04-execution-model.md` — the lifecycle that produces these events
- `05-chat-loop.md` — `streamAgent()` is where lines are emitted
- `07-debug-ui.md` — how the widget renders this stream
