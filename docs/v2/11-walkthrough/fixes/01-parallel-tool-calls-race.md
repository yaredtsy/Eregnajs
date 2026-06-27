# Fix 01 — Parallel `start_walkthrough` calls race the patcher

> The chat agent invokes `start_walkthrough` **twice in the same
> assistant turn** when the visitor's request mentions two things
> (e.g. *"create an agent **and** the hero"*). Both calls share one
> `WalkthroughPart`; both write to the same patcher slot; the second
> call's `replaceOrAddWalkthroughPart` resets the first's stage-1
> output mid-flight; one of the two planners eventually throws and
> the tool body flips `status` to `error`. The user sees JSON-shaped
> garbage in the bubble plus a "something went wrong" apology even
> though the planner produced valid output.

---

## Symptom (the wire log)

The visitor asked:

> *"can u generate a wlkthough how to create agent and the hero"*

Two distinct goals in one sentence → GPT-4o emits two parallel tool
calls. The patch stream then shows:

```jsonc
// stage 0 — walkthrough part created
{"op":"add","path":"/messages/1/parts/1","value":{"type":"walkthrough", …, "status":"planning","thoughts":[]}}

// FOUR phase tickers written immediately — two from each parallel runPlanner
{"op":"add","path":"/messages/1/parts/1/thoughts/0","value":{… "Reading your goal…"}}
{"op":"add","path":"/messages/1/parts/1/thoughts/1","value":{… "Reading your goal…"}}   // ◄ duplicate
{"op":"add","path":"/messages/1/parts/1/thoughts/2","value":{… "Thinking through your goal…"}}
{"op":"add","path":"/messages/1/parts/1/thoughts/3","value":{… "Thinking through your goal…"}}   // ◄ duplicate

// … both stage-1 calls run; one writes reasoning …
{"op":"add","path":"/messages/1/parts/1/reasoning","value":{"understanding":"You want to learn how to use the Dashboard hero…"}}

// the OTHER parallel call's body now hits replaceOrAddWalkthroughPart
// and CLOBBERS everything we just wrote:
{"op":"remove","path":"/messages/1/parts/1/reasoning"}
{"op":"remove","path":"/messages/1/parts/1/thoughts/3"}
{"op":"remove","path":"/messages/1/parts/1/thoughts/2"}
{"op":"remove","path":"/messages/1/parts/1/thoughts/1"}
{"op":"remove","path":"/messages/1/parts/1/thoughts/0"}
{"op":"replace","path":"/messages/1/parts/1/status","value":"planning"}

// the second runPlanner now starts over — new thoughts, new stage 1, new reasoning
// (with chapter keys actually filled in this time)
{"op":"add","path":"/messages/1/parts/1/reasoning","value":{"componentMapping":"To create an agent, you'll start with the New agent button (dashboard.new-agent-btn) …"}}

// then a stage-2/3 call throws somewhere and the tool body's catch block fires:
{"op":"replace","path":"/messages/1/parts/1/status","value":"error"}

// closing AI turn: apology
{"op":"string-append","path":"/messages/1/parts/0/text","value":"It seems there was an issue generating the walkthroughs. However, I can help you with the steps to create an agent directly. …"}
```

What the visitor sees:
- a walkthrough card that shows "error" (because the catch block ran),
- followed by an apology paragraph from the orchestrator,
- with **no chapters** — even though stage 1 ran twice and stage 3 might
  have completed partially.

---

## Root cause

Two compounding issues, in order:

### 1. OpenAI's `parallel_tool_calls` defaults to `true`

`apps/api/src/services/agent/llm/openai.ts`:

```ts
return new ChatOpenAI({
  model: modelName,
  temperature: 0.2,
  apiKey: process.env.OPENAI_API_KEY,
});
// parallel_tool_calls defaults to true → GPT-4o is free to emit
// multiple tool_calls in one AIMessage.
```

The chat-rule says *"call exactly one tool at a time and wait for the
result before continuing"* — but that's a soft hint. The provider-
level flag is the hard guard, and it's not set.

When the visitor's question implies two outcomes ("how to create an
agent **and** the hero"), GPT-4o naturally proposes two tool calls in
one AIMessage:

```jsonc
{
  "tool_calls": [
    { "id": "call_1", "name": "start_walkthrough", "args": { "goal": "…create an agent…" } },
    { "id": "call_2", "name": "start_walkthrough", "args": { "goal": "…explore the dashboard hero…" } }
  ]
}
```

`createAgent`'s tool node runs them **in parallel** (`Promise.all`),
which means both tool bodies enter `runPlanner` at the same time
against the same `patcher` reference.

### 2. `replaceOrAddWalkthroughPart` was designed for sequential re-plans, not concurrent ones

`apps/api/src/services/agent/patcher/helpers.ts`:

```ts
export function replaceOrAddWalkthroughPart(conv, messageIndex, seed): number {
  const msg = conv.messages[messageIndex];
  const existingIndex = msg.parts.findIndex((p) => p.type === "walkthrough");
  if (existingIndex >= 0) {
    // replace — wipes reasoning, thoughts, chapters
    msg.parts[existingIndex] = { …seed with empty arrays… };
    return existingIndex;
  }
  msg.parts.push({ …seed… });
  return msg.parts.length - 1;
}
```

The function's contract is: "one walkthrough per message; the most
recent caller wins." That contract is fine for the documented
sequential re-plan case (chapter 04 §4). But under concurrent calls,
caller-2's reset deletes caller-1's already-streamed reasoning + plan
goal, mid-stage.

Result: caller-1's `runPlanner` thinks it's writing into an existing
slot, but the slot has been reset and is now caller-2's. Both
planners produce reasoning into the same field; one overwrites the
other; whichever planner happens to be running stage 2 or 3 when the
reset hits sees its state vanish and the tool body throws.

### 3. Cascading: status flips to `error` even though the planner mostly succeeded

The catch block in `startWalkthrough.ts` runs whenever `runPlanner`
throws *for any reason*, including throws caused by the race in (2).
So an otherwise-valid plan ends up surfaced as an error with no
chapters.

The wire log shows this exact ordering: stage 1's `reasoning` is
written → second caller's reset arrives → stage 2 of one planner
fails → `status: error` → apology in the closing AI turn.

---

## Fix

Two parts. One closes the door (provider-level), one closes the
window (patcher-level).

### A — Disable parallel tool calls on the OpenAI model

`apps/api/src/services/agent/llm/openai.ts`:

```ts
import { ChatOpenAI } from "@langchain/openai";

export function createOpenAIModel(modelName: string): ChatOpenAI {
  return new ChatOpenAI({
    model: modelName,
    temperature: 0.2,
    apiKey: process.env.OPENAI_API_KEY,
    // One tool call per assistant turn. The chat agent invokes
    // start_walkthrough as a single blocking step; parallel calls
    // race the patcher and the planner's stage 1/2/3 sequence
    // (docs/v2/11-walkthrough/fixes/01).
    modelKwargs: { parallel_tool_calls: false },
  });
}
```

`modelKwargs` is the LangChain v1 ChatOpenAI escape hatch for raw
OpenAI parameters that aren't first-class fields. `parallel_tool_calls
: false` makes OpenAI emit *at most one* tool call per AIMessage —
when GPT-4o wants to plan two tours, it must pick one, return, then
decide again on the next turn (with the first plan already projected
into the system message by the middleware).

This alone closes the bug for our current flow. Keep it as the
primary fix.

### B — Make `replaceOrAddWalkthroughPart` reject concurrent writers

Defence in depth: even if some future provider re-introduces
concurrent tool calls, the patcher shouldn't silently let two
planners stomp each other. Two options, pick one:

**B.1 (simpler) — Bail out if the existing part is still `planning`:**

```ts
export function replaceOrAddWalkthroughPart(conv, messageIndex, seed): number {
  const msg = conv.messages[messageIndex];
  const existingIndex = msg.parts.findIndex((p) => p.type === "walkthrough");
  if (existingIndex >= 0) {
    const existing = msg.parts[existingIndex];
    if (existing?.type === "walkthrough" && existing.status === "planning") {
      throw new Error(
        "replaceOrAddWalkthroughPart: another planner is mid-run on " +
          "this message; refusing to clobber its state.",
      );
    }
    // … existing replace path (re-plan after a prior plan finished) …
  }
  // … existing append path …
}
```

The tool body's catch surfaces the error to the model as
`{ status: "error", message: "another planner is mid-run…" }`. The
model writes one closing line; no half-written state survives.

**B.2 (stricter) — Keyed by a `runToken` from the tool body:**

Pass a token down through `runPlanner` → patcher writes; the patcher
only accepts writes whose token matches the part's current owner.
More machinery, only worth it if multiple concurrent walkthroughs in
one message becomes a real product need (it isn't in phase 1).

Phase 1 takes **B.1**. Three lines, defensive, doesn't change the
happy path.

---

## Files

```
EDIT  apps/api/src/services/agent/llm/openai.ts
        + modelKwargs: { parallel_tool_calls: false }

EDIT  apps/api/src/services/agent/patcher/helpers.ts
        replaceOrAddWalkthroughPart:
          + throw if existing part is still status === "planning"
```

---

## Verification

1. **Replay the trigger.** Ask the agent *"can you walk me through
   creating an agent and exploring the hero"*. The wire log should
   show exactly two thought tickers ("Reading…", "Thinking…") not
   four; one stage-1 streaming pass not two; one final `reasoning`
   write; one final chapter list with `status: planned` not `error`.

2. **Unit test for the patcher guard.** Add to
   `patcher/patcher.test.ts`:

   ```ts
   test("replaceOrAddWalkthroughPart rejects a concurrent planner", () => {
     const conv = makeConv();
     const msgIdx = h.addAssistantMessage(conv, "m1");
     h.replaceOrAddWalkthroughPart(conv, msgIdx, planningSeed("wt-A"));
     expect(() =>
       h.replaceOrAddWalkthroughPart(conv, msgIdx, planningSeed("wt-B")),
     ).toThrow(/another planner is mid-run/);
   });
   ```

3. **Confirm OpenAI param actually shipped.** Run with
   `LANGSMITH_TRACING=true`; the request body to OpenAI should include
   `"parallel_tool_calls": false` in the body of any tool-bound call.

---

## What this fix does NOT solve

The visible JSON in the user's text part during planning is a
**separate bug** (`02-structured-output-tokens-leak.md`). Even with
one tool call, the planner's stage-1 / 2 / 3 JSON tokens bleed into
the chat bubble because LangGraph propagates streaming callbacks from
the agent down into the tool's child model calls.

Fix 02 is independent and lives in its own doc.

---

## Cross-references

- `04-orchestrator-wiring.md` §4 — original
  `replaceOrAddWalkthroughPart` contract
- `04-orchestrator-wiring.md` §7 — failure-mode table, row for
  "model calls start_walkthrough twice in one turn" (which assumed
  sequential, not parallel)
- `fixes/02-structured-output-tokens-leak.md` — the companion bug
- `apps/api/src/services/agent/llm/openai.ts` — file to edit
- `apps/api/src/services/agent/patcher/helpers.ts` — file to edit
