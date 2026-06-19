# 9.2 — Architecture

> Top-down map. Client tools lead because they're the harder half — if
> the design handles them, server tools are a degenerate case.

---

## The system in one picture

```
   ┌──────────────────────────────────────────────────────────────────┐
   │  HOST PAGE (customer site)                                       │
   │                                                                  │
   │   initWidget({                                                   │
   │     agentPublicId,                                               │
   │     tools: [                                                     │
   │       { name: "addToCart", runsIn: "client",                     │
   │         parameters: {...}, handler: ({productId}) => ... },      │
   │       { name: "highlightElement", runsIn: "client", ... },       │
   │       { name: "getOrderStatus", runsIn: "server" }               │
   │     ],                                                           │
   │     state: { user, cart, ... },                                  │
   │     knowledge: [ {title, content}, ... ],                        │
   │   })                                                             │
   │      │                                                           │
   │      ▼                                                           │
   │   ┌──────────────────────────────────────────────────────────┐   │
   │   │  WIDGET (browser)                                        │   │
   │   │                                                          │   │
   │   │   ┌──────────────────────────────────────────────────┐   │   │
   │   │   │  client-tool registry                            │   │   │
   │   │   │   Map<name, { schema, handler }>                 │   │   │
   │   │   │  (built from initWidget tools where runsIn=client)│  │   │
   │   │   └──────────────────────────────────────────────────┘   │   │
   │   │                       ▲                                  │   │
   │   │                       │ lookup by name                   │   │
   │   │   ┌──────────────────────────────────────────────────┐   │   │
   │   │   │  client-tool executor                            │   │   │
   │   │   │   on "pending-tool-call" event from server:      │   │   │
   │   │   │     1. validate args against schema              │   │   │
   │   │   │     2. invoke handler, await result              │   │   │
   │   │   │     3. POST /agent/resume with { runId, id, …}   │   │   │
   │   │   │     4. attach the new stream to the same thread  │   │   │
   │   │   └──────────────────────────────────────────────────┘   │   │
   │   │                                                          │   │
   │   │   chat thread UI  ▸  tool-call cards  ▸  text bubbles    │   │
   │   │   header + debug toggle ──► inspector view               │   │
   │   └─────────────┬────────────────────────┬───────────────────┘   │
   └─────────────────┼────────────────────────┼───────────────────────┘
                     │ POST /agent/run        │ POST /agent/resume
                     │ NDJSON stream          │ NDJSON stream
                     ▼                        ▼
   ┌──────────────────────────────────────────────────────────────────┐
   │  SERVER (apps/api)                                               │
   │                                                                  │
   │   loadContext ──► buildChatAgent(ctx, specs) ──► agent.stream()  │
   │                                                                  │
   │                ┌─────────────────┐                               │
   │                │   createAgent   │   (LangChain — the loop)      │
   │                │   + checkpointer│                               │
   │                │   + middleware  │                               │
   │                └────────┬────────┘                               │
   │                         │                                        │
   │              every tool call goes through                        │
   │              wrapToolCall middleware:                            │
   │                         │                                        │
   │              ┌──────────┴──────────┐                             │
   │              ▼                     ▼                             │
   │       runsIn: "client"      runsIn: "server"                     │
   │              │                     │                             │
   │              ▼                     ▼                             │
   │       interrupt(payload)     handler() (stubbed for now)         │
   │       flush "pending"        ToolMessage(result)                 │
   │       close stream                                               │
   │       checkpoint state                                           │
   │                                                                  │
   │   tools/                                                         │
   │     types.ts             ToolDescriptor v2                       │
   │     validate.ts          schema validation (per-property gate)   │
   │     jsonSchemaToZod.ts   helper for createAgent's tool schema    │
   └──────────────────────────────────────────────────────────────────┘
```

Top half = browser, bottom half = server. The two POSTs are the seam
between them.

---

## Lifecycle of a client-tool turn (the interesting case)

```
   user types "add the blue mug to my cart"
        │
        ▼
   widget POSTs /agent/run
        │
        ▼
   server: loadContext, chatNode invokes model with bindTools([
            ...clientToolSpecs,        ◄── declared by the page
            ...serverToolSpecs          ◄── registry.ts
          ])
        │
        ▼
   model returns AIMessage(tool_calls=[
     { id: "call_1", name: "addToCart", args: { productId: "blue-mug" } }
   ])
        │
        ▼
   chatNode classifies: "addToCart" → CLIENT
        │
        ▼
   interrupt({ kind: "client-tool-call",
               toolCallId: "call_1",
               name: "addToCart",
               args: { productId: "blue-mug" } })
        │
        ├── checkpointer persists state under thread_id = runId
        └── server flushes "pending-tool-call" event + closes stream
        │
        ▼
   widget executor receives event:
     - registry.get("addToCart")
     - validate args (zod schema from initWidget)
     - call handler({ productId: "blue-mug" })
     - measure elapsed_ms, capture result or error
        │
        ▼
   widget POSTs /agent/resume {
     runId, toolCallId: "call_1",
     result: { ok: true, value: { cartCount: 3 } },
     elapsedMs: 142
   }
        │
        ▼
   server: app.invoke(Command({ resume: ... }), { thread_id: runId })
        │
        ▼
   chatNode resumes, appends ToolMessage(tool_call_id="call_1", content=…)
        │
        ▼
   model returns AIMessage(content="Done — your cart has 3 items.")
        │
        ▼
   server streams text chunks → END, close stream
```

The widget *visually* shows this as one assistant turn. Underneath, it
was two HTTP requests, one LangGraph run, one checkpoint, two streams.

---

## Lifecycle of a server-tool turn (the simple case)

```
   user types "where is my order?"
        │
        ▼
   widget POSTs /agent/run
        │
        ▼
   server: chatNode → model returns tool_calls=[
     { id: "call_2", name: "getOrderStatus", args: { orderId: "X1" } }
   ]
        │
        ▼
   chatNode classifies: "getOrderStatus" → SERVER → route to serverToolNode
        │
        ▼
   serverToolNode looks up registry.ts handler, runs it,
   appends ToolMessage(tool_call_id="call_2", content="shipped")
        │
        ▼
   chatNode runs again → model returns prose
        │
        ▼
   server streams text → END, close stream
```

One HTTP request. No checkpoint dance — the loop stays in-process.

---

## Repo layout (proposed)

```
apps/api/src/services/agent/
        │
        ├── tools/                          ◄── NEW
        │     ├── types.ts                  ToolDescriptor v2, ToolKind
        │     ├── validate.ts               schema validation + per-property
        │     │                             description gate
        │     └── jsonSchemaToZod.ts        helper for createAgent
        │
        ├── workflow/
        │     ├── chatAgent.ts              ◄── NEW (createAgent factory)
        │     ├── checkpointer.ts           ◄── NEW (MemorySaver dev / PG prod)
        │     └── middleware/
        │           └── clientToolInterrupt.ts  ◄── NEW (wrapToolCall)
        │
        ├── runs/
        │     └── cache.ts                  ◄── NEW (runId → { agent, specs })
        │
        └── http/
              ├── run.ts                    POST /agent/run
              └── resume.ts                 ◄── NEW: POST /agent/resume

packages/widget/src/
        │
        ├── runtime/
        │     ├── clientTools/              ◄── NEW
        │     │     ├── registry.ts         Map<name, { schema, handler }>
        │     │     ├── executor.ts         runs handlers, measures time
        │     │     └── validate.ts         (zod, shared)
        │     ├── stream.ts                 NDJSON reader (existing)
        │     └── resume.ts                 ◄── NEW POSTs /agent/resume,
        │                                       opens follow-up stream
        │
        ├── components/
        │     ├── chat/
        │     │     ├── Thread.tsx
        │     │     └── ToolCallCard.tsx    ◄── NEW
        │     └── debug/                    ◄── NEW
        │           ├── DebugToggle.tsx     header button
        │           └── Inspector.tsx       registered tools / state / knowledge
        │
        └── api/
              └── init.ts                   initWidget({ tools, state, knowledge })
```

The widget's `clientTools/` subdirectory mirrors the server's `tools/`
on purpose — same vocabulary, same validation, two homes.

---

## Trust boundaries

```
                          server (trusted)
                                ▲
                                │  every /agent/resume payload
                                │  is verified: thread_id valid,
                                │  toolCallId matches the interrupt,
                                │  result shape matches the tool schema
                                │
                          browser (UNTRUSTED)
                                │
                                │  client tools registered at
                                │  initWidget() time live in the
                                │  page's own JS — they can do
                                │  anything the page can do
                                │
                          host page (UNTRUSTED)
                                │
                                │  declares which tools exist
                                │  (subject to per-agent allow-list)
```

Rule of thumb: **never trust a client-tool result for anything
security-sensitive.** If the model says "the user is now logged in",
the server must verify by other means. Client tools are great for UX
side effects (add to cart, scroll, highlight) and weak as authority.

---

## What stays unchanged

- The NDJSON patch protocol (chapter 06 just adds new patch kinds).
- `AgentContext` shape (chapter 03 just gives `hostTools` a richer
  element type; the field itself already exists).
- The existing chat prompt (the rework in `8-chat-subagent-review/`
  remains parked).

---

## Cross-references

- `00-overview.md` — the lifecycle dendrogram in shorter form
- `01-langgraph-primer.md` — `interrupt()`, `Command`, checkpointer
- `03-tool-format.md` — `ToolDescriptor` v2 shape
- `04-execution-model.md` — the pause/resume mechanics in detail
