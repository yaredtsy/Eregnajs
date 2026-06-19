# 8.1 — Current state, file by file

> What's actually in the repo today. Numbers are line counts at review time.
> Read this with the dendrogram from [00-overview.md](./00-overview.md) open.

---

## File map

```
apps/api/src/services/agent/
    │
    ├── subagents/
    │     └── chat/
    │           ├── prompt.ts        23 lines
    │           └── run.ts           40 lines
    │
    ├── prompts/
    │     ├── compose.ts             64 lines   (also hosts inspectPrompt)
    │     ├── types.ts                7 lines
    │     ├── util/budget.ts         15 lines
    │     └── sections/
    │           ├── rules.ts                  shared, 14 lines
    │           ├── customerOverlay.ts        14 lines
    │           ├── pageContext.ts            15 lines
    │           ├── elementsTree.ts           38 lines  (cap 8000 chars)
    │           ├── hostStateBlock.ts         22 lines  (cap 4000 chars)
    │           ├── hostToolsBlock.ts         22 lines  (cap 4000 chars)
    │           └── knowledgeBlock.ts         57 lines  (cap 6000 chars)
    │
    ├── context/
    │     ├── types.ts               43 lines
    │     └── extractHistory.ts      25 lines   (clamp = 20 turns)
    │
    └── workflow/nodes/
          └── streamText.ts          72 lines
```

---

## `subagents/chat/prompt.ts`

```ts
buildChatMessages(ctx, query): BaseMessage[]
        │
        ├── SystemMessage( composeSystemPrompt(ctx) )      ← planner-grade
        │
        ├── for turn in ctx.conversationHistory:
        │     └── HumanMessage | AIMessage
        │
        └── HumanMessage(
              "Answer the visitor's question in plain text. Be concise…
               Do not plan a walkthrough unless they explicitly ask…
               Question: {query}"
            )
```

Two observations carried into chapter 02:
- The system prompt is *the same one the planner would get*. No projection.
- The trailing HumanMessage smuggles operator instructions next to the
  visitor's question.

---

## `subagents/chat/run.ts`

```
runChat(model, ctx, query, opts?)
        │
        ▼
buildChatMessages(ctx, query)
        │
        ▼
   has opts.ledger?
        ├── yes ──► trackStream → recordStreamUsage("chat", usage)
        └── no  ──► model.stream() → yield textFromChunk(chunk)
```

The "no-ledger" branch silently drops usage. Two code paths to maintain;
chapter 06 collapses them into one.

---

## `prompts/compose.ts`

```ts
DEFAULT_SECTIONS = [
  rulesSection,            // walkthrough-flavoured "you are a walkthrough agent"
  customerOverlaySection,  // agent.system_prompt (trusted)
  pageContextSection,      // title / path / description
  elementsTreeSection,     // full tree, ≤ 8 KB
  knowledgeSection,        // facts + hostKnowledge, ≤ 6 KB
  hostStateSection,        // JSON, ≤ 4 KB
  hostToolsSection,        // ≤ 4 KB
]

composeSystemPrompt(ctx, sections = DEFAULT) → string
inspectPrompt(ctx, sections = DEFAULT) → { prompt, sections, charCount, tokenEstimate }
```

There is **no role-specific section set**. The planner, stepper, narrator,
and chat all call `composeSystemPrompt(ctx)` with no second argument.

---

## `prompts/sections/rules.ts`

```
## Rules
- You are a guided walkthrough agent. Your job is to help visitors navigate
  the host page.
- Only reference elements that exist in the provided element tree.
- Never invent element IDs or DOM selectors.
- Keep walkthrough steps concise and action-focused.
- Use plain language; avoid jargon unless the user's question uses it.
- Never fetch or scrape external URLs. All context is provided to you.
```

This single rules block is shared by every role. Chapter 04 splits it.

---

## Other sections (one line each)

| File | Cap | Notes |
|---|---|---|
| `customerOverlay.ts` | none | `agent.system_prompt`; null → skipped |
| `pageContext.ts` | none | title / path / description; neutral, fine for every role |
| `elementsTree.ts` | 8 KB | full tree depth-indented; largest block — pure noise for most chat |
| `knowledgeBlock.ts` | 6 KB | site facts + hostKnowledge; **already has trust framing** — highest-signal for chat |
| `hostStateBlock.ts` | 4 KB | JSON dump; **trust framing missing** |
| `hostToolsBlock.ts` | 4 KB | tool list; chat can't call tools |

---

## `context/extractHistory.ts`

```
extractHistory(conversation): HistoryTurn[]
        │
        ├── skip msg.status === "streaming"
        ├── join only `text` parts
        ├── drop empty
        └── slice(-20)
```

Walkthrough turns (steps, popovers, tool results) leave no trace in the
chat history. If a visitor asks "go back to the URL field", the chat model
has no record of having ever highlighted it. Chapter 06 addresses this.

---

## `workflow/nodes/streamText.ts`

```
streamTextNode(state)
        │
        ├── addUserMessage(conv, …)
        ├── ensure assistant message
        ├── addTextPart(conv, msgIndex)
        │
        ├── pickModel(ctx.agent.model)
        ├── narrate() →
        │     for chunk of runChat(...):
        │         appendTextChunk(conv, msgIndex, partIndex, chunk)
        │         patcher.emit()
        │
        ├── on error:
        │     ├── abort     → keep partial, rethrow
        │     ├── mid-stream → keep partial, warn
        │     └── pre-first-byte → retry narrate(), else "Sorry, …{err.message}"
        │
        └── setMessageStatus(complete) + emit
```

Mostly fine. Two minor concerns covered in chapter 06: the retry repeats
the same call, and the user-visible error string leaks raw exception text.

---

## Next

[02-issues.md](./02-issues.md) — the four problems that matter.
