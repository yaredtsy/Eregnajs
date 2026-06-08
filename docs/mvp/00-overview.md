# MVP — Embeddable Agent (overview + index)

> Status: plan. A **standard LangChain agent** producing a chat conversation, with one product extension: the `walkthrough` message part — already in code at `packages/widget/src/types/conversation.ts` and `packages/widget/src/data/sample-conversation.ts`. **This plan converges on that shape, not a new one.**
>
> Each section of the plan lives in its own file, one domain per file, mirroring the codebase layout we're targeting. Read in numerical order; later docs assume earlier ones.

---

## What the MVP is, in one paragraph

A visitor on a host site asks a question through the embedded widget. The API loads context from the DB (agent + page + element tree) plus whatever the host page injected through `window.eregna` (state, tools). A **LangGraph orchestrator** dispatches three focused **sub-agents**: a Planner that returns the plan/chapters, a Stepper that returns the steps + actions for one chapter, and a Narrator that streams the popover body for one step. Each sub-agent's output is mutated into a `Conversation` mirror; `fast-json-patch` observes the mutations and emits RFC 6902 patches; the patches stream to the widget as NDJSON; the widget applies them and the existing renderers (chat popup + spotlight overlay + player bar) animate the walkthrough on the host DOM. The final run record persists to a local **SQLite** file for history replay.

---

## The three actors

```
┌──────── Host page ────────┐    ┌──── Widget (shadow DOM) ────┐    ┌────── apps/api ──────┐
│ window.eregna             │ ◄──│ runStream                   │ ◄──│ orchestrator         │
│   .registerTool(...)      │    │ applyPatch                  │    │   ├─ PlannerSubAgent │
│   .setState(...)          │    │ store (one new APPLY_PATCH) │    │   ├─ StepperSubAgent │
│   .ask("...")             │ ──►│ ChatPopup / Overlay         │    │   └─ NarratorSubAgent│
└───────────────────────────┘    └─────────────────────────────┘    │ patcher              │
                                                                    │ ndjson               │
        host writes              widget reads/writes                 │ runs (SQLite)        │
        state & tools            the Conversation                    └──────────────────────┘
```

| Actor       | Writes                                            | Reads                                          |
|-------------|---------------------------------------------------|------------------------------------------------|
| API (LLM)   | JSON Patches mutating `Conversation`              | DB + host-injected state + host-injected tools |
| Widget      | applies patches → renders chat + plays walkthrough| `Conversation`                                 |
| Host page   | injects `state`, registers `tools`, calls `ask()` | nothing — fire-and-forget                      |

**Hard rule on context sources.** The agent only sees (a) DB rows for agent/page/elements, (b) `hostState` from the request body, (c) `hostTools` from the request body, (d) prior `Conversation` messages. **No HTML fetch, no scrape.** If it isn't in one of those four, the agent doesn't know about it.

---

## Folder layout (full tree)

The doc layout mirrors the code. Every section gets its own file; every file has its own folder if it grows.

```
packages/walkthrough-core/src/                    ← NEW shared package
├── conversation/ { types, langchain, applyPatch }
├── walkthrough/  { types, actions, timing }
└── patch/        { types }

apps/api/
├── db/schema.sql                ← SQLite schema for agent_runs
└── src/
    ├── lib/sqlite.ts            ← bun:sqlite connection
    ├── routes/agent.ts          ← POST /v1/agent/run, GET /v1/agent/runs/:id
    └── services/agent/
        ├── run.ts               ← composes everything below
        ├── context/             { types, compose, focusChapter, providers/*, util/* }
        ├── prompts/             { types, compose, sections/* }
        ├── subagents/           { types, planner/*, stepper/*, narrator/* }   ← three focused LLM calls
        ├── workflow/            { types, graph, nodes/*, util/* }              ← LangGraph orchestrator
        ├── patcher/             { createPatcher, helpers, transformStringAppend, streamablePaths, frame }
        ├── transport/           { ndjson }
        ├── llm/                 { provider, openai }
        └── runs/                { types, save, load, list }                    ← SQLite via bun:sqlite

packages/widget/src/
├── embed/   { installGlobal, host-api, host-api.impl, hostTools, hostState }
├── agent/   { runStream, applyPatch, store }
└── engine/  { playStep, waitLiveAdvance, selectors, actions/* }
```

No file is expected to exceed ~150 LOC. Sub-folders absorb growth.

---

## Read in this order

| #  | File                                                    | Domain                                                                                                |
|----|---------------------------------------------------------|-------------------------------------------------------------------------------------------------------|
| 01 | [`01-conversation-shape.md`](./01-conversation-shape.md) | Types: what we keep from the shipped sample, what we extend, why; live vs. history play modes        |
| 02 | [`02-context.md`](./02-context.md)                       | `ContextProvider` interface + the providers + `focusChapter` for per-chapter prompts                  |
| 03 | [`03-prompts.md`](./03-prompts.md)                       | `PromptSection` interface + system-prompt section library                                            |
| 04 | [`04-workflow.md`](./04-workflow.md)                     | LangGraph `StateGraph`: enrich → plan → streamChapter → streamBody → complete; routing               |
| 05 | [`05-subagents.md`](./05-subagents.md)                   | The three sub-agents (Planner, Stepper, Narrator) — prompts, schemas, run functions                   |
| 06 | [`06-patcher-and-wire.md`](./06-patcher-and-wire.md)     | `fast-json-patch` observe + patch helpers + NDJSON transport + string-append convention               |
| 07 | [`07-engine.md`](./07-engine.md)                         | Widget engine: `playStep`, action handlers, selector resolution, live vs. history advancement         |
| 08 | [`08-embed-and-host-api.md`](./08-embed-and-host-api.md) | `window.eregna` install, `HostApi` + `ToolSpec`, hostTools registry, hostState store, `ask()` flow   |
| 09 | [`09-persistence.md`](./09-persistence.md)               | SQLite (`bun:sqlite`) for `agent_runs`; save / load / list; history replay format                    |
| 10 | [`10-libraries.md`](./10-libraries.md)                   | Dependency choices + alternatives considered                                                          |
| 11 | [`11-build-order.md`](./11-build-order.md)               | Phased build, parallelism, acceptance-criteria mapping                                                |
| 12 | [`12-open-questions.md`](./12-open-questions.md)         | Default answers + decisions still to lock                                                             |

---

## Two non-negotiable shapes (everything else flows from these)

These two shapes are referenced by every doc that follows. If you remember nothing else, remember these.

### The Conversation document (mutated by patches)

```ts
Conversation = { sessionId, agentName, messages: Message[] }

Message = {
  id, role: "user"|"assistant",
  parts: MessagePart[],
  status: "streaming"|"complete"|"error",       // ◀── added
  createdAt
}

MessagePart = TextPart | WalkthroughPart

WalkthroughPart = {
  type: "walkthrough",
  walkthroughId, planGoal, planRationale?,
  status: "planning"|"playing"|"complete"|"error",  // ◀── added
  chapters: WalkthroughChapter[],
  steps:    WalkthroughStep[],
  parentContext: WalkthroughPosition | null
}

WalkthroughChapter = {
  title,
  description,           // ◀── added
  elementId,             // ◀── added (drives per-chapter prompt context)
  stepIndex              // initially -1; filled when chapter's first step arrives
}

WalkthroughStep = {
  id,
  actions: WalkthroughAction[],
  popover?: { title?, body, elementId? },
  status: "pending"|"running"|"done"|"skipped",     // ◀── added
  skipReason?                                       // ◀── added
}

WalkthroughAction =
  | { type: "scroll-to";      elementId }
  | { type: "highlight";      elementId }
  | { type: "wait";           ms }
  | { type: "wait-for-click"; elementId, timeoutMs? }   // ◀── added
  | { type: "call-tool";      toolName, args }          // ◀── added
```

### The two play modes

| Mode | Trigger | `popover.body` source | Step advancement |
|------|---------|-----------------------|------------------|
| **live** | started via `window.eregna.ask()` → `runStream()` open | `add` patches append chunks to `…/popover/body`. Renderer shows exactly what's arrived. Never sent upfront. | Event-driven (actions complete + next step exists). `wait-for-click` gates as usual. |
| **history** | loaded from `agent_runs.state_snapshot` | Full `body` already in the row. | Offset-driven via existing `usePlayer` rAF + `localOffsetMs / TYPEWRITER_MS_PER_CHAR`. |

The widget chooses the mode from the source; existing components keep working unchanged for history mode.

---

## Architectural commitments (recap)

1. **JSON Patch over NDJSON** as the wire format (`fast-json-patch` on both sides).
2. **LangGraph `StateGraph`** as the orchestrator from day one.
3. **Three sub-agents** (Planner, Stepper, Narrator) — each a focused LLM call, not a monolithic agent with tools.
4. **`withStructuredOutput` / `model.stream()`** for sub-agent outputs — not forced tool calls. Tool-calling is reserved for when an LLM has a real choice to make.
5. **Granular patch helpers** (1:1 mutation → patch) on the orchestrator side. No streaming-JSON-args parser.
6. **`agent_runs` in SQLite** via `bun:sqlite`. Existing Supabase Postgres stays for the shipped CRUD.
7. **Walkthrough types live in `packages/walkthrough-core`** and the widget re-exports.
8. **Two play modes**, one Conversation shape.
9. **Server never fetches host HTML.** Context only flows from DB + `hostState` + `hostTools`.

These are non-negotiable for MVP. Anything else is up for adjustment via `12-open-questions.md`.
