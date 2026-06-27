# Fix 03 — `parallel_tool_calls: false` at the model level breaks the planner

> Setting `parallel_tool_calls: false` via `modelKwargs` on the
> `ChatOpenAI` instance (fix 01.A) closes the parallel-tool-call door
> for the orchestrator — but it also poisons every other call that
> instance makes, including the planner's three `withStructuredOutput`
> calls. OpenAI returns 400 because `parallel_tool_calls` is only
> valid when `tools` is present in the request, and structured output
> on gpt-4o uses `response_format: json_schema`, not tools. The
> planner throws on stage 1 immediately; the tool body's catch flips
> `status: error`; the model retries the tool (now sequential thanks
> to 01.A); same failure; it tries again; same failure; eventually
> gives up and writes a "couldn't plan it" closing message.

---

## Symptom (the wire log)

After fix 01.A landed (`modelKwargs: { parallel_tool_calls: false }`),
the trace for *"can you walk me through creating an agent and
exploring the hero"* shows three back-to-back attempts, each failing
the moment stage 1 starts:

```jsonc
// attempt #1
{"op":"add","path":"/messages/1/parts/1","value":{"type":"walkthrough", … "status":"planning"}}
{"op":"add","path":"/messages/1/parts/1/thoughts/0","value":{…"Reading your goal…"}}
{"op":"add","path":"/messages/1/parts/1/thoughts/1","value":{…"Thinking through your goal…"}}
{"op":"replace","path":"/messages/1/parts/1/status","value":"error"}   // ◄ stage 1 throws

// attempt #2 — model retries because the tool returned an error ack
{"op":"remove","path":"/messages/1/parts/1/thoughts/1"}
{"op":"remove","path":"/messages/1/parts/1/thoughts/0"}
{"op":"replace","path":"/messages/1/parts/1/status","value":"planning"}
{"op":"add","path":"/messages/1/parts/1/thoughts/0","value":{…"Reading your goal…"}}
{"op":"add","path":"/messages/1/parts/1/thoughts/1","value":{…"Thinking through your goal…"}}
{"op":"replace","path":"/messages/1/parts/1/status","value":"error"}   // ◄ same failure

// attempt #3 — same again
{"op":"remove","path":"/messages/1/parts/1/thoughts/1"}
{"op":"remove","path":"/messages/1/parts/1/thoughts/0"}
{"op":"replace","path":"/messages/1/parts/1/status","value":"planning"}
{"op":"add","path":"/messages/1/parts/1/thoughts/0", …}
{"op":"add","path":"/messages/1/parts/1/thoughts/1", …}
{"op":"replace","path":"/messages/1/parts/1/status","value":"error"}

// closing apology
{"op":"string-append","path":"/messages/1/parts/0/text","value":"It seems there is an issue with planning the walkthrough right now. However, I can guide you through creating an agent and exploring the Dashboard hero. …"}
```

Two patterns to read:

1. **No JSON tokens leak.** The bubble has no `{"understanding":…}`
   prefix this time — fix 02 worked, OR (more likely here) the
   structured-output call never got far enough to emit any chunks.
2. **Three rounds of "thoughts → error" with nothing in between.**
   The model is sequencing tool calls (good — that's 01.A doing its
   job), but each call throws *before any stage-1 output is written*.
   No reasoning, no frame, no chapters — only the two pre-call phase
   tickers from `emitPlanThought`.

The throw is happening between `emitPlanThought("Thinking through
your goal…")` and the first patcher write from stage 1. That's
exactly the spot where
`model.withStructuredOutput(PlanReasoningSchema).invoke(...)` runs.

---

## Root cause

### What OpenAI is saying

OpenAI's Chat Completions API has a strict rule on the
`parallel_tool_calls` parameter:

> *`parallel_tool_calls` can only be set when `tools` are passed in
> the request.*

Sending it without `tools` returns HTTP 400 with an error like:

```
Invalid parameter: 'parallel_tool_calls'. The parameter can only be
used when 'tools' is specified.
```

### How our code triggers it

`apps/api/src/services/agent/llm/openai.ts` after fix 01.A:

```ts
return new ChatOpenAI({
  model: modelName,
  temperature: 0.2,
  apiKey: process.env.OPENAI_API_KEY,
  modelKwargs: { parallel_tool_calls: false },   // ◄── applies to every call this instance makes
});
```

`modelKwargs` is LangChain's pass-through for raw OpenAI params. **It
goes into every API call the model makes**, including:

- The orchestrator's `createAgent` turn (good — that call has
  `tools` in the request because the agent binds host tools +
  `start_walkthrough`).
- The planner's stage 1/2/3 `withStructuredOutput` calls (**bad** —
  these calls do **not** include `tools`; they include
  `response_format: { type: "json_schema", json_schema: {...} }`
  instead).

For gpt-4o, `withStructuredOutput` defaults to `method:
"jsonSchema"`, which means no tool binding. Sending
`parallel_tool_calls: false` alongside `response_format` violates
OpenAI's rule → 400 → the call throws → tool body's catch fires →
`status: error`.

### Why fix 01.A still belongs

Without 01.A the model races itself (fix 01 doc). With 01.A but no
scoping, every structured-output call dies (this doc). The fix is
*correct scope*, not removal.

---

## Fix

Move the flag from the **model construction** site to the
**orchestrator's bound model** site. Two coordinated edits:

### A — Revert `openai.ts` to a clean model instance

`apps/api/src/services/agent/llm/openai.ts`:

```ts
import { ChatOpenAI } from "@langchain/openai";

export function createOpenAIModel(modelName: string): ChatOpenAI {
  return new ChatOpenAI({
    model: modelName,
    temperature: 0.2,
    apiKey: process.env.OPENAI_API_KEY,
    // parallel_tool_calls deliberately NOT set at the model level —
    // it must only apply when tools are bound (orchestrator calls);
    // setting it here also poisons the planner's withStructuredOutput
    // calls, which use response_format and have no tools.
    // See docs/v2/11-walkthrough/fixes/03.
  });
}
```

### B — Bind the flag only to the orchestrator's model in `chatAgent.ts`

`apps/api/src/services/agent/workflow/chatAgent.ts`:

```ts
export function buildChatAgent(
  model: BaseChatModel,
  ctx: AgentContext,
  specs: ToolDescriptor[] = [],
  patcher?: Patcher,
  getAssistantMsgIndex?: () => number,
) {
  const hostTools = specs.map((spec) =>
    tool(
      async () => JSON.stringify({ ok: false, error: "server-tools-not-wired-yet" }),
      {
        name: spec.name,
        description: spec.description,
        schema: jsonSchemaToZod(spec.parameters),
      },
    ),
  );

  const tools = [
    ...hostTools,
    ...(patcher && getAssistantMsgIndex
      // NOTE: `model` here is the raw (un-bound) instance. The planner
      // calls structured output on it without the parallel_tool_calls
      // flag; fix 03 keeps the flag scoped to the orchestrator.
      ? [startWalkthroughTool(model, ctx, patcher, getAssistantMsgIndex)]
      : []),
  ];

  const middleware = [
    ...(patcher ? [createWalkthroughContextMiddleware(patcher)] : []),
    ...(specs.some((s) => s.runsIn === "client")
      ? [createClientToolInterruptMiddleware(specs)]
      : []),
  ];

  const systemPrompt =
    composeSystemPrompt(ctx, CHAT_SECTIONS) + "\n\n" + CHAT_MODE_SUFFIX;

  // Bind parallel_tool_calls: false ONLY for the orchestrator's calls.
  // createAgent uses whatever model we hand it for the agent loop;
  // the bound instance carries the kwarg into the chat-completions
  // request alongside the tools that createAgent binds internally.
  const orchestratorModel = (model as ChatOpenAI).bind({
    parallel_tool_calls: false,
  });

  return createAgent({
    model: orchestratorModel,
    tools,
    systemPrompt,
    middleware,
    checkpointer: getCheckpointer(),
  });
}
```

Two scoping properties this preserves:

- **Orchestrator turns** include `tools` (createAgent binds them) **and**
  `parallel_tool_calls: false` → OpenAI accepts → one tool call at a
  time, as fix 01.A intended.
- **Planner subcalls** through `startWalkthroughTool` get the raw
  `model` (no bind layer) → no `parallel_tool_calls` in the
  structured-output request → OpenAI accepts → stage 1/2/3 run as
  designed.

### C — The `as ChatOpenAI` cast is honest, not lazy

`BaseChatModel.bind` exists but doesn't accept provider-specific
kwargs in its type. ChatOpenAI's `bind` does. Since `pickModel`
currently only returns ChatOpenAI (see `llm/provider.ts`), the cast
is safe. When `pickModel` grows a non-OpenAI branch, the binding
helper should move into the provider module:

```ts
// llm/openai.ts (future)
export function bindOrchestratorOptions(model: ChatOpenAI): RunnableBinding {
  return model.bind({ parallel_tool_calls: false });
}
```

…and `pickModel` would return both the raw model **and** a provider-
specific bind helper. Phase 1 doesn't need that abstraction yet —
note it as a follow-up.

---

## Why not other options

| Option | Why we didn't take it |
|---|---|
| Pass `parallelToolCalls: false` to `createAgent` directly | LangChain v1's `createAgent` doesn't expose a `parallelToolCalls` option; binding before passing the model is the documented escape hatch |
| Use `method: "functionCalling"` for `withStructuredOutput` | Forces the planner to use tool-call mode (which would make the flag valid), but it's worse output quality on gpt-4o and a workaround, not a fix |
| Have the planner construct its own clean model instance | Duplicates the model factory; loses any future provider config the chat agent inherits |
| Strip `modelKwargs` per-call via config | LangChain doesn't merge / override `modelKwargs` cleanly at call time; .bind() is the supported API |
| Drop fix 01.A and rely on prompts | Already established prompts don't enforce one-tool-at-a-time hard enough; fix 01 doc has the trace |

---

## Files

```
EDIT  apps/api/src/services/agent/llm/openai.ts
        - revert modelKwargs change from fix 01.A
        + add comment pointing to fix 03

EDIT  apps/api/src/services/agent/workflow/chatAgent.ts
        + bind parallel_tool_calls: false only on the orchestrator model
        + keep raw `model` for startWalkthroughTool's planner calls
```

---

## Verification

1. **Re-run the failing query.** "Can you walk me through creating
   an agent and exploring the hero." Expected wire:
   - exactly one walkthrough part created,
   - two phase tickers ("Reading…", "Thinking…"),
   - stage-1 patcher write for `reasoning`,
   - stage-2 patcher writes for `planGoal` + `thought`,
   - stage-3 patcher writes for chapters,
   - `status: planned` (not `error`),
   - closing orchestrator turn that references plan goal + chapter
     titles by their visible labels.

2. **Inspect LangSmith trace.** The orchestrator's request body
   includes both `tools: [...]` AND `parallel_tool_calls: false`.
   Each planner stage's request body includes
   `response_format: { type: "json_schema", ... }` but **no**
   `parallel_tool_calls` field.

3. **Multi-goal stress test.** Same query asked five times — model
   should never emit two parallel tool calls (fix 01.A still works),
   and the planner should never throw on stage 1 (fix 03 unblocks
   it).

4. **Regression test for fix 01.B.** The patcher guard still throws
   when a *real* concurrent call is attempted (manual unit test);
   the orchestrator never triggers it organically anymore because
   parallel calls are off.

---

## What this fix does NOT solve

If fix 02 (`02-structured-output-tokens-leak.md`) is still
unapplied, the moment stage 1 succeeds (which it will after this
fix), the visible JSON tokens will start bleeding into the chat
bubble again. **Fix 03 unblocks the planner; fix 02 keeps its
output off the wire.** Apply both.

---

## Cross-references

- `fixes/01-parallel-tool-calls-race.md` — the parent fix that this
  doc scopes correctly
- `fixes/02-structured-output-tokens-leak.md` — companion bug; apply
  alongside
- `02-plan-shape.md` §"Three-call flow inside `runPlanner`" — the
  planner calls that fix 03 restores
- `apps/api/src/services/agent/llm/openai.ts` — file to edit
- `apps/api/src/services/agent/llm/provider.ts` — future home of the
  orchestrator-bind helper when a second provider lands
- `apps/api/src/services/agent/workflow/chatAgent.ts` — file to edit
- OpenAI docs: [`parallel_tool_calls` constraints](https://platform.openai.com/docs/api-reference/chat/create#chat-create-parallel_tool_calls)
