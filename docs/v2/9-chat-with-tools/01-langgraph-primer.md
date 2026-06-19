# 9.1 — LangGraph primer (just enough)

> The minimum LangChain / LangGraph concepts you need to follow the rest
> of this folder. For canonical API and patterns, **invoke the skills**
> — they are the authoritative source and stay current with the
> framework.

> | Concept here | Skill to invoke for the canonical version |
> |---|---|
> | Which framework layer to pick | `langchain-skills:ecosystem-primer` |
> | `createAgent`, `tool()`, model strings | `langchain-skills:langchain-fundamentals` |
> | `StateGraph`, reducers, edges, stream modes | `langchain-skills:langgraph-fundamentals` |
> | `interrupt()`, `Command({ resume })`, idempotency | `langchain-skills:langgraph-human-in-the-loop` |
> | Checkpointers, `thread_id`, time-travel | `langchain-skills:langgraph-persistence` |
> | Middleware: `wrapToolCall`, hooks | `langchain-skills:langchain-middleware` |
>
> Treat this chapter as conceptual orientation. When you sit down to
> write code, the skills are where you look up the actual API.

---

## The mental model

```
                       LangChain                 LangGraph
                       ─────────                 ─────────

   "wraps a model"     ChatOpenAI / ChatAnthropic / etc.
                       .bindTools([...])         .invoke / .stream

   "wraps a workflow"                            StateGraph
                                                 Annotation.Root
                                                 nodes + edges
                                                 checkpointer
                                                 interrupt() / resume
```

- **LangChain** = the model SDK + tool binding + message types.
- **LangGraph** = a tiny state-machine library on top, designed for
  agent loops with side effects and persistence.

You already use both: `prompts/compose.ts` imports LangChain message
types; `workflow/graph.ts` builds a `StateGraph`.

---

## The five concepts that matter here

### 1. Annotated state

```ts
const State = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (a, b) => a.concat(b),       // append on update
    default: () => [],
  }),
  toolCalls: Annotation<ToolCall[]>({ ... }),
});
```

`State` is the **whole context** the graph carries between nodes. The
**reducer** says how an update merges into the prior value. For chat,
`messages` is append-only; for transient flags, last-write-wins (which
is what `reducer: (_, n) => n` does in the existing graph).

### 2. Nodes

A node is a function `(state) => Partial<State>` (or async generator).
You write one node per "kind of work". For chat-with-tools, you'll have
three:

```
   chatNode       ─── call the model, decide: reply or tool
   serverToolNode ─── run server tools, append results to messages
   (interrupt)    ─── inside chatNode for client tools
```

### 3. Edges (conditional routing)

```ts
graph
  .addNode("chat", chatNode)
  .addNode("serverTool", serverToolNode)
  .addEdge(START, "chat")
  .addConditionalEdges("chat", (state) => {
    const last = state.messages.at(-1);
    if (last?.tool_calls?.length) return "serverTool";   // or "clientTool"
    return END;                                          // final reply
  })
  .addEdge("serverTool", "chat")        // feed result back to model
```

Conditional edges are how the *loop* gets formed. The graph isn't a
DAG — it's a state machine.

### 4. Checkpointer (the persistence layer)

```ts
import { MemorySaver } from "@langchain/langgraph";
const checkpointer = new MemorySaver();        // dev
// const checkpointer = new PostgresSaver(...)  // prod (chapter 04)

const app = graph.compile({ checkpointer });
```

A checkpointer **saves the State after every node** under a
`thread_id`. That makes the graph **resumable** — you can stop in the
middle of a run and pick up later with the same `thread_id`. This is
the load-bearing piece for client-side tools.

### 5. `interrupt()` + `Command(resume=…)`

Inside a node:

```ts
import { interrupt } from "@langchain/langgraph";

const result = interrupt({
  kind: "client-tool-call",
  toolCallId,
  name,
  args,
});
// graph pauses here. When you invoke again with Command(resume=payload),
// `result` receives payload and execution continues.
```

The first call to `interrupt(...)` raises a special `GraphInterrupt`.
The runtime catches it, **checkpoints state**, and stops. The next
invocation:

```ts
import { Command } from "@langchain/langgraph";
await app.invoke(new Command({ resume: { result: { ok: true, value: 42 } } }),
                 { configurable: { thread_id: runId } });
```

…and the node resumes with `result === { ok: true, value: 42 }`. From
inside the node it looks like a function call that took an arbitrary
amount of time.

This is exactly what we need: chat node hits a client tool → interrupts
→ HTTP request ends → widget runs the tool → POSTs the result →
`/agent/resume` calls `app.invoke(Command({resume: …}))` → node continues.

---

## Tool binding (LangChain side)

The model needs to *know* which tools exist. LangChain handles this:

```ts
import { tool } from "@langchain/core/tools";
import { z } from "zod";

const getOrderStatus = tool(
  async ({ orderId }) => {
    // server-side body — runs in the node, not on the model
    return await db.orders.status(orderId);
  },
  {
    name: "getOrderStatus",
    description: "Look up the status of an order by id.",
    schema: z.object({ orderId: z.string() }),
  },
);

const modelWithTools = chatModel.bindTools([getOrderStatus, /* …others… */]);
```

Calling `modelWithTools.invoke(messages)` returns either:
- a normal `AIMessage` with `.content` (final reply), or
- an `AIMessage` with `.tool_calls = [{ id, name, args }]` (tool call).

You inspect `.tool_calls` in the conditional edge to route.

---

## The whole loop in 20 lines (conceptual)

```ts
const State = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (a, b) => a.concat(b),
    default: () => [],
  }),
});

async function chatNode(state) {
  const reply = await modelWithTools.invoke(state.messages);
  // if reply.tool_calls includes a client tool, interrupt() (chapter 04)
  return { messages: [reply] };
}

async function serverToolNode(state) {
  const lastMsg = state.messages.at(-1);
  const results = await Promise.all(
    lastMsg.tool_calls.map((c) => runServerTool(c)),
  );
  // ToolMessage entries with { tool_call_id, content }
  return { messages: results };
}

graph
  .addNode("chat", chatNode)
  .addNode("serverTool", serverToolNode)
  .addEdge(START, "chat")
  .addConditionalEdges("chat", route)   // → "serverTool" | END (or interrupt for client)
  .addEdge("serverTool", "chat");
```

That's the whole story. The rest of this folder is plugging real
pieces (streaming, client tools, host extension, widget UI) into this
skeleton.

---

## Things people get wrong the first time

- **Mutating state directly.** Don't. Return a partial; the reducer
  merges. Treat state as immutable.
- **Streaming and tool calling at the same time.** LangChain *can*
  stream a tool-call message (token by token), but for the simplest
  shape, **invoke** the model when you suspect tool use and **stream**
  only the final reply turn. Chapter 05 has the simple rule.
- **Forgetting the checkpointer.** Without one, `interrupt()` throws
  and the graph cannot resume. Use `MemorySaver` for dev, a Postgres
  checkpointer for prod.
- **One `thread_id` per session is fine.** You don't need a new id per
  user turn. The graph uses the latest checkpoint under that id.

---

## Cross-references

- `@langchain/langgraph` JS docs — `Annotation`, `StateGraph`,
  `MemorySaver`, `interrupt`, `Command`
- `apps/api/src/services/agent/workflow/graph.ts` — the current,
  one-node graph we'll extend
- chapter 04 covers `interrupt()` in detail with our actual payloads
