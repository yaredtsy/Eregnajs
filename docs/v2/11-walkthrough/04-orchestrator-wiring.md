# 11.4 — Orchestrator wiring

> Where the chat agent meets the planner. Two new server-side pieces:
> the `start_walkthrough` tool and a `wrapModelCall` middleware that
> projects the most-recent walkthrough into a SystemMessage on every
> model call.

---

## The two-piece picture

```
   apps/api/src/services/agent/workflow/chatAgent.ts
        │
        ├── tools[]
        │    ├── ...specs.map(...)              (host tools — from 9/)
        │    └── startWalkthroughTool(ctx,      ◄── NEW
        │                              patcher,
        │                              messageRef)
        │
        └── middleware[]
             ├── createClientToolInterruptMiddleware(specs)  (from 9/)
             └── createWalkthroughContextMiddleware(patcher) ◄── NEW
```

Both new pieces share a closure over the patcher so they can read /
write conversation state without going through agent graph state.

---

## Rule 1 — Selection rule for the middleware

This is the load-bearing rule for follow-up behavior. Stated as code:

```ts
// apps/api/src/services/agent/workflow/middleware/walkthroughContext.ts
function findActiveWalkthroughPart(conv: Conversation):
  { msgIndex: number; partIndex: number; part: WalkthroughPart } | null
{
  for (let i = conv.messages.length - 1; i >= 0; i--) {
    const msg = conv.messages[i];
    if (msg.role !== "assistant") continue;
    for (let j = msg.parts.length - 1; j >= 0; j--) {
      const p = msg.parts[j];
      if (p.type === "walkthrough") {
        return { msgIndex: i, partIndex: j, part: p };
      }
    }
  }
  return null;
}
```

Stated in one sentence: **the middleware projects the most recent
`WalkthroughPart` in `conversation.messages`, and only that one.** If
the model wants to talk about an older tour, it has the original
ToolMessage ack (`{ walkthroughId, chapterCount, status }`) and the
chat rule that says "offer to re-plan rather than recall chapters."

---

## Rule 2 — The middleware itself

```ts
import { createMiddleware } from "langchain";
import { SystemMessage } from "@langchain/core/messages";
import type { Patcher } from "../../patcher/createPatcher.js";
import { renderActiveWalkthroughMarkdown } from "./walkthroughProjection.js";

export function createWalkthroughContextMiddleware(patcher: Patcher) {
  return createMiddleware({
    name: "walkthrough-context",
    wrapModelCall: async (request, handler) => {
      const active = findActiveWalkthroughPart(patcher.conversation);
      if (!active) return await handler(request);

      const projection = renderActiveWalkthroughMarkdown(active.part);
      request.messages = [
        new SystemMessage(projection),
        ...request.messages,
      ];
      return await handler(request);
    },
  });
}
```

`wrapModelCall` from `langchain-skills:langchain-middleware`: runs
before every model call, returns whatever the handler returns. We
prepend a `SystemMessage` so providers that support multiple system
messages concatenate; for providers that only take the first, the
projection lands at the top.

### Why prepend, not replace

The agent's built-in system prompt (`composeSystemPrompt(ctx,
CHAT_SECTIONS)`) carries identity and chat rules. The projection
carries *facts about the active plan*. They serve different jobs;
they coexist.

### Idempotency

`wrapModelCall` re-runs on every model call — including after a tool
result. There's no `interrupt()` here, so the HITL "side effects
before interrupt re-run" rule doesn't bite. The function is pure
(reads state, returns a new messages array); safe to re-enter.

---

## Rule 3 — What the projection looks like

```ts
// apps/api/src/services/agent/workflow/middleware/walkthroughProjection.ts
export function renderActiveWalkthroughMarkdown(part: WalkthroughPart): string {
  const reasoning = part.reasoning
    ? `\n### Reasoning the planner shared with the visitor\n` +
      `- Understanding: ${part.reasoning.understanding}\n` +
      `- Component mapping: ${part.reasoning.componentMapping}\n`
    : "";

  const chapters = part.chapters.length
    ? "\n### Chapters\n" +
      part.chapters
        .map((c, i) =>
          `${i + 1}. **${c.title}** — ${c.description} ` +
          `(intent: ${c.intent}, ~${c.expectedSteps} step(s))`)
        .join("\n")
    : "\n_Chapters are still being drafted._";

  return `## Active walkthrough (${part.status})
Goal: ${part.planGoal}${part.planRationale ? `\nRationale: ${part.planRationale}` : ""}
${reasoning}${chapters}

The visitor sees this checklist in the widget right now. Reference it
by chapter titles when relevant. Do not quote the reasoning verbatim
— the visitor already sees it. If the visitor asks to change the plan,
call \`start_walkthrough\` again with a refined goal.`.trim();
}
```

Capped at ~1 KB for a full 6-chapter plan. The closing two
sentences reinforce the chat rules in case the chat-rules section
gets edited out of sync.

---

## Rule 4 — The `start_walkthrough` tool

```ts
// apps/api/src/services/agent/tools/builtin/startWalkthrough.ts
import { tool } from "langchain";
import { z } from "zod";
import { nanoid } from "nanoid";
import type { Patcher } from "../../patcher/createPatcher.js";
import type { AgentContext } from "../../context/types.js";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { runPlanner } from "../../subagents/planner/run.js";
import * as h from "../../patcher/helpers.js";

export function startWalkthroughTool(
  model: BaseChatModel,
  ctx: AgentContext,
  patcher: Patcher,
  getAssistantMsgIndex: () => number,   // closure — current assistant message
) {
  return tool(
    async ({ goal }: { goal: string }) => {
      const msgIndex = getAssistantMsgIndex();
      const partIndex = h.replaceOrAddWalkthroughPart(
        patcher.conversation,
        msgIndex,
        {
          walkthroughId: `wt_${nanoid(10)}`,
          planGoal: "",                  // filled by stage 2
          status: "planning",
          chapters: [],
          steps: [],
          parentContext: null,
          thoughts: [],
        },
      );
      await patcher.emit();

      try {
        const plan = await runPlanner(model, ctx, goal, {
          patcher,
          msgIndex,
          partIndex,
        });

        return JSON.stringify({
          walkthroughId: patcher.conversation
            .messages[msgIndex].parts[partIndex].walkthroughId,
          chapterCount: plan.chapters.length,
          status: "planned",
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        h.setWalkthroughStatus(
          patcher.conversation, msgIndex, partIndex, "error");
        await patcher.emit();
        return JSON.stringify({
          status: "error",
          message: `Could not plan the walkthrough: ${message}`,
        });
      }
    },
    {
      name: "start_walkthrough",
      description:
        "Plan a guided tour of the host page that answers a specific " +
        "visitor goal. Use when the visitor explicitly asks to be shown, " +
        "walked through, or guided. Pass a one-sentence goal derived " +
        "from the visitor's request. Do not call this unprompted.",
      schema: z.object({
        goal: z.string().min(8).max(280).describe(
          "One sentence describing what the tour should accomplish, " +
          "phrased as an outcome the visitor will reach.",
        ),
      }),
    },
  );
}
```

The tool's *return* is a minimal ack the model uses to decide what
to say in its closing turn. The substance of the plan reaches the
model via the middleware projection on the next call.

### Why `getAssistantMsgIndex` is a closure

The chat run knows which assistant message is being streamed (the
existing `runChatAgent` tracks `assistantMsgIndex`). The tool needs
to know which message to attach the walkthrough part to. Closing
over the index keeps the tool's signature clean and avoids passing
agent state through tool args (which would expose it to the model).

### `replaceOrAddWalkthroughPart` — re-plan idempotency

New patcher helper. Behavior:

```
   if there is already a walkthrough part on this message:
      replace it (preserve walkthroughId if the goal is unchanged,
                  generate a new id if the goal differs)
      reset all stages to empty
   else:
      append a new walkthrough part
   return partIndex
```

This handles the case where the model calls `start_walkthrough` twice
in the same assistant turn. The "most recent" middleware rule means
the model only ever sees one plan per turn either way; the patcher's
job is to keep the conversation state honest.

---

## Rule 5 — Wiring the tool into `buildChatAgent`

`workflow/chatAgent.ts` gains two args (`patcher`,
`getAssistantMsgIndex`) so the tool and middleware can close over them:

```ts
export function buildChatAgent(
  model: BaseChatModel,
  ctx: AgentContext,
  specs: ToolDescriptor[],
  patcher: Patcher,
  getAssistantMsgIndex: () => number,
) {
  const tools = [
    ...specs.map((spec) =>
      tool(
        async () => JSON.stringify({ ok: false, error: "server-tools-not-wired-yet" }),
        { name: spec.name, description: spec.description, schema: jsonSchemaToZod(spec.parameters) },
      ),
    ),
    startWalkthroughTool(model, ctx, patcher, getAssistantMsgIndex),
  ];

  const middleware = [
    createWalkthroughContextMiddleware(patcher),
    ...(specs.some((s) => s.runsIn === "client")
      ? [createClientToolInterruptMiddleware(specs)]
      : []),
  ];

  return createAgent({
    model,
    tools,
    systemPrompt: composeSystemPrompt(ctx, CHAT_SECTIONS),   // ◄── per-role set
    middleware,
    checkpointer: getCheckpointer(),
  });
}
```

The walkthrough middleware comes *first* so its SystemMessage is
nearest the top of the messages array (matters for providers that
weight earlier instructions higher).

---

## Rule 6 — The closing turn

`createAgent`'s loop terminates when the model emits an `AIMessage`
with no `tool_calls`. After `start_walkthrough` returns:

```
   ToolMessage(content="{walkthroughId, chapterCount, status: planned}")
            │
            ▼
   walkthroughContextMiddleware runs again
   → injects SystemMessage with the freshly-written plan
            │
            ▼
   model emits AIMessage with:
     content = "I've planned a 4-chapter tour to walk you through
                creating your first agent. Hit play in the widget
                when you're ready, and I'll be here for questions."
     tool_calls = []
            │
            ▼
   loop ends
```

No new node, no graph edit. The closing message is grounded because
the projection ran before this final call.

---

## Rule 7 — Failure modes and recovery

| Failure | What happens | Recovery |
|---|---|---|
| Stage 1 (reason) throws | tool catches, status → `error`, returns error ack | model apologizes in closing turn; visitor can re-ask |
| Stage 2 (frame) throws | reasoning is already written; status → `error`; ack returns | widget shows `▶ Reasoning` but no chapters; model apologizes |
| Stage 3 (chapters) throws | reasoning + goal written; chapters stay `[]`; status → `error` | same — partial visible state, model explains |
| `filterInvalidChapters` drops all chapters | status → `error`; ack carries `"all chapter keys unknown"` | model apologizes; chat rules say to suggest re-asking with simpler goal |
| Model never calls `start_walkthrough` despite explicit ask | nothing happens | chat rule prompt iteration (evals will surface this) |
| Model calls `start_walkthrough` unprompted | walkthrough lands; visitor sees a plan they didn't ask for | chat rule "do not call unprompted" + eval coverage |
| Model calls `start_walkthrough` twice in one turn | second call replaces the first via `replaceOrAddWalkthroughPart` | "most recent" middleware still picks the right one |

Phase 1 does not implement automatic retries on stage failure — one
attempt per stage, per visitor question. Repair attempts (re-invoking
with a hint) remain inside `runPlanner` exactly as today.

---

## Rule 8 — Context budget control

The projection is capped at ~1 KB by the markdown shape (6 chapters ×
~120 chars + 2 reasoning paragraphs + frame). Older walkthroughs in
history contribute only their original ToolMessage acks (~80 bytes
each). At 10 walkthroughs in one session that's ~800 bytes of legacy
acks — negligible against the 1 KB active projection.

If a session grows so long that legacy acks accumulate (>10), a future
optimization can collapse them in the agent state via a `beforeModel`
hook. Phase 1 does not implement that.

---

## Files

```
NEW   apps/api/src/services/agent/tools/builtin/startWalkthrough.ts
NEW   apps/api/src/services/agent/workflow/middleware/walkthroughContext.ts
NEW   apps/api/src/services/agent/workflow/middleware/walkthroughProjection.ts
EDIT  apps/api/src/services/agent/workflow/chatAgent.ts
EDIT  apps/api/src/services/agent/chat/run.ts       (pass patcher +
                                                      getAssistantMsgIndex)
EDIT  apps/api/src/services/agent/patcher/helpers.ts
        + replaceOrAddWalkthroughPart
        + setWalkthroughReasoning  (from 02)
        + setPlanGoal              (from 02)
```

---

## Cross-references

- `02-plan-shape.md` — the schemas and types the tool writes
- `03-prompt-and-rules-split.md` — `CHAT_SECTIONS` and the chat rule
  that tells the model when to call `start_walkthrough`
- `05-planner-ui.md` — what the visitor sees while the tool runs
- `9-chat-with-tools/05-chat-loop.md` — the `createAgent` loop and
  `wrapToolCall` middleware this builds alongside
- `langchain-skills:langchain-middleware` — `wrapModelCall` reference
