# 9.5 — The chat loop, canonical pattern

> Uses `createAgent` from LangChain plus a custom `wrapToolCall`
> middleware for the client-tool interrupt. Replaces the earlier
> hand-rolled `StateGraph` + "invoke then re-stream" sketch — same
> behavior, native framework primitives.

---

## Skills this chapter rests on

| Skill | What we use from it |
|---|---|
| `ecosystem-primer` | This is LangChain (`createAgent`) territory, not raw LangGraph |
| `langchain-fundamentals` | `createAgent`, `tool()`, `createMiddleware({ wrapToolCall })` |
| `langgraph-human-in-the-loop` | `interrupt()`, `Command({ resume })`, idempotency rules |
| `langgraph-persistence` | checkpointer + `thread_id` |

Re-read **HITL § Side Effects Before Interrupt Must Be Idempotent**
before editing the middleware — the function re-runs on resume.

---

## What changed from earlier drafts

| Earlier draft (hot fix) | Now (canonical) |
|---|---|
| Hand-rolled `chatNode` with `bindTools` + `invoke` + manual route | `createAgent` ships the loop |
| "Invoke first to detect tool calls, then stream the same prompt for prose" | `agent.stream(..., { streamMode: ["messages","updates"] })` — one pass |
| Custom `addConditionalEdges` on a `StateGraph` | None — the agent's internal graph routes |
| For-loop with inline `interrupt()` per tool call | `wrapToolCall` middleware — one hook covers every call |

The behavior the user sees is identical. The implementation matches the
framework's intent.

---

## The loop in one block (TypeScript)

```ts
import { createAgent, createMiddleware } from "langchain";
import { interrupt, MemorySaver, Command } from "@langchain/langgraph";
import { tool } from "@langchain/core/tools";
import { HumanMessage, ToolMessage } from "@langchain/core/messages";
import { jsonSchemaToZod } from "@/agent/util/jsonSchemaToZod";

export function buildChatAgent(ctx: AgentContext, specs: ToolDescriptor[]) {
  const specByName = new Map(specs.map((s) => [s.name, s]));

  // 1. ToolDescriptor v2  →  LangChain tools
  //    Body only runs for server tools (stubbed for now). Client tools
  //    are intercepted by middleware before reaching the body.
  const tools = specs.map((spec) =>
    tool(
      async () => JSON.stringify({ ok: false, error: "server-tools-not-wired-yet" }),
      {
        name: spec.name,
        description: spec.description,
        schema: jsonSchemaToZod(spec.parameters),
      },
    ),
  );

  // 2. Middleware: client tools pause via interrupt().
  //    Signature per `langchain-middleware` skill:
  //      wrapToolCall: async (request, handler) => ToolMessage | string
  //      request.tool_call = { id, name, args }
  const clientToolMiddleware = createMiddleware({
    name: "client-tool-interrupt",
    wrapToolCall: async (request, handler) => {
      const call = request.tool_call;
      const spec = specByName.get(call.name);
      if (spec?.runsIn !== "client") return await handler(request);

      // PAUSE. Checkpointer persists state under thread_id.
      // Widget executes the tool and POSTs /agent/resume.
      const resumed = interrupt({
        kind: "client-tool-call",
        toolCallId: call.id,
        name: call.name,
        args: call.args,
      });

      return new ToolMessage({
        tool_call_id: call.id,
        content: JSON.stringify(resumed),
      });
    },
  });

  // 3. The agent. checkpointer is REQUIRED for interrupt() to work.
  return createAgent({
    model: ctx.agent.model,                  // "anthropic:claude-sonnet-4-5" etc.
    tools,
    systemPrompt: composeSystemPrompt(ctx),
    middleware: [clientToolMiddleware],
    checkpointer: new MemorySaver(),         // PostgresSaver in prod
  });
}
```

That's the whole loop. The model→tools→model→tools→…→final-reply
cycle lives inside `createAgent`. Our only customization is the
middleware that hijacks tool execution for `runsIn: "client"`.

---

## Starting a run (`POST /agent/run`)

```ts
app.post("/agent/run", async (req, res) => {
  const { agentPublicId, query, context } = req.body;
  const runId = nanoid();

  const specs = validateTools(context.tools);            // chapter 03
  const ctx   = await loadContext(agentPublicId, context);
  const agent = buildChatAgent(ctx, specs);
  rememberRun(runId, { agent, specs });                  // for /resume

  const config = { configurable: { thread_id: runId } };

  res.setHeader("content-type", "application/x-ndjson");
  emit(res, { kind: "run-started", runId });

  await streamAgent(
    agent,
    { messages: [new HumanMessage(query)] },
    config,
    res,
  );
  res.end();
});
```

The `rememberRun` cache holds the agent + specs by `runId` so the
resume endpoint can rebuild against the same checkpointer. In a
single-process dev build that's a `Map`; with `PostgresSaver` the
state lives in the DB and we just rebuild the agent and reattach.

---

## Resuming a run (`POST /agent/resume`)

```ts
app.post("/agent/resume", async (req, res) => {
  const { runId, toolCallId, result, error, elapsedMs } = req.body;

  const cached = lookupRun(runId);
  if (!cached) return res.status(409).json({ error: "no-such-run" });

  // For now: one tool call per turn. Multi-call resumes use the
  // id→value map shape from HITL § Multiple Interrupts.
  const resume = error ? { ok: false, error } : { ok: true, value: result };

  const config = { configurable: { thread_id: runId } };

  res.setHeader("content-type", "application/x-ndjson");
  emit(res, { kind: "run-resumed", runId, toolCallId, elapsedMs });

  await streamAgent(cached.agent, new Command({ resume }), config, res);
  res.end();
});
```

Two things from the skills:

- `Command({ resume })` is the **only** Command pattern valid as
  invoke/stream input. Never pass `Command({ update: … })` —
  HITL skill: "graph appears stuck."
- The same `thread_id` is mandatory; mismatched ids start a new
  thread instead of resuming.

---

## Streaming events to the widget

```ts
async function streamAgent(agent, input, config, res) {
  for await (const [mode, payload] of agent.stream(input, {
    ...config,
    streamMode: ["messages", "updates"],
  })) {
    if (mode === "messages") {
      const [chunk] = payload;            // [AIMessageChunk, metadata]
      if (chunk.content) {
        emit(res, { kind: "text-delta", text: chunk.content });
      }
    } else if (mode === "updates") {
      if (payload.__interrupt__) {
        const [intr] = payload.__interrupt__;
        emit(res, { kind: "pending-tool-call", ...intr.value });
        return;                           // close — widget POSTs /resume
      }
    }
  }
  emit(res, { kind: "message-complete" });
}
```

`streamMode: ["messages", "updates"]` is the pair that gives us both
token-by-token text *and* the `__interrupt__` marker
(`langgraph-fundamentals` § Stream Mode Selection).

Chapter 06 has the full NDJSON event vocabulary.

---

## Idempotency rule (from the HITL skill)

When the graph resumes, the node containing `interrupt()` restarts
from the top. For our middleware that means `specByName.get(name)`
and `interrupt(...)` both re-execute. Both are pure — fine.

If you ever add a side effect to the middleware (telemetry write,
audit log, etc.), apply the HITL rules:

- **upsert, not insert** for any pre-interrupt write;
- or place the side effect **after** the `interrupt()` so it only
  runs on the resume side.

The skill calls this out explicitly: "the node restarts from the
**beginning** — all code before `interrupt()` re-runs."

---

## Multi-call turns (deferred, but here's the path)

For the simplest first ship we ask the system prompt to **emit one
tool call at a time**. The wire shape stays single-tool.

When we want parallel client-tool calls, HITL § Multiple Interrupts
is the recipe:

- `wrapToolCall` interrupts independently per call.
- Resume body builds an `id → value` map and passes it as
  `Command({ resume: resumeMap })`.

No middleware or agent change. Only the prompt and the
`/agent/resume` body shape change.

---

## Checkpointer choice

```ts
// dev — state lost on process restart
const checkpointer = new MemorySaver();

// prod — survives restarts, deploys, multi-instance
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
const checkpointer = PostgresSaver.fromConnString(process.env.DATABASE_URL!);
// Run once at deploy time: await checkpointer.setup();
```

Per `langgraph-persistence`: never use `MemorySaver` in production.
The thread state — and therefore every paused run — vanishes on the
next deploy.

---

## Things deliberately omitted

- **Token-by-token streaming of tool-call JSON.** We let the model
  emit the full tool-call message before the middleware sees it.
  Optimization for later.
- **Concurrent client tools in one turn.** Serial today; HITL multi-
  interrupt pattern when we need it.
- **Retries.** A failed tool returns `{ ok: false, error }` to the
  model; the model decides what to do. No framework retry.

---

## Cross-references

- `04-execution-model.md` — pause/resume mechanics, lifecycle trace
- `06-events.md` — the NDJSON events emitted above
- `07-debug-ui.md` — how the widget renders them
- Skills: `langchain-fundamentals`, `langgraph-human-in-the-loop`,
  `langgraph-persistence`
