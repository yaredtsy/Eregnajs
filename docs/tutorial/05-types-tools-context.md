# tutorial/05 — Types: Tools and AgentContext

These types live in two places:

```
apps/api/src/services/agent/tools/types.ts
apps/api/src/services/agent/context/types.ts
```

They are the **inputs** to the chat agent. The model is told about the tools and the context. Together they answer "what can this agent do, and what does it know?"

## `ToolDescriptor` — what a tool looks like

```ts
export type ToolKind = "client" | "server"

export interface ToolDescriptor<Args = unknown, Result = unknown> {
  name: string
  description: string
  parameters: JSONSchema          // standard JSON Schema for the args
  runsIn: ToolKind                // "client" runs in the browser; "server" runs here
  handler?: (args: Args) => Promise<Result> | Result
  display?: { icon?: string; label?: string; showArgs?: boolean; showResult?: boolean }
}
```

Two things to notice:

1. `runsIn` is the **only** thing that changes the runtime behavior. `client` tools cause a **pause** (interrupt + `pending-tool-call`). `server` tools run inline on the server.
2. `handler` is **never sent over the wire**. The wire shape strips it:

```ts
export type WireToolDescriptor = Omit<ToolDescriptor, "handler">
```

That is why a client tool registered by the host page has no `handler` on the server side. The server only knows the name, description, parameters, and that it `runsIn: "client"`. When the model calls it, the server interrupts and asks the browser to run it.

## `JSONSchema`

A small subset of JSON Schema we feed to the model so it knows what arguments to pass. The chat agent turns it into a Zod schema (`tools/jsonSchemaToZod.ts`) before binding it to `tool(...)`.

## Where tools come from

The widget sends them on each `/run` POST as `hostTools`. The server parses them with `extractToolSpecs` (`tools/parseHostTools.ts`) — only v2 tools (`parameters.type === "object"`) are kept. Then the chat agent maps each spec to a LangChain `tool(...)`:

```ts
// services/agent/workflow/chatAgent.ts
const tools = specs.map((spec) =>
  tool(
    async () => JSON.stringify({ ok: false, error: "server-tools-not-wired-yet" }),
    { name: spec.name, description: spec.description, schema: jsonSchemaToZod(spec.parameters) }
  )
)
```

The fake handler is fine because client tools always interrupt **before** the handler runs — the middleware sees `runsIn === "client"` and pauses. Server-side tools are not wired yet, so the placeholder error catches the case until we implement them.

## `AgentContext` — what the model knows

```ts
export interface AgentContext {
  agent:     AgentRow              // row from the agents table
  page:      PageRow | null        // the page the visitor is on
  elements:  ElementRow[]          // DOM elements indexed for that page
  siteFacts: KnowledgeEntry[]      // dashboard-defined knowledge
  hostState: Record<string, unknown>  // arbitrary blob from the host page
  hostTools: ToolDescriptor[]      // raw tool list (also bound to the model)
  hostKnowledge: KnowledgeEntry[]  // page-defined knowledge (script tag)
  conversationHistory: HistoryTurn[]
}
```

Where each field comes from:

| Field | Built by |
|---|---|
| `agent`, `page`, `elements`, `siteFacts` | `composeContext` reads them from the DB given `agentPublicId` and `pageUrl`. |
| `hostState`, `hostTools`, `hostKnowledge` | Passed in by the widget on the `/run` POST. |
| `conversationHistory` | `extractHistory(conversation)` flattens prior messages into `{role, text}` turns. |

```ts
export interface HistoryTurn {
  role: "user" | "assistant"
  text: string
}
```

Why a flat history shape instead of the full `Message`? Because the prompt only needs the words. Status, parts, metadata are useful for the renderer but noise for the model.

## How the types connect

```
hostTools (wire)  ──parseHostTools──▶  ToolDescriptor[]  ──┐
                                                            ├─▶ buildChatAgent(...)  ─▶ createAgent({...})
AgentContext      ──composeSystemPrompt──▶  systemPrompt  ──┘
```

Holding these three names in your head — `ToolDescriptor`, `AgentContext`, `Conversation` — is enough to read every file in `services/agent/chat/`.

Next: [how we orchestrate the agent with `createAgent` →](06-orchestration-createagent.md)
