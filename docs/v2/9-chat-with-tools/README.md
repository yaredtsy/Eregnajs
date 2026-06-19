# 9 — Chat with tools

> A design for the *next* shape of the chat path: the agent can call tools
> mid-conversation, the host page can register its own tools, and the
> widget shows what's happening in real time. Simplest form first, but
> the architecture is chosen so the simple form **scales** to multi-tool
> loops, frontend-executed tools, and long-running calls.

## Scope

| In scope (this folder) | Out of scope (deferred) |
|---|---|
| Chat → tool → observation → final reply (one round, then N rounds) | Walkthrough re-enable (planner / stepper / narrator) |
| `hostTools` v2 — host page declares tools (`server` and `client` kinds) | Persistent tool registries (DB-backed) |
| **Stream end → client executes → result POSTed → server resumes** | Tool auth / OAuth handshakes |
| LangGraph state machine with `interrupt()` for client tools | RLS / multi-tenant tool isolation |
| Widget: tool-call cards (status / time / args / result) | Tool-call retries with backoff |
| Widget header **debug toggle** → registration inspector | The big context-engineering rework |

## The four hard questions this folder answers

1. **How does the chat loop look in LangGraph?** — propose → tool? → run
   tool → observe → propose again → terminate. Cycle is one
   conditional edge.
2. **Server-side vs client-side tools — same loop?** — yes, with a
   single fork: server tools run inline in the node; client tools cause
   the graph to *interrupt*, the HTTP stream to flush + close, and the
   widget to execute then POST `/agent/resume`.
3. **How does the host page extend the tool set?** — at widget
   `init()` time, the host hands the widget a list of tool descriptors
   (server-known or client-implemented). The server validates against
   what's allowed for that agent, then exposes them to the model.
4. **What does the widget show?** — a "tool call" card per call:
   pending → running → done/error, with elapsed time and the result
   summary. The header debug toggle flips the chat surface into an
   inspector showing the registered tools / state / knowledge that
   the page contributed.

## Reading order (dendrogram)

```
9-chat-with-tools/
        │
        ├── README.md (this file)
        │
        ├── 00-overview.md ──── one-page vision
        │       │
        │       ▼
        ├── 01-langgraph-primer.md ──── concepts you'll lean on
        │       │
        │       ▼
        ├── 02-architecture.md ──── top-down system map
        │       │
        │       ▼
        ├── 03-tool-format.md ──── tool descriptor v2 (host-extensible)
        │       │
        │       ▼
        ├── 04-execution-model.md ── server tools vs client tools;
        │       │                    stream end → execute → resume
        │       ▼
        ├── 05-chat-loop.md ──── LangGraph nodes, state, edges
        │       │
        │       ▼
        ├── 06-events.md ──── wire protocol (NDJSON + /resume API)
        │       │
        │       ▼
        ├── 07-debug-ui.md ──── header toggle + inspector + cards
        │       │
        │       ▼
        └── 08-rollout.md ──── milestones, smallest-shippable-first
```

## Mental model in one sentence

> The chat subagent becomes a **small agentic loop** — the model proposes
> a reply *or* a tool call, the runtime runs server tools inline and
> hands client tools to the widget via an interrupt-and-resume dance,
> results are fed back into the same conversation, and the loop ends
> when the model emits a normal reply.

## Two things to internalize before reading

1. **"Tool" here means an action the host page or server can perform.**
   Examples: `getOrderStatus` (server), `addToCart` (client), `searchDocs`
   (server), `highlightElement` (client). The host registers the spec;
   *who runs it* is part of the spec.
2. **A single LLM stream is short-lived.** It cannot block waiting for a
   browser to do something. So whenever a *client* tool is called, the
   stream *ends cleanly* with a "this turn is paused on tool X" marker,
   the widget runs the tool, and a fresh request resumes the graph with
   the result. Server tools have no such break — they run inside the
   stream's node.

## What's different from today

| Today (`subagents/chat/run.ts`) | After this folder |
|---|---|
| One LLM call, plain prose stream, no tool concept | LangGraph loop: chat-node ↔ tool-node, with interrupt for client tools |
| `hostTools` is rendered into the system prompt but never invoked | Bound to the model via LangChain's `bindTools`; calls actually round-trip |
| One HTTP request = one turn = one stream | One *user turn* may span 1..N HTTP streams (one per resume) |
| Widget shows text only | Widget shows tool-call cards plus text |
| No debug surface for what the page registered | Header toggle flips the chat into a live inspector |

## Canonical source: the LangChain skills

These docs **defer to the LangChain plugin's skills** for any
framework-level "how do I". When a chapter shows code, it cites the
skill that owns the canonical pattern.

| Skill (invoke via Skill tool) | What it owns |
|---|---|
| `langchain-skills:ecosystem-primer` | Layer choice (LangChain vs LangGraph vs Deep Agents) |
| `langchain-skills:langchain-fundamentals` | `createAgent`, `tool()`, model strings |
| `langchain-skills:langchain-middleware` | `createMiddleware`, `wrapToolCall`, `humanInTheLoopMiddleware` |
| `langchain-skills:langgraph-fundamentals` | `StateGraph`, reducers, stream modes |
| `langchain-skills:langgraph-human-in-the-loop` | `interrupt`, `Command(resume)`, idempotency |
| `langchain-skills:langgraph-persistence` | Checkpointers, `thread_id`, time travel |

Re-invoke the relevant skill before editing any code in this folder —
the framework moves and the skills carry the current API.

## Cross-references

- [`2-system/02-conversation-patches.md`] — NDJSON patch protocol; new
  patch kinds for tool calls (chapter 06)
- [`3-server/01 §1`] — closed-set context model; the host is now an
  *active* source, not just a data source
- [`3-server/03 §5`] — earlier note on reactive tool round-trip
- [`3-server/04-dynamic-tools.md`] — predecessor of this design
- [`8-chat-subagent-review/`] — prompt rework, deferred until this lands
