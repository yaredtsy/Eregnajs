# 9.8 — Rollout

> The order. Each milestone is independently shippable. Nothing here is
> a big-bang. Acceptance criteria at the end so "done" is unambiguous.

---

## Milestones, top to bottom

```
                          today
                            │
                            ▼
   M1  Skeleton agent     ─── createAgent + MemorySaver, no tools, replaces
                              streamText node behind a flag
                            │
                            ▼
   M2  Tool descriptor v2 ─── types.ts + validateTools + per-field-description
                              gate. No execution yet.
                            │
                            ▼
   M3  Client-tool MW     ─── createMiddleware({ wrapToolCall }) +
                              /agent/resume endpoint. End-to-end paused
                              run works against a hand-coded tool.
                            │
                            ▼
   M4  Widget init API    ─── initWidget({ tools, state, knowledge });
                              client-tool registry + executor on the widget
                            │
                            ▼
   M5  Tool-call card     ─── ToolCallCard UI; NDJSON events drive its state
                            │
                            ▼
   M6  Debug toggle       ─── header button + inspector surface
                            │
                            ▼
   M7  PostgresSaver      ─── swap MemorySaver in prod; cached-run TTL
                            │
                            ▼
                          (server tools later — chapter 03 stub is in place)
```

Each box is one or two PRs. The chat path stays green between every
milestone — the flag in M1 makes that explicit.

---

## M1 — Skeleton agent

Files:
- `apps/api/src/services/agent/workflow/checkpointer.ts` — `new MemorySaver()`
- `apps/api/src/services/agent/workflow/nodes/chatAgent.ts` — `createAgent({ model, tools: [], systemPrompt, checkpointer })`
- `apps/api/src/services/agent/workflow/graph.ts` — feature-flagged route to the new node

Acceptance:
- Feature flag off → existing behavior identical.
- Feature flag on → same chat output, but routed through `createAgent`.
- `pnpm test` green.
- Run with `LANGSMITH_TRACING=true` shows the new graph in LangSmith.

---

## M2 — Tool descriptor v2

Files:
- `apps/api/src/services/agent/tools/types.ts` — `ToolDescriptor`, `ToolKind`
- `apps/api/src/services/agent/tools/validate.ts` — JSON Schema sanity +
  per-property-`description` gate (rejects specs without descriptions)
- `apps/api/src/services/agent/tools/jsonSchemaToZod.ts` — helper

Acceptance:
- Posting a tool list with a property missing `description` returns
  400 with the offending path.
- `pnpm test` covers: valid spec passes; missing description fails;
  invalid runsIn fails.
- No execution wired yet — surviving specs are dropped on the floor.

---

## M3 — Client-tool middleware + /agent/resume

Files:
- `apps/api/src/services/agent/workflow/middleware/clientToolInterrupt.ts`
- `apps/api/src/services/agent/http/run.ts` — wire tools into agent
- `apps/api/src/services/agent/http/resume.ts` — NEW endpoint
- `apps/api/src/services/agent/runs/cache.ts` — `runId → { agent, specs }`

Acceptance (server-side end-to-end with curl):
- `POST /agent/run` with one `runsIn: "client"` tool → stream ends
  with a `pending-tool-call` line.
- `POST /agent/resume` with `{ runId, toolCallId, result }` → stream
  resumes with `run-resumed`, then text deltas, then `message-complete`.
- Stale `toolCallId` → 409 `no-matching-pause`.
- LangSmith trace shows the interrupt + resume on the same `thread_id`.

---

## M4 — Widget init API + client-tool runtime

Files:
- `packages/widget/src/api/init.ts` — `initWidget({ tools, state, knowledge, debug? })`
- `packages/widget/src/runtime/clientTools/registry.ts`
- `packages/widget/src/runtime/clientTools/executor.ts` — runs handler,
  measures time, catches errors
- `packages/widget/src/runtime/resume.ts` — POSTs `/agent/resume`,
  reads the follow-up NDJSON stream and merges into the same bubble

Acceptance:
- Demo page with a `console.log` tool. Ask "call test for me." → bubble
  shows tool card with `running`, then `done`, then text reply.
- Throwing handler → card shows `error`, model recovers in next prose.
- Network drop after `pending-tool-call` → widget re-POSTs `/resume`
  once with backoff.

---

## M5 — Tool-call card UI

Files:
- `packages/widget/src/components/chat/ToolCallCard.tsx`
- supporting bits: `Status`, `ArgsRow`, `ResultRow`, `Timing`

Acceptance:
- Visual states: pending, running, done, error.
- `showArgs: false` and `showResult: false` honored.
- Sensitive args (`password`, `token`, `secret`) auto-masked.
- A storybook-style fixture page renders all four states.

---

## M6 — Debug toggle + inspector

Files:
- `packages/widget/src/components/header/DebugToggle.tsx`
- `packages/widget/src/components/debug/Inspector.tsx`
- A small event-tail store that records the last N NDJSON lines

Acceptance:
- Toggle off in production builds.
- Inspector lists registered tools, current state, knowledge entries.
- Event tail updates in real time during a chat run.
- Toggling between chat and inspector doesn't lose the in-flight bubble.

---

## M7 — PostgresSaver in production

Files:
- `apps/api/src/services/agent/workflow/checkpointer.ts` — env-driven
  selection (`MemorySaver` in dev, `PostgresSaver` in prod)
- migration: create the checkpoint tables (`checkpointer.setup()` at
  deploy time, once)

Acceptance:
- A paused run survives an API restart.
- `runs/cache.ts` TTL cleans up paused runs older than 24 h.
- LangSmith trace links across the restart on the same `thread_id`.

---

## What "done" looks like (one-screen check)

```
   ▣ feature flag default ON; old streamText node removed
   ▣ ToolDescriptor v2 enforced (per-property descriptions required)
   ▣ /agent/run streams text + tool events end-to-end
   ▣ /agent/resume continues the same thread_id, idempotent on toolCallId
   ▣ initWidget({ tools, state, knowledge }) — host page registers
   ▣ ToolCallCard renders pending → running → done | error
   ▣ Header debug toggle + Inspector surface
   ▣ PostgresSaver in production with paused-run TTL
   ▣ One example client tool wired in `7-guide-agent/`
```

If every box ticks, this folder is shipped.

---

## What this rollout explicitly leaves for later

| Deferred | Trigger |
|---|---|
| Server-tool registry + allow-list | First customer asks for a server-side action |
| Concurrent client tool calls in one turn | First conversation where serial latency hurts |
| Streaming tool-call deltas | Profile says tool-call latency is a UX problem |
| Tool auth / OAuth handshakes | First tool that needs a per-visitor scope |
| Context engineering rework (`8-chat-subagent-review/`) | After this is stable in prod |

Each has a home in the docs. Don't re-litigate here.

---

## End of folder

Back to the [README](./README.md). The architecture goals from the
overview (`00-overview.md`) should all read as "shipped" once M1–M7
land.
