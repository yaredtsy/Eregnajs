# tutorial/06 — Orchestrating the agent with `createAgent`

File:

```
apps/api/src/services/agent/workflow/chatAgent.ts
```

This is the heart of the chat agent. One function — `buildChatAgent` — wires the model, the tools, the system prompt, the middleware, and a checkpointer into a single runnable.

## What `createAgent` is

`createAgent` comes from the `langchain` package. It is a tiny LangGraph that loops:

```
[ model call ]  →  [ if tool calls → run tools → loop back ]  →  end
```

You give it a chat model and a list of tools, and it returns a runnable graph you can `.invoke(...)` or `.stream(...)`. The agent decides when to call tools and when to stop.

We do **not** build a graph by hand. `createAgent` is enough for the chat case (talk, maybe call a tool, talk more, finish).

## The build call

```ts
return createAgent({
  model,
  tools,
  systemPrompt: composeSystemPrompt(ctx),
  middleware,
  checkpointer: getCheckpointer(),
})
```

Five inputs. Each has a clear job:

### 1. `model`

A LangChain `BaseChatModel`. Picked by `pickModel(agent.model)`:

```ts
// services/agent/llm/provider.ts
export function pickModel(modelName: string): BaseChatModel {
  if (modelName.startsWith("gpt-")) return createOpenAIModel(modelName)
  return createOpenAIModel("gpt-4o")  // default
}
```

Adding a new provider is one branch here and one new file in `llm/`.

### 2. `tools`

LangChain `tool(...)` objects built from the host tool descriptors:

```ts
const tools = specs.map((spec) =>
  tool(
    async () => JSON.stringify({ ok: false, error: "server-tools-not-wired-yet" }),
    { name: spec.name, description: spec.description, schema: jsonSchemaToZod(spec.parameters) }
  )
)
```

The handler is a placeholder. For **client** tools it is never called (the middleware interrupts first). For **server** tools we have not wired the real handlers yet, so the placeholder returns an error.

### 3. `systemPrompt`

A string. Built by `composeSystemPrompt(ctx)` which joins a list of sections (page context, elements tree, rules, tools, knowledge, host state). See [`11-prompt-composition.md`](11-prompt-composition.md) for the section list and rules.

### 4. `middleware`

A list of LangChain middleware. We only add one — the **client tool interrupt** — and only when at least one tool runs in the browser:

```ts
const middleware = specs.some((s) => s.runsIn === "client")
  ? [createClientToolInterruptMiddleware(specs)]
  : []
```

The middleware wraps each tool call. If the tool runs on the client, it pauses the graph with `interrupt(...)`. See [`07-orchestration-middleware.md`](07-orchestration-middleware.md).

### 5. `checkpointer`

A LangGraph **checkpointer** — a place to save the graph's state per `thread_id` so we can pause and resume.

```ts
// services/agent/workflow/checkpointer.ts
import { MemorySaver } from "@langchain/langgraph-checkpoint"

let instance: MemorySaver | null = null
export function getCheckpointer(): MemorySaver {
  if (!instance) instance = new MemorySaver()
  return instance
}
```

`MemorySaver` keeps state in process memory. That is fine for dev but not for production with multiple servers — a future milestone (M7) swaps it for `PostgresSaver`.

The `thread_id` we pass at invoke time is the `runId`. That is the key the checkpointer uses to find the saved state on resume.

## Building the messages

`createAgent` expects a `BaseMessage[]` input. `buildChatAgentMessages(ctx, query)` returns that:

```ts
export function buildChatAgentMessages(ctx, query) {
  const messages: BaseMessage[] = []
  for (const turn of ctx.conversationHistory) {
    if (turn.role === "user") messages.push(new HumanMessage(turn.text))
    else messages.push(new AIMessage(turn.text))
  }
  messages.push(new HumanMessage(
    `Answer the visitor's question in plain text. Be concise and helpful. ...
     Question: ${query}`
  ))
  return messages
}
```

History first, then a fresh user turn with the question wrapped in a brief instruction. Notice we put guidance ("answer in plain text", "call one tool at a time") in this user message, not in the system prompt — keeps the system prompt focused on facts about the page.

## Where this fits

```
runChatAgent
  ├─ composeContext      → AgentContext
  ├─ extractHistory      → conversationHistory
  ├─ buildChatAgent(...) → agent (a runnable graph)
  ├─ buildChatAgentMessages → input messages
  └─ streamAgent(agent.stream(...))   ← next file
```

Next: [the middleware that pauses for client tools →](07-orchestration-middleware.md)
