# 9.0 — Overview

> One page. The vision, the new pieces, and the single hard thing
> (pause/resume) called out so it can't be skipped.

---

## The before/after picture

```
       BEFORE                           AFTER
       ──────                           ─────

   visitor question                 visitor question
        │                                │
        ▼                                ▼
   chat subagent                    chat node
        │                                │
        ▼                                ▼
   stream prose ─► widget           propose: prose OR tool-calls
                                         │
                              ┌──────────┼──────────┐
                              ▼          ▼          ▼
                          prose       server     client
                                       tool       tool
                                         │          │
                                         ▼          ▼
                                       run       INTERRUPT
                                       inline    flush+close
                                         │          │
                                         │          │  widget runs it
                                         │          │  POST /resume
                                         │          ▼
                                         │      new HTTP req
                                         │      graph resumes
                                         │          │
                                         ▼          ▼
                                       feed result back into chat node
                                                    │
                                                    ▼
                                            keep looping until prose
```

The loop ends the moment the model proposes a normal prose reply with
no tool calls.

---

## What's new (in three sentences)

- The chat **node** can now call tools — model output is parsed as
  *either* a tool call *or* a final reply.
- Server tools run inline; **client tools** force the LangGraph node to
  `interrupt()`, the HTTP stream to flush + close, and the widget to
  run + resume.
- The widget shows each tool call as a live card (status, timing,
  args, result); a header **debug toggle** flips the surface into an
  inspector of what the page registered.

---

## The single hard thing

A streamed HTTP response cannot block waiting for a browser to do
work. So the loop **isn't one long stream** — it's one or more
short streams, joined by `/agent/resume` POSTs.

```
   stream #1  ──► model picks tool → INTERRUPT → flush "pending-tool" event → CLOSE
                                                          │
                                                          ▼
   widget executes tool, POSTs { runId, toolCallId, result }
                                                          │
                                                          ▼
   stream #2  ◄── server resumes graph from checkpoint, feeds result, model continues
                       (may call another tool — repeat — or emit final prose and END)
```

Two parts make this work:
- LangGraph's **`interrupt()`** primitive inside the chat node
- A **checkpointer** persisting graph state across HTTP requests, keyed
  by `runId`

Both ship with `@langchain/langgraph`. Chapter 04 covers it end-to-end.

---

## Host-extensible tools (the "user can extend" part)

```
   page <head>:
   ┌─────────────────────────────────────────┐
   │ initWidget({                            │
   │   agentPublicId: "...",                 │
   │   tools: [                              │
   │     {                                   │
   │       name: "addToCart",                │
   │       description: "Add product to…",   │
   │       parameters: { …JSON schema… },    │
   │       runsIn: "client",                 │
   │       handler: async ({ productId }) => │
   │         shop.addToCart(productId)       │
   │     },                                  │
   │     { name: "getOrderStatus", runsIn:   │
   │       "server" }                        │
   │   ],                                    │
   │   state: { user: "alice", cart: [] },   │
   │   knowledge: [                          │
   │     { title: "Return policy", … },      │
   │   ],                                    │
   │ })                                      │
   └─────────────────────────────────────────┘
```

- `runsIn: "client"` — the page brings a `handler` function; the
  widget calls it when the server emits a tool event.
- `runsIn: "server"` — the page only declares the name; the **server**
  must have a registered handler for that name (chapter 03).

The server validates against an *allow-list* per agent (so a malicious
page can't conjure tools that don't exist). That's the trust boundary.

---

## What the widget does (high level)

| Surface | Today | After |
|---|---|---|
| Chat thread | text bubbles | text bubbles + tool-call cards |
| Header | logo + close | logo + close + **debug toggle** |
| Debug mode | n/a | inspector: registered tools, current state, knowledge |
| Streaming | text chunks | text chunks + tool events + interrupt marker |

---

## What we're explicitly *not* solving here

- **Auth.** Tools that need credentials carry the credential out-of-band;
  the design doesn't address how. Add later.
- **Long-running server tools.** A tool that takes 30 seconds blocks the
  stream. Solve when needed by treating long server tools the same way
  as client tools (interrupt + poll). Same primitives, different trigger.
- **Tool retries / backoff.** First call returns success or failure;
  the model can choose to retry. No framework-level retry.
- **Prompt rework.** `8-chat-subagent-review/` is on hold.

---

## How to read the rest

Read in order if you're new to LangGraph:

1. `01-langgraph-primer.md` — just enough to understand the loop
2. `02-architecture.md` — where each box lives in the repo
3. `03-tool-format.md` — the descriptor shape
4. `04-execution-model.md` — server vs client, pause/resume
5. `05-chat-loop.md` — the actual LangGraph nodes
6. `06-events.md` — wire protocol + `/resume` endpoint
7. `07-debug-ui.md` — widget surfaces
8. `08-rollout.md` — milestones

Skip to chapter 04 if you already know LangGraph.
