# 9.4 — Execution model: pause and resume

> The mechanics that make a client tool work. **The hard chapter** —
> the wire protocol and lifecycle live here; the implementation lives
> in chapter 05.

---

## Skills this chapter rests on

| Skill | What for |
|---|---|
| `langgraph-human-in-the-loop` | `interrupt()`, `Command({ resume })`, idempotency rules |
| `langgraph-persistence` | checkpointer + `thread_id`; why `MemorySaver` is dev-only |
| `langchain-middleware` | `wrapToolCall` is where our `interrupt()` actually lives |

---

## Why this is the hard part

A streamed HTTP response cannot block waiting for a browser to do
work. So when the model asks for a client tool, the server must:

1. Stop the agent run cleanly mid-loop.
2. Persist enough state to resume *exactly where it stopped*.
3. Tell the widget what to run.
4. Close the stream.
5. Accept a follow-up HTTP request that resumes the same run.

LangGraph ships the primitives:

- **`interrupt(payload)`** — pauses the current node and surfaces
  `payload` to the caller.
- **Checkpointer** — saves state at every super-step, keyed by
  `thread_id`.
- **`Command({ resume })`** — input to the next `invoke`/`stream` that
  hands the value back to `interrupt()`.

We *don't* hand-roll a `StateGraph` for the chat loop — `createAgent`
ships that. We hook `interrupt()` into the loop via a
`wrapToolCall` middleware. Chapter 05 has the full code; this
chapter is about what flows across the wire.

---

## The two HTTP endpoints

```
   widget                                    server
   ──────                                    ──────

   POST /agent/run    ─────────────────────► creates runId
                                             builds agent + spec map
                                             pins runId as thread_id
                                             streams NDJSON
                                             on interrupt → flush + close

   POST /agent/resume {runId, toolCallId,
                       result, elapsedMs}
                       ─────────────────────► looks up runId in cache /
                                              rebuilds against checkpoint
                                              streams NDJSON
                                              on next interrupt → again
                                              else → final reply + END
```

Each turn is one *or more* short streams, joined by `/agent/resume`
POSTs. The widget joins them into one assistant bubble visually.

---

## End-to-end trace of one client-tool turn

```
   t=0.0s   widget   POST /agent/run { query: "add the blue mug" }
   t=0.0s   server   create runId=R, build agent, spec map, config = { thread_id: R }
   t=0.1s   server   stream "run-started"
   t=0.6s   server   agent's internal loop calls addToCart
                    wrapToolCall middleware sees runsIn=client
                    interrupt({ kind:"client-tool-call", toolCallId:"call_1", … })
                    checkpointer persists state under thread_id=R
   t=0.6s   server   stream "pending-tool-call" + CLOSE
   t=0.6s   widget   reads event; renders "calling addToCart…" card
   t=0.7s   widget   registry.get("addToCart").handler({productId})
   t=0.9s   widget   handler resolves → { cartCount: 3 }
   t=0.9s   widget   POST /agent/resume {
                       runId: R, toolCallId: "call_1",
                       result: { cartCount: 3 }, elapsedMs: 197
                     }
   t=0.9s   server   load cached agent for R (checkpoint state intact)
                    invoke(Command({resume:{ok:true,value:{cartCount:3}}}))
                    wrapToolCall resumes; pushes ToolMessage; loop continues
   t=1.0s   server   loop iter 2: model emits final prose "Done — 3 in cart."
                    no more tool calls → END
   t=1.0s   server   stream text deltas + "message-complete" + CLOSE
   t=1.0s   widget   appends text to the same assistant bubble
```

The user sees **one** bubble whose body grew: first the tool-call card,
then the final sentence.

---

## What the checkpoint actually stores

Per `thread_id`, the checkpointer holds:

- the latest `messages` array (HumanMessage, AIMessages, ToolMessages),
- any other state fields registered on the agent,
- the pending interrupt payload (the structured args we passed to
  `interrupt({...})`),
- a versioned history (LangGraph keeps prior checkpoints — handy for
  time-travel debugging; prune in prod).

For MVP: `MemorySaver` in `apps/api/src/services/agent/workflow/checkpointer.ts`.
For prod: replace with `PostgresSaver` later. Same interface, no
agent changes.

> Why this matters: with `MemorySaver`, every server restart wipes
> all paused runs. The widget would receive a `409 no-such-run` on
> the next `/resume` and have to start over. `langgraph-persistence`
> calls this out explicitly.

---

## Idempotency (the rule that keeps biting people)

When the graph resumes, the node containing `interrupt()` restarts
**from the top**. For our `wrapToolCall` middleware:

```ts
wrapToolCall: async (request, handler) => {
  const call = request.tool_call;        // re-runs on resume
  const spec = specByName.get(call.name); // re-runs on resume
  if (spec?.runsIn !== "client") return await handler(request);

  const resumed = interrupt({...});       // boundary

  return new ToolMessage({...});          // only runs on the resume side
}
```

Lines above `interrupt()` re-run **every** resume. Lines below run
once. The HITL skill spells this out — quoted here for emphasis:

> "When the graph resumes, the node restarts from the **beginning** —
> ALL code before `interrupt()` re-runs."

If you add a side effect to the middleware (audit log, metric,
DB write), make it **upsert**, **idempotent**, or put it after the
`interrupt()`.

---

## Failure modes

| Failure | What happens | Recovery |
|---|---|---|
| Widget crashes after `pending-tool-call` | Checkpoint sits at `thread_id=R` forever | TTL cleanup; visitor restarts the run |
| Widget POSTs `/resume` with stale `toolCallId` | Server returns 409 `no-matching-pause` | Widget shows error, restarts |
| Client handler throws | Widget POSTs `{ error: "…" }`; resume payload carries `ok: false`; model sees error in ToolMessage | Model usually apologizes and asks the visitor for help |
| Network drops mid-stream after interrupt | Checkpoint is intact; widget retries `/resume` | Idempotent on `toolCallId` — server replays the same continuation |
| Two `/resume` calls race | Server detects checkpoint version mismatch | First wins; second gets 409 |
| Process restart with `MemorySaver` | All paused runs disappear | Mitigation: use `PostgresSaver` |

TTL on cached runs + idempotency on `toolCallId` are the two things
to get right. Everything else falls out of LangGraph + checkpointer.

---

## Server tools — the stub

```ts
// when spec.runsIn === "server"
return await handler(request);
// → tool body runs → returns "{ ok: false, error: "server-tools-not-wired-yet" }"
```

That body lives on the `tool()` we built in chapter 05 step 1. When
we revisit server tools we replace that body with a registry lookup
and a per-agent allow-list. No effect on the checkpointer, the HTTP
contract, or the widget side.

---

## The "what stays open" question

| Stream | Stays open as long as | Ends on |
|---|---|---|
| `/agent/run` | the agent is actively producing tokens OR a non-interrupt node is running | first `__interrupt__` OR final reply complete |
| `/agent/resume` | same | same |

The widget treats `pending-tool-call` as a *clean* close, not an
error. The follow-up `POST /agent/resume` is what continues the turn.
This is the protocol contract — chapter 06 has the event vocabulary
and the widget's join logic.

---

## Cross-references

- `05-chat-loop.md` — the actual code (`createAgent` + middleware)
- `06-events.md` — every NDJSON line in the trace above
- `07-debug-ui.md` — how the widget joins streams into one bubble
- Skills: `langgraph-human-in-the-loop`, `langgraph-persistence`,
  `langchain-middleware`
