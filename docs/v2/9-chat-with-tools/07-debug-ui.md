# 9.7 — Widget UI: tool cards, debug toggle, inspector

> What the widget renders. Two surfaces: the chat thread (with
> tool-call cards) and a debug inspector reached via a header toggle.

---

## Two surfaces

```
                widget shell
                     │
                     ▼
             ┌──────────────┐
             │   Header     │   logo · agent name · [debug ⓘ] · close
             └───────┬──────┘
                     │
            debug toggle off ────────► chat surface (default)
                     │
            debug toggle on  ────────► inspector surface
```

The toggle is a one-bit local UI state. It does not change anything
on the server; it just swaps the body of the widget.

---

## Chat surface (default)

```
   Thread
        │
        ├── visitor bubble: "add the blue mug to my cart"
        │
        └── assistant bubble (one per turn)
              │
              ├── text part:  "Let me check that for you."
              │
              ├── tool-call card
              │     │
              │     ├── icon: 🛒  (from spec.display.icon)
              │     ├── label:    "Add to cart"
              │     ├── status:   pending → running → done | error
              │     ├── args:     productId="sku-12"   (if showArgs)
              │     ├── result:   { cartCount: 3 }     (if showResult)
              │     └── timing:   197 ms
              │
              └── text part:  "Done — your cart has 3 items."
```

The bubble grows in place as events arrive. No "thinking…" spinner —
the tool card *is* the progress indicator.

### Card state machine

```
   pending  ──► (server emitted pending-tool-call)
       │
       ▼
   running  ──► (widget invoked handler, timer started)
       │
       ├── ok  ──► done   (show result + elapsed)
       └── err ──► error  (show error message + elapsed)
```

`elapsedMs` is the widget's wall-clock measurement around the
handler call — not the server's. The server gets it back in the
`/resume` body so we have one source of truth across logs.

### What goes in `args` and `result` displays

- `showArgs: true` (default) — render the args as a compact key:value
  list. Long strings get truncated at ~80 chars with a click-to-expand.
- `showResult: true` (default) — same shape, on the result.
- Sensitive args (anything with `password`, `token`, `secret` in the
  key) get masked unconditionally; the spec author shouldn't have to
  remember.

---

## Debug surface (toggle on)

```
   Inspector
        │
        ├── Registered tools (3)
        │     │
        │     ├── 🛒 addToCart   runsIn=client
        │     │     description: "Add a product to the cart…"
        │     │     parameters:  { productId: string (req), quantity: int }
        │     │     handler:     [page-provided]
        │     │
        │     ├── 🔍 searchDocs  runsIn=server   (stub)
        │     │     description: "…"
        │     │     parameters:  …
        │     │
        │     └── ✨ highlightElement  runsIn=client
        │           …
        │
        ├── State (injected by page)
        │     │
        │     {
        │       "user": "alice",
        │       "cartCount": 3
        │     }
        │
        ├── Knowledge (2 entries, page-injected)
        │     │
        │     ├── (source: page) Returns: "30-day window…"
        │     └── (source: page) Shipping: "Free over $50."
        │
        └── Recent events                            [pause] [clear]
              │
              ├── 0.6s  pending-tool-call addToCart   args={…}
              ├── 0.9s  /resume → ok                  elapsedMs=197
              ├── 1.0s  text-delta "Done — …"
              └── 1.0s  message-complete
```

Everything on this page is **local to the widget** — nothing fetched
from the server. The inspector is a view of what the host page just
told `initWidget({…})`, plus a live event tail.

### When debug mode is most useful

- Building a new client tool — confirm the page registered it
  correctly (right name, right schema, handler present).
- Diagnosing a "model never calls my tool" — check description quality
  per `03-tool-format.md`.
- Watching the round-trip on a flaky network — the event tail shows
  every `/resume` arriving.

### What debug mode is NOT

- Not an admin panel. No way to register tools from the inspector.
- Not a server view. Server-side state (checkpointer contents,
  spec validation results) lives in `inspectPrompt`-style server
  endpoints, not here.

---

## Header layout

```
   ┌─────────────────────────────────────────────────────────┐
   │ [logo] Eregna Guide        [debug ⓘ] [✕]              │
   └─────────────────────────────────────────────────────────┘
        │
        widget body (chat OR inspector)
        │
   ┌─────────────────────────────────────────────────────────┐
   │ [text input]                                  [send →]  │
   └─────────────────────────────────────────────────────────┘
```

`[debug ⓘ]` is a small icon button. It toggles a single local state
(no server call). Visible only when the widget is in dev mode
(`initWidget({ debug: true })`) — production builds hide it by
default.

---

## Implementation sketch

```ts
// packages/widget/src/components/chat/ToolCallCard.tsx (sketch)
function ToolCallCard({ call }: { call: ToolCallState }) {
  return (
    <Card>
      <Header>
        {call.spec.display?.icon} {call.spec.display?.label ?? call.spec.name}
        <Status state={call.status} />
      </Header>
      {call.spec.display?.showArgs !== false && <ArgsRow args={call.args} />}
      {call.status === "done"  && <ResultRow result={call.result} />}
      {call.status === "error" && <ErrorRow message={call.error} />}
      <Timing ms={call.elapsedMs} />
    </Card>
  );
}
```

Toolcall state lives in the same store as the message thread; the
NDJSON reader (chapter 06) updates it as events arrive.

---

## Empty / error states

| Situation | Render |
|---|---|
| `initWidget({ tools: [] })` | Inspector shows "No tools registered" |
| Network drops mid-stream | Top of thread: orange banner "Reconnecting…" with the existing partial bubble preserved |
| `409 no-such-run` on `/resume` | Tool card → error state, bubble below: "Lost the connection. Try again." |
| Handler throws | Card → error, error message shown. Model usually recovers in the next turn. |

---

## Cross-references

- `03-tool-format.md` — what fields the inspector reads
- `06-events.md` — the events the cards reflect
- `08-rollout.md` — when each surface lands
