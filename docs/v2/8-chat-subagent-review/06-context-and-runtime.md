# 8.6 — History, `run.ts`, `streamText.ts`

> The non-prompt edits. Each one is small and independent; ship them in any
> order after chapter 05 lands.

---

## Edits at a glance

```
chapter 06 edits
        │
        ├── EDIT  context/extractHistory.ts        (token budget + non-text summary)
        ├── EDIT  subagents/chat/run.ts            (single code path)
        ├── EDIT  workflow/nodes/streamText.ts     (sanitize error + drop blind retry)
        └── NEW   prompts/util/budget.ts           (centralized BUDGETS map)
```

---

## `context/extractHistory.ts` — token budget + non-text summary

Today: count-based clamp at 20 turns, drops every non-text part.

Suggested:

```ts
import type { Conversation, Message } from "@repo/walkthrough-core";
import type { HistoryTurn } from "./types.js";

const MAX_HISTORY_CHARS = 6000;          // ~1.5k tokens
const MAX_HISTORY_TURNS = 30;            // safety net

function summarizeNonText(msg: Message): string | null {
  // One-line summaries for parts the chat model can't read directly.
  const summaries: string[] = [];
  for (const p of msg.parts) {
    if (p.type === "walkthrough") {
      const keys = (p.steps ?? []).map((s) => s.popoverElementId).filter(Boolean);
      summaries.push(`(walkthrough goal: "${p.planGoal ?? "?"}", highlighted: ${keys.join(" → ") || "—"})`);
    } else if (p.type === "tool-call") {
      summaries.push(`(called tool ${p.name})`);
    }
  }
  return summaries.length ? summaries.join(" ") : null;
}

export function extractHistory(conv: Conversation): HistoryTurn[] {
  const turns: HistoryTurn[] = [];
  for (const msg of conv.messages) {
    if (msg.status === "streaming") continue;

    const text = msg.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text).join("\n").trim();

    const summary = summarizeNonText(msg);
    const combined = [text, summary].filter(Boolean).join("\n").trim();
    if (!combined) continue;

    turns.push({ role: msg.role, text: combined });
  }

  // Walk back from the most recent turn, accumulating up to the char cap.
  const out: HistoryTurn[] = [];
  let used = 0;
  for (let i = turns.length - 1; i >= 0 && out.length < MAX_HISTORY_TURNS; i--) {
    const cost = turns[i].text.length + 1;
    if (used + cost > MAX_HISTORY_CHARS) break;
    out.unshift(turns[i]);
    used += cost;
  }
  return out;
}
```

Two payoffs:
- chat retains a one-line memory of prior walkthroughs and tool calls;
- the history block can't blow the system-prompt budget on long sessions.

Type names (`p.type === "walkthrough"`, `planGoal`, `steps`) follow the
existing `@repo/walkthrough-core` shape — adjust to whatever the part
types are called the day this lands.

---

## `subagents/chat/run.ts` — single code path

Today: two branches (ledger vs no ledger). Suggested:

```ts
export async function* runChat(
  model: BaseChatModel,
  ctx: AgentContext,
  query: string,
  opts?: ChatRunOpts,
): AsyncGenerator<string, { firstByte: boolean }> {
  const messages = buildChatMessages(ctx, query);
  const gen = trackStream(model, messages);

  let firstByte = false;
  let result = await gen.next();
  while (!result.done) {
    if (result.value) firstByte = true;
    yield result.value;
    result = await gen.next();
  }

  const usage = result.value ?? emptyUsage();
  if (opts?.ledger) {
    recordStreamUsage(opts.ledger, "chat", usage, { model: opts.model });
  }
  return { firstByte };
}
```

Two improvements:
- one streaming code path; `trackStream` already records usage tokens
  whether or not the ledger is provided;
- the generator's *return value* carries `firstByte`, so the caller no
  longer needs an outer `streamed` boolean to decide whether to retry.

---

## `workflow/nodes/streamText.ts` — sanitize error + drop blind retry

The current pre-first-byte retry runs `narrate()` again with identical
inputs; failures are usually deterministic, so the retry burns tokens and
delays the error message. Suggested:

```ts
try {
  const { firstByte } = await narrate();
  if (!firstByte) {
    h.appendTextChunk(conv, msgIndex, textPartIndex,
      "Sorry — I couldn't generate an answer. Please try rephrasing.");
    await patcher.emit();
  }
} catch (err) {
  if (isAbortError(err)) {
    if (streamed) {
      h.setMessageStatus(conv, msgIndex, "complete");
      try { await patcher.emit(); } catch {}
    }
    throw err;
  }
  console.error("[agent] chat stream failed", err);   // keep the cause server-side
  if (!streamed) {
    h.appendTextChunk(conv, msgIndex, textPartIndex,
      "Sorry — I couldn't answer that. Please try again.");
    await patcher.emit();
  }
}
```

Two changes:
- The blind retry is gone. Add it back only with backoff + model fallback.
- The user-visible error string no longer leaks `err.message`. The cause
  still lands in `console.error`.

The `streamed` boolean keeps its existing meaning. `narrate()` becomes
small enough to inline, but no need to refactor that here.

---

## `prompts/util/budget.ts` — centralize the constants

Today: four `MAX_CHARS` constants spread across four sections. Suggested:

```ts
export const BUDGETS = {
  elementsTree:     8000,
  hostState:        4000,
  hostTools:        4000,
  knowledge:        6000,
  customerOverlay:  4000,
  history:          6000,
  perKnowledgeEntry: 800,
} as const;

export function truncateText(/* unchanged */) { /* ... */ }
export function estimateTokens(chars: number) { return Math.ceil(chars / 4); }
```

Each section imports its budget from `BUDGETS.x`. Tuning the budget map
is now one diff.

---

## Dendrogram of effects

```
chapter 06 wins
        │
        ├── chat remembers prior walkthroughs           (extractHistory)
        ├── one chat code path, telemetry always wired  (run.ts)
        ├── visitor error text no longer leaks stacks   (streamText.ts)
        └── budgets tuned in one place                  (budget.ts)
```

None of these depend on the projection work in chapters 03–05. You could
ship `budget.ts` alone in an afternoon and it would be a meaningful tidy.

---

## Next

[07-rollout.md](./07-rollout.md) — order to apply, milestones, and what
"done" looks like.
