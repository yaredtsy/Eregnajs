# 8 — Chat subagent review

> A close-read of `apps/api/src/services/agent/subagents/chat` and everything it
> pulls in. The goal: explain how the chat prompt is *actually* assembled today,
> name the four design issues, and propose a per-role projection that aligns
> the code with `docs/v2/3-server/01-context-engineering.md §3`.

## Scope

| In scope | Out of scope |
|---|---|
| `subagents/chat/prompt.ts`, `subagents/chat/run.ts` | Walkthrough enrichment / patcher |
| `prompts/compose.ts` + every section under `prompts/sections/` | NDJSON wire format |
| `context/extractHistory.ts` (chat history only) | Auth, persistence, billing |
| `workflow/nodes/streamText.ts` (the chat entry node) | Future tool-calling loop |

Everything here is a **suggestion**, not an applied change. Approve a chapter
before touching code.

## Reading order

| # | File | What's inside |
|---|---|---|
| 00 | [00-overview.md](./00-overview.md) | Where chat sits in the agent service, top-down map |
| 01 | [01-current-state.md](./01-current-state.md) | File-by-file: what's built today |
| 02 | [02-issues.md](./02-issues.md) | The four problems that matter |
| 03 | [03-projection.md](./03-projection.md) | What chat should see vs planner/stepper/narrator |
| 04 | [04-rules-split.md](./04-rules-split.md) | Splitting `rulesSection` into core / walkthrough / chat — with prompt text |
| 05 | [05-prompt-and-sections.md](./05-prompt-and-sections.md) | Concrete rewrite of `chat/prompt.ts` and section changes |
| 06 | [06-context-and-runtime.md](./06-context-and-runtime.md) | History extraction, budgets, `run.ts`, `streamText.ts` cleanups |
| 07 | [07-rollout.md](./07-rollout.md) | Order to apply, milestones, acceptance criteria |

## Key claim (one sentence)

The chat subagent **reuses the planner's system prompt verbatim** and then
fights it with a per-turn HumanMessage; the fix is to give chat its own
projection (`CHAT_SECTIONS`) and its own rules block, exactly the way
`3-server/01 §3` already prescribed for the other three roles.

## Dendrogram of this folder

```
8-chat-subagent-review/
        │
        ├── README.md  (this file)
        │
        ├── 00-overview.md ──► where chat fits
        │       │
        │       ▼
        ├── 01-current-state.md ──► what we have
        │       │
        │       ▼
        ├── 02-issues.md ──► what's wrong
        │       │
        │       ▼
        ├── 03-projection.md ──► the design principle
        │       │
        │       ▼
        ├── 04-rules-split.md ─┐
        ├── 05-prompt-and-sections.md ─┤── concrete fixes
        ├── 06-context-and-runtime.md ─┘
        │       │
        │       ▼
        └── 07-rollout.md ──► order to apply
```

Each chapter is self-contained but assumes the chapters above it.

## Cross-references

- `docs/v2/3-server/01-context-engineering.md` — projection, budgets, trust
- `docs/v2/3-server/03-subagents.md` — the role cast (chat is missing today)
- `docs/v2/7-guide-agent/02-prompts.md` — concrete prompt text for the dev guide
