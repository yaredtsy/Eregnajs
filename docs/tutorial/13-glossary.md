# tutorial/13 — Glossary

Quick definitions for every term used in the tutorial.

## Wire

- **NDJSON** — Newline-Delimited JSON. One JSON object per line. Our transport.
- **Frame** — one line on the wire. Three kinds: `hello`, `patch`, `end`.
- **`HelloFrame`** — the first line. Carries `runId`, `protocol`, and the starting `Conversation`.
- **`PatchRunFrame`** — a `PatchFrame` plus `kind: "patch"`. Carries `seq` and an array of `WireOp`s.
- **`EndFrame`** — the last line. Always sent (even on error or abort).
- **`RunFrame`** — the union of the three above.
- **`WireOp`** — one operation inside a patch. Either a JSON Patch op (`add`, `replace`, `remove`) or a custom `string-append`.
- **`string-append`** — our extra op. Appends a string to an existing string field. Cheaper than re-sending whole text.
- **`ChatEvent`** — lifecycle signal on the same wire. Kinds: `run-started`, `run-resumed`, `message-started`, `text-delta`, `pending-tool-call`, `message-complete`, `error`.
- **`seq`** — monotonic counter on patch frames. Survives pause/resume.

## Document

- **`Conversation`** — top-level chat document. `{ sessionId, agentName, messages[] }`.
- **`Message`** — one entry in the chat. Has `parts`, `status`, `metadata`.
- **`MessagePart`** — a typed slice of a message. `TextPart` for prose; `WalkthroughPart` for the older walkthrough flow.
- **`TextPart`** — `{ type: "text", text: string }`.
- **`MessageStatus`** — `"streaming" | "complete" | "error"`.

## Agent

- **LLM** — large language model. The thing that writes the words.
- **`createAgent`** — LangChain helper that builds a small LangGraph for "talk, maybe call a tool, talk more". Inputs: `model`, `tools`, `systemPrompt`, `middleware`, `checkpointer`.
- **LangGraph** — the graph framework underneath `createAgent`. We do not write graphs by hand.
- **`pickModel`** — picks a LangChain chat model based on the agent's model string. Today: OpenAI only.
- **`Tool` / `ToolDescriptor`** — a function the model can call. `runsIn` says where it runs (`client` or `server`).
- **`ToolMessage`** — a LangChain message that carries a tool's result back into the model loop.
- **Middleware** — wraps points in the agent loop. We use `wrapToolCall` to detect client tools and `interrupt(...)` them.
- **`interrupt(value)`** — LangGraph primitive. Saves graph state and throws an internal signal so the stream stops. On resume, returns the value passed to `Command({ resume })`.
- **`Command`** — input you pass to `agent.stream(...)` to resume from an interrupt: `new Command({ resume: result })`.
- **Checkpointer** — keyed store of graph state per `thread_id`. We use `MemorySaver` in dev; `PostgresSaver` later.
- **`thread_id`** — the key the checkpointer uses. We set it to `runId`.
- **`runId`** — id of one chat turn. Used by the widget on resume.
- **`toolCallId`** — id of one tool call inside a turn. Echoed on resume.

## Context

- **`AgentContext`** — everything the prompt builder needs: agent row, page, elements, host state, host tools, host knowledge, conversation history.
- **`HistoryTurn`** — `{ role, text }`. Flat view of prior messages for the prompt.
- **`KnowledgeEntry`** — `{ title, content, source }`. "Site facts" from the dashboard or page.
- **`composeContext`** — async function that builds `AgentContext` from DB rows + request data.
- **`extractHistory`** — flattens a `Conversation` into `HistoryTurn[]`.

## Prompt

- **`PromptSection`** — `{ name, render(ctx) }`. One block of the system prompt.
- **`composeSystemPrompt`** — joins section outputs with blank lines.
- **`inspectPrompt`** — like compose, but also returns per-section sizes for the debug page.
- **Sections** (in order): `rules`, `customerOverlay`, `pageContext`, `elementsTree`, `knowledge`, `hostState`, `hostTools`.

## Server flow

- **`runAgent`** — entry point. Picks the chat path when host tools are present; otherwise falls back to the walkthrough path.
- **`runChatAgent`** — does composeContext → buildChatAgent → `streamAgent` → save run. Owns `hello` and `end`.
- **`resumeChatAgent`** — `lookupRun(runId)` → re-point patcher → `streamAgent(new Command({ resume }))`.
- **`streamAgent`** — inner loop over `agent.stream(input, { streamMode: ["messages", "updates"] })`. Converts text chunks into patches and `text-delta` events; converts interrupts into `pending-tool-call`.
- **`Patcher`** — wraps a `Conversation` with `fast-json-patch` `observe`. `emit()` produces a `PatchFrame`. `setOnFrame()` swaps the output sink (needed across pause/resume).
- **`CachedRun`** — entry in `runs/cache.ts`. Keeps the patcher, the agent, and the indices alive while paused.

## Client flow

- **`runStream`** — top-level driver on the widget. POSTs `/run`, loops on `paused`, calls `executeClientTool`, POSTs `/resume`.
- **`consumeAgentStream`** — reads the NDJSON, splits lines, routes `ChatEvent`s and `RunFrame`s to handlers. Returns `{ endReceived, paused, pendingToolCall, runId }`.
- **`applyPatchFrame`** — immutable patch apply. Returns a new `Conversation` with structural sharing.
- **`executeClientTool`** — runs the registered client tool handler with timing and error handling.
- **`useAgentRun` / `RunSessionProvider`** — React glue that wires `runStream` to the widget store.
- **Watchdog** — 60s no-data timeout in `consumeAgentStream`.

## Other

- **NDJSON transport** — see `apps/api/src/services/agent/transport/ndjson.ts`.
- **Wire protocol version** — `WIRE_PROTOCOL = 2`. Bumped only on breaking changes to the wire shape.
- **Walkthrough path** — the older agent flow (planner → streamer → engine). Lives in `services/agent/workflow/` outside the `chat/` folder. Not covered here.

If you read a term in the codebase that is not in this glossary, it is probably specific to the walkthrough path or to the dashboard. Search the codebase before guessing.
