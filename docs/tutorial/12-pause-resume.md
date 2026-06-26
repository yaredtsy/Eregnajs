# tutorial/12 — Pause and resume, end to end

You have seen each piece. This file puts them together for the **client tool** case — the only case where the run actually pauses.

Files involved:

```
apps/api/src/services/agent/chat/run.ts         ← runChatAgent: first POST
apps/api/src/services/agent/chat/resume.ts      ← resumeChatAgent: second POST
apps/api/src/services/agent/runs/cache.ts       ← in-memory map of paused runs
apps/api/src/services/agent/workflow/middleware/clientToolInterrupt.ts
packages/widget/src/chat/agent/runStream.ts     ← drives the loop on the widget
packages/widget/src/chat/agent/resume.ts        ← the resume POST
```

## The full sequence

```
Widget                          API server                  LangGraph + LLM
──────                          ──────────                  ───────────────
ask("...")
POST /run  ──────────────────▶  runChatAgent
                                ├─ composeContext
                                ├─ buildChatAgent (createAgent + middleware + checkpointer)
                                ├─ rememberRun(runId, ...)    ← save patcher, agent, indices
                                └─ streamAgent(agent.stream)  ─▶ tokens
       ◀── hello                                                 │
       ◀── run-started                                           │
       ◀── patch (user msg)                                      │
       ◀── patch (assistant msg shell)                           │
       ◀── message-started                                       │
       ◀── patch (text-append) ◀──────────────────────────────── │ ◀── model writes text
       ◀── patch (text-append) ◀──────────────────────────────── │ ◀── model writes text
                                                                  │
                                                                  │ ◀── model emits tool call
                                middleware.wrapToolCall:
                                  spec.runsIn === "client"
                                  → interrupt({client-tool-call})
                                                                  │
                                streamAgent sees __interrupt__ in
                                  "updates" mode
       ◀── pending-tool-call(toolCallId, name, args)
                                setPendingToolCall(runId, toolCallId)
                                streamAgent returns {paused: true}
                                runChatAgent returns "paused"
                                (HTTP response ends — connection closed)

run client tool locally
POST /resume ────────────────▶  resumeChatAgent
{runId, toolCallId, result}     ├─ validateResumeRequest
                                ├─ lookupRun(runId) → cached
                                ├─ cached.patcher.setOnFrame(new stream)
                                ├─ clearPendingToolCall(runId)
                                └─ streamAgent(
                                     agent.stream(
                                       new Command({ resume: { ok, value } }),
                                       { configurable: { thread_id: runId } }
                                     )
                                   )
                                                                  │
                                LangGraph reads checkpointer for thread_id
                                  → restores graph state
                                  → interrupt(...) returns the resume value
                                middleware wraps it in ToolMessage
                                  → model loop continues
       ◀── run-resumed(runId, toolCallId, elapsedMs)              │
       ◀── patch (text-append) ◀──────────────────────────────── │ ◀── model writes "thanks!"
       ◀── patch (status → complete)
       ◀── message-complete
       ◀── end
                                forgetRun(runId)
                                runs.save(...)   ← persist for debug/replay
```

## What survives the pause

The **server** keeps:

- The `Patcher` (so seq numbers keep going and the conversation is the same object).
- The `agent` runnable.
- The assistant `messageId`, `assistantMsgIndex`, `textPartIndex`.
- The `usageLedger` for token accounting.
- The `threadId` (same as `runId`) which is the key into the checkpointer.

All of these live in `runs/cache.ts` as a `CachedRun`, keyed by `runId`. TTL is 24h.

The **LangGraph state** lives in the checkpointer (currently `MemorySaver`, future `PostgresSaver`).

The **client** keeps:

- The `runId` (received in `hello`).
- The local `Conversation` (kept in React state).
- The `AbortController` for the current stream.

## Why we re-point `onFrame`

The first `/run` request opened a response stream. When the run paused, that response closed. The `Patcher` is still alive, but its `onFrame` callback points at a **closed** pipe.

On `/resume`, we hand the patcher a new callback:

```ts
cached.patcher.setOnFrame((frame) => opts.onFrame({ kind: "patch", ...frame }))
```

Now the next `patcher.emit()` writes to the new response. The widget sees one continuous stream of `seq` numbers across both HTTP requests.

## Things that can go wrong

- **Resume with the wrong runId** → `validateResumeRequest` throws. The widget surfaces an error and the user retries.
- **Resume with the wrong toolCallId** → also validated. Protects against the model retrying or stale callbacks.
- **Client tool throws** → the widget sends `{ error: "..." }` instead of `{ result }`. The middleware wraps it as a `ToolMessage` with an error payload. The model decides what to do — usually it apologises and continues.
- **Browser closes the tab before resuming** → the `CachedRun` sits in memory until TTL. Nothing bad; just garbage. The next run for the visitor is a new run.

## Recap of the keys

- `runId` — identifies a single chat turn. Used by the widget on resume.
- `thread_id` — what LangGraph calls the same id. Used by the checkpointer to find saved state.
- `toolCallId` — identifies one tool call inside the turn. Used by the middleware and by `pending-tool-call`.

They are all set once and never change.

Next: [glossary →](13-glossary.md)
