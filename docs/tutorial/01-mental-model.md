# tutorial/01 — Mental Model

One drawing. The rest of the tutorial just zooms in on one box at a time.

```
┌──────────────────────┐         POST /public/agent/run            ┌────────────────────────────┐
│   Widget (browser)   │ ───────────────────────────────────────▶ │   API server (apps/api)    │
│                      │           NDJSON stream back              │                            │
│  runStream           │ ◀──────────────────────────────────────── │  runChatAgent              │
│  consumeAgentStream  │                                            │  ├─ composeContext        │
│  applyPatchFrame     │                                            │  ├─ buildChatAgent        │
│  React renders       │                                            │  │   (createAgent +       │
│                      │                                            │  │    tools + middleware) │
│  if pending-tool:    │                                            │  └─ streamAgent           │
│   run client tool    │                                            │                            │
│   POST .../resume    │ ──── second POST when paused ──────────▶ │  resumeChatAgent           │
└──────────────────────┘                                            └────────────────────────────┘
                                                                              │
                                                                              ▼
                                                                    ┌────────────────────────┐
                                                                    │  LLM (OpenAI for now)  │
                                                                    │  via LangChain         │
                                                                    └────────────────────────┘
```

## The life of a question

1. Visitor types a question in the chat popup.
2. The widget opens `POST /public/agent/run` with the question, the page URL, and any host **tools** the page registered.
3. The server builds an `AgentContext` (agent row, page row, elements, history, tools).
4. It builds a chat agent with `createAgent({ model, tools, systemPrompt, middleware, checkpointer })`.
5. It calls `agent.stream(...)` and listens in two modes:
   - `messages` mode → token-by-token text from the model.
   - `updates` mode → graph state changes (used to catch **interrupts**).
6. For every change to the shared `Conversation` document, the server writes a tiny **patch frame** to the response stream.
7. The browser reads each line (NDJSON), turns it into a frame, and applies the patch to its local `Conversation`. React re-renders the parts that changed.
8. If the agent wants to call a **client tool**, the middleware **interrupts**, the server sends `pending-tool-call`, and the run is paused.
9. The widget runs the tool, then sends `POST /public/agent/resume` with the result. The agent picks up where it left off.
10. When the agent finishes, the server sends one `end` frame and closes the stream.

## The big idea

The chat **is a JSON document**. Both the server and the browser hold a copy. The server changes its copy and sends the diff. The browser applies the diff. That diff format is the wire.

Everything else — tools, middleware, prompts — is just there to make the server produce the right diffs at the right time.

Next: [types of the chat document itself →](02-types-conversation.md)
