# Fix 02 — Planner's structured-output JSON leaks into the chat text

> While the planner is running its three structured-output calls inside
> the `start_walkthrough` tool body, the **raw JSON tokens it streams
> from OpenAI** appear in the visitor's chat bubble as if they were
> assistant prose. The visitor reads
> `{"understanding":"You want to learn how to create…"}` letter by
> letter, then sees the parsed `reasoning` object land in the
> walkthrough card a moment later. The orchestrator's actual closing
> turn appends *after* the JSON garbage.

---

## Symptom (the wire log)

From the visitor's `start_walkthrough` run for *"create a walkthrough
on creating an agent"*, the patch frames are appending into
`/messages/1/parts/0/text` (the orchestrator's text part) while the
planner is mid-stage-1:

```jsonc
// the planner is calling withStructuredOutput(PlanReasoningSchema).invoke(...)
// inside the tool body. OpenAI streams the JSON chunk by chunk.
// every chunk lands in the visible text part:

{"op":"string-append","path":"/messages/1/parts/0/text","value":"{\""}
{"op":"string-append","path":"/messages/1/parts/0/text","value":"under"}
{"op":"string-append","path":"/messages/1/parts/0/text","value":"standing"}
{"op":"string-append","path":"/messages/1/parts/0/text","value":"\":\""}
{"op":"string-append","path":"/messages/1/parts/0/text","value":"You"}
{"op":"string-append","path":"/messages/1/parts/0/text","value":" want"}
{"op":"string-append","path":"/messages/1/parts/0/text","value":" to"}
// … 150+ more append ops, the entire JSON of stage 1 …
{"op":"string-append","path":"/messages/1/parts/0/text","value":"}"}

// then stage 1 returns; the planner's patcher write surfaces the parsed shape:
{"op":"add","path":"/messages/1/parts/1/reasoning","value":{"understanding":"You want to learn how to create…", "knowledgeAnchors":[], "componentMapping":"…"}}

// then the orchestrator's actual closing turn streams in, appending to the same text part:
{"op":"string-append","path":"/messages/1/parts/0/text","value":"It"}
{"op":"string-append","path":"/messages/1/parts/0/text","value":" seems"}
{"op":"string-append","path":"/messages/1/parts/0/text","value":" there"}
{"op":"string-append","path":"/messages/1/parts/0/text","value":" was"}
// …
```

The text part ends up looking like:

> `{"understanding":"You want to learn how to create a walkthrough onboarding experience for using the Eregna dashboard. You likely already know that the dashboard allows you to manage agents…","knowledgeAnchors":[],"componentMapping":"To achieve your goal, the key components are the Dashboard hero, which provides context about the page…"}It seems there was an issue creating the walkthrough onboarding. However, I can help you with specific tasks on the Eregna dashboard…`

The card itself renders fine (the reasoning disclosure has the
parsed object) — but the bubble is unreadable, and the visitor sees
"AI internals" leaking out.

---

## Root cause

LangGraph's `streamMode: "messages"` returns chunks from **every**
model call inside the agent's run context — including child calls
made inside tool bodies. The planner runs *inside* the
`start_walkthrough` tool's handler, which runs *inside* `createAgent`'s
tool node, which runs *inside* `agent.stream()`. Every model token
generated below `agent.stream()` is captured.

```
   agent.stream(input, { streamMode: ["messages", …] })
        │
        ▼
   createAgent loop  ──► model.invoke (orchestrator)        ◄── ok, we want these tokens
                          │
                          └► tool_calls: [start_walkthrough]
                                  │
                                  ▼
                            startWalkthroughTool handler
                                  │
                                  ▼
                            runPlanner
                                  │
                                  ├► withStructuredOutput.invoke (stage 1)  ◄── NOT ok — these leak
                                  ├► withStructuredOutput.invoke (stage 2)  ◄── NOT ok
                                  └► withStructuredOutput.invoke (stage 3)  ◄── NOT ok
```

`apps/api/src/services/agent/chat/streamAgent.ts:79-99` accepts any
chunk whose `_getType() === "ai"`:

```ts
if (mode === "messages") {
  const tuple = payload as [unknown, unknown];
  const msg = tuple[0];
  if (!isAssistantStreamChunk(msg)) continue;   // ◄ only filters non-AI types

  const text = textFromChunk(msg as BaseMessage);
  if (!text) continue;
  // … appends to the visible text part …
}
```

`isAssistantStreamChunk` just checks the message type, not its
**provenance**. OpenAI's structured output emits AIMessageChunks too
(because under the hood it's a chat completion with `response_format:
json_schema`), and those chunks have `_getType() === "ai"`, so they
pass the guard and get written to the text part.

The fix lives at the *provenance* level: each call to `streamMode:
"messages"` exposes the chunk **plus** a metadata object that
includes the inherited `tags` chain. If we **tag** every planner-
internal call, we can drop those tagged chunks in `streamAgent`.

---

## Fix

Two coordinated changes.

### A — Tag every model call inside `runPlanner`

`apps/api/src/services/agent/subagents/planner/run.ts` — pass a
`RunnableConfig` with `tags: ["planner-internal"]` to every
structured-output invocation (and any future raw invocations):

```ts
const PLANNER_INTERNAL_CONFIG = {
  tags: ["planner-internal"],
} as const;

async function invokeStructured<T>(
  model, schema, messages, opts, label, modelName, meta?,
): Promise<T> {
  if (opts?.ledger) {
    return (await trackStructuredInvoke(model, schema, messages, {
      ledger: opts.ledger,
      label,
      model: modelName,
      meta,
      config: PLANNER_INTERNAL_CONFIG,    // ◄── threaded through
    })) as T;
  }
  return (await model
    .withStructuredOutput(schema)
    .invoke(messages, PLANNER_INTERNAL_CONFIG)) as T;
}
```

`trackStructuredInvoke` (`telemetry/track.ts`) must accept and forward
the `config` so the tag reaches the underlying ChatOpenAI call:

```ts
// telemetry/track.ts
export async function trackStructuredInvoke<T>(
  model, schema, messages,
  { ledger, label, model: modelName, meta, config },
): Promise<T> {
  // … existing pre-call telemetry …
  const result = await model.withStructuredOutput(schema).invoke(messages, config);
  // … existing post-call telemetry …
  return result;
}
```

LangChain propagates `config.tags` down to every child runnable —
including the OpenAI client's streaming HTTP call. The metadata
attached to each streamed AIMessageChunk will include
`"planner-internal"` somewhere in its tag chain.

### B — Filter tagged chunks in `streamAgent`

`apps/api/src/services/agent/chat/streamAgent.ts`:

```ts
function isPlannerInternalChunk(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object") return false;
  const tags = (metadata as { tags?: unknown }).tags;
  if (!Array.isArray(tags)) return false;
  return tags.includes("planner-internal");
}

// inside the stream loop:
if (mode === "messages") {
  const tuple = payload as [unknown, unknown];
  const msg = tuple[0];
  const metadata = tuple[1];
  if (!isAssistantStreamChunk(msg)) continue;
  if (isPlannerInternalChunk(metadata)) continue;   // ◄── NEW

  const text = textFromChunk(msg as BaseMessage);
  // … rest unchanged …
}
```

The check runs per chunk. Tagged chunks are dropped before they reach
`appendTextChunk` and `emit({ kind: "text-delta" })` — neither the
patcher nor the wire sees them. The orchestrator's own chunks have
no `planner-internal` tag and stream normally.

---

## Why a tag instead of `callbacks: []`

LangChain has a sharper hammer — passing `callbacks: []` in the
config would break the inheritance chain entirely, so child calls
don't fire any parent callbacks. Two reasons not to use that:

1. **Loss of telemetry.** Token usage, LangSmith traces, ledger
   tracking — all of those ride the callback chain. Severing it for
   planner calls means losing token counts for stages 1/2/3.
2. **Wrong scope.** We don't want to *hide* the planner from
   observability; we want to hide it from the **wire stream that
   feeds the visitor's chat bubble**. Tag-based filtering at the
   streamAgent layer says exactly that.

Tags propagate; observability still works; only the wire path
filters.

---

## Files

```
EDIT  apps/api/src/services/agent/subagents/planner/run.ts
        + PLANNER_INTERNAL_CONFIG = { tags: ["planner-internal"] }
        + thread config into invokeStructured + trackStructuredInvoke

EDIT  apps/api/src/services/agent/telemetry/track.ts
        + accept + forward `config` in trackStructuredInvoke options

EDIT  apps/api/src/services/agent/chat/streamAgent.ts
        + isPlannerInternalChunk(metadata) check
        + skip the chunk before appendTextChunk + emit
```

---

## Verification

1. **Replay the trigger.** Ask the agent *"create a walkthrough on
   creating an agent"*. The patch stream should:
   - have **no** `string-append` ops into `/messages/1/parts/0/text`
     during the planner's stages 1–3,
   - then show the patcher writes for `thoughts`, `reasoning`,
     `planGoal`, `chapters`,
   - then show the orchestrator's closing turn streaming as prose
     into `/messages/1/parts/0/text` — and only that.

2. **Snapshot test for the filter.** Add to
   `streamAgent.test.ts`:

   ```ts
   test("drops chunks tagged planner-internal", async () => {
     const stream = mockStream([
       ["messages", [aiChunk("orchestrator says "), { tags: [] }]],
       ["messages", [aiChunk("{\"understanding\":"), { tags: ["planner-internal"] }]],
       ["messages", [aiChunk("hi"), { tags: [] }]],
     ]);
     const collected = await runStreamAgent(stream);
     expect(collected.text).toBe("orchestrator says hi");
   });
   ```

3. **LangSmith trace.** Planner stages still appear as child runs,
   token counts still report. Visible only in observability, not on
   the wire.

---

## Cross-references

- `02-plan-shape.md` §"Three-call flow inside `runPlanner`" — what's
  being filtered
- `04-orchestrator-wiring.md` §6 — the closing-turn behavior the
  filtered stream restores
- `fixes/01-parallel-tool-calls-race.md` — the companion bug from
  the same trace
- `apps/api/src/services/agent/chat/streamAgent.ts` — file to edit
- `apps/api/src/services/agent/subagents/planner/run.ts` — file to edit
- `apps/api/src/services/agent/telemetry/track.ts` — file to edit
- `langchain-skills:langchain-middleware` — `wrapModelCall` reference;
  tag-based filtering is the same pattern at the stream layer
