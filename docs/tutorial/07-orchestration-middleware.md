# tutorial/07 — Middleware: pausing for client tools

File:

```
apps/api/src/services/agent/workflow/middleware/clientToolInterrupt.ts
```

This is the trick that makes browser-side tools possible. Without it, every tool would have to run on the server.

## What "middleware" means in LangChain

`createMiddleware({...})` returns a value you can pass into `createAgent({ middleware: [...] })`. It can hook into several points in the loop. We only use one: `wrapToolCall`.

`wrapToolCall(request, handler)` runs **around** every tool call:

- `request.toolCall` — the call the model wants to make: `{ name, args, id }`.
- `handler(request)` — the original call. If you don't call it, the tool never runs server-side.
- The return value — a `ToolMessage` the loop feeds back to the model as the tool result.

## Our middleware

```ts
export function createClientToolInterruptMiddleware(specs: ToolDescriptor[]) {
  const specByName = new Map(specs.map((s) => [s.name, s]))

  return createMiddleware({
    name: "client-tool-interrupt",
    wrapToolCall: async (request, handler) => {
      const call = request.toolCall
      const spec = specByName.get(call.name)
      if (spec?.runsIn !== "client") return await handler(request)   // server tool → run normally

      const resumed = interrupt<Record<string, unknown>>({
        kind: "client-tool-call",
        toolCallId: call.id ?? "",
        name: call.name,
        args: (call.args ?? {}) as Record<string, unknown>,
      } satisfies ClientToolInterruptPayload)

      return new ToolMessage({
        tool_call_id: call.id ?? "",
        content: JSON.stringify(resumed),
      })
    },
  })
}
```

What it does:

1. If the tool runs on the **server**, call the original handler. We don't interfere.
2. If the tool runs on the **client**, call `interrupt(...)` from `@langchain/langgraph`.

## What `interrupt(...)` does

`interrupt(value)` is a LangGraph primitive. It does three things:

1. Saves the current graph state to the **checkpointer** under the current `thread_id`.
2. Emits an **`updates` mode event** that contains the `value` you passed.
3. Throws an internal signal that bubbles up and ends the current `stream(...)` call.

So when the agent calls a client tool:

- The server sees the interrupt in `updates` mode (see [next file](08-stream-server.md)).
- It pulls out the payload, sends it as `pending-tool-call`, and returns.
- The connection closes.
- The widget runs the tool, then POSTs `/resume` with the result.
- The server calls `agent.stream(new Command({ resume: result }), { configurable: { thread_id: runId } })`.
- LangGraph restores the saved state, and `interrupt(...)` **returns the resume value** as if it had just been computed.
- The middleware wraps it in a `ToolMessage` and the loop continues.

This is why the checkpointer is required for client tools. Without saved state, resume cannot rebuild the graph.

## Why this design is nice

- **No special node** in the graph for "client tool". Tools are tools.
- The model does not need to know which tools are client and which are server. It just calls tools.
- Adding a server tool later is just providing a real `handler` and `runsIn: "server"` in the spec. The middleware skips it; the loop runs it.

## Edge cases handled in code

- `call.id` can be missing on some providers. We default to `""` for the `tool_call_id`. (We could be stricter; the chat events also store the same id.)
- The middleware is **only added** when at least one client tool exists. With no client tools, no middleware, no overhead.

Next: [how the server reads the agent's stream and routes events →](08-stream-server.md)
