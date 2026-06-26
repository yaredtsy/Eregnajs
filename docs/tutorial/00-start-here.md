# tutorial/00 — Start Here

This folder is a step-by-step guide to the **chat agent** in this repo. You will learn it in the order that makes it easiest to learn:

1. The **types** (the shapes of data we pass around).
2. How we **orchestrate** the agent with LangGraph (`createAgent`).
3. How we **stream** the agent's output from the server.
4. How the widget **renders** that stream in the browser.
5. How we **compose the prompt** the model sees.

The walkthrough agent (the older `services/agent/run.ts` path that plans steps and plays them) still exists for the walkthrough flow. We do not dive into it here — this tutorial is about the **chat agent** path in `services/agent/chat/` that is now the default for tool-using sessions.

## Reading order

```
00 start-here              ← you are here
01 mental-model            ← one drawing of the whole thing
02 types-conversation      ← Conversation, Message, MessagePart
03 types-frames            ← HelloFrame, PatchFrame, EndFrame, WireOp
04 types-chat-events       ← ChatEvent (text-delta, pending-tool-call, etc.)
05 types-tools-context     ← ToolDescriptor, AgentContext, HistoryTurn
06 orchestration-createagent  ← buildChatAgent: model + tools + system prompt + checkpointer
07 orchestration-middleware   ← client-tool-interrupt middleware
08 stream-server           ← streamAgent: read "messages" + "updates" modes
09 stream-wire             ← the NDJSON wire: hello → patch → end + chat events
10 render-widget           ← consumeAgentStream + runStream + applyPatchFrame
11 prompt-composition      ← composeSystemPrompt and the section list
12 pause-resume            ← interrupt → pending-tool-call → resumeChatAgent
13 glossary                ← every term in one place
```

## Why this order?

You will see a name in code (for example `RunFrame`) and want to know "what is that?" The types come first so every later file can point at a type you already saw. Then we move to **how those types flow** — agent → stream → render — and end with the **prompt**, which is the easiest part to change once you know the rest.

## Words to know

- **LLM** — large language model. The thing that takes text and writes text back.
- **Stream** — sending data in tiny pieces while it is being made, instead of waiting for the whole thing.
- **Frame** — one tiny piece on the wire. We use three kinds: `hello`, `patch`, `end`.
- **Patch** — a small change to a JSON document. Like "set this field" or "append this text".
- **Tool** — a function the LLM can ask to be called. May run on the server or in the browser.
- **Middleware** — code that wraps another step so it can change what happens before/after.
- **Checkpointer** — a place that saves agent state, so we can pause and resume later.

Full definitions are in [`13-glossary.md`](13-glossary.md).
