# 11 — Walkthrough

> Re-enabling the guided-tour path on top of the `9-chat-with-tools/`
> orchestrator. The chat agent is the boss; planner / stepper / narrator
> are specialists it dispatches to. This folder builds the path in
> three phases — **planner first**, stepper next, narrator last.

## Scope

| In scope (this folder) | Out of scope |
|---|---|
| `start_walkthrough` server tool inside the chat agent | Server tool registry (lives in `9/`) |
| The `Plan` shape, planner prompt, planner UI | Embed-script-level rendering changes |
| Phase split: planner → stepper → narrator | Multi-walkthrough turns in one conversation |
| Rules split (`coreRules` + `walkthroughRules`) — the precondition | The full `8-chat-subagent-review/` rollout |
| Patcher writes for `walkthrough` part during planning | Engine playback, drift recovery |
| Playground / dev-guide-agent test surface | Auth, persistence of paused walkthroughs |

## The six hard questions this folder answers

1. **How does the orchestrator know to plan?** — It exposes one server
   tool, `start_walkthrough(goal)`. Calling it is the *only* way the
   walkthrough path begins. (chapter 04)
2. **How does the planner grasp the request before it commits?** —
   Schema-enforced CoT: the first three fields the model fills are
   `understanding`, `knowledgeAnchors`, and `componentMapping`. Only
   then does it write `chapters`. The CoT is a **first-class facet** of
   `WalkthroughPart.reasoning`, rendered in the widget as an expandable
   disclosure (Cursor/Claude-style "▶ Reasoning") — not hidden. The
   model writes it knowing it's visitor-visible. (chapter 02 + 03 + 05)
3. **What does the planner emit?** — CoT prefix + a todo-list of
   chapters, each with an `intent` and a soft `expectedSteps` hint.
   The stepper reads the chapters later; the visitor sees the
   checklist now. (chapter 02)
4. **What does the main agent do once planning finishes?** — `createAgent`
   loops one more turn after any tool result; that closing turn *is* the
   summary. The plan reaches the model via a **`wrapModelCall` middleware
   that projects the active `WalkthroughPart` into a SystemMessage on every
   turn** — not a baked-in ToolMessage. **Selection rule:** the middleware
   scans `conversation.messages` newest → oldest and projects the *first*
   `walkthrough` part it finds; if none, it injects nothing. One source of
   truth, one rendering, fresh each turn. Tool return is a tiny ack:
   `{ walkthroughId, chapterCount, status }`. Older walkthroughs survive
   only as their ToolMessage ack; if the visitor references one, chat
   rules say to offer a re-plan. (chapter 04)
5. **Why split rules first?** — The shared `rulesSection` opens with
   *"you are a walkthrough agent"*, which fights the chat path. The
   planner prompt only makes sense after `coreRules + walkthroughRules`
   exists. (chapter 03)
6. **What does the widget show when planning runs?** — The existing
   `WalkthroughCard` plus a live "thinking" line and a pending checklist
   of chapters. No play surface yet. (chapter 05)

## Reading order (dendrogram)

```
11-walkthrough/
        │
        ├── README.md (this file)
        │
        ├── 00-overview.md ──────── one-page vision, the three phases
        │       │
        │       ▼
        ├── 01-phases.md ───────── what each phase owns; what's stub
        │       │
        │       ▼
        ├── 02-plan-shape.md ───── the Plan + Chapter contract
        │       │
        │       ▼
        ├── 03-prompt-and-rules-split.md ──── rules split + planner prompt
        │       │
        │       ▼
        ├── 04-orchestrator-wiring.md ─────── start_walkthrough tool
        │       │
        │       ▼
        ├── 05-planner-ui.md ─────────────── widget surface for planning
        │       │
        │       ▼
        └── 06-rollout.md ────────── M1..M4 for phase 1 only
```

Read 00 → 06 in order. Stepper and narrator stay one-line stubs in
01 — they get their own follow-up folders (`12-walkthrough-stepper/`,
`13-walkthrough-narrator/`) once phase 1 ships.

## Mental model in one sentence

> The chat agent stays in its loop; when asked to be shown around, it
> calls **one** tool that runs the planner (with structured CoT before
> the chapters), attaches the checklist to the conversation, and the
> model writes one closing line — that's all phase 1 does.

## Two things to internalize before reading

1. **No "scroll-to" action.** The stepper's `highlight` action is the
   only mover; the player scrolls to whatever element is highlighted.
   The planner doesn't choose actions, but the no-scroll-to rule is
   stated in its prompt so it doesn't promise "first we scroll to X"
   in chapter descriptions.
2. **Planner = flow, stepper = mechanics.** The planner decides *what*
   to show and *how many* steps a chapter should take. The stepper
   decides which actions implement that. Phase 1 only ships the first
   half.

## What's different from today

| Today | After phase 1 |
|---|---|
| `planNode` exists but is dark behind `useChatAgent()` flag | Planner is a server tool inside `createAgent` |
| Planner uses planner-grade `composeSystemPrompt(ctx)` (shared rules) | Planner uses `PLANNER_SECTIONS` (post-split) |
| Plan chapters: `{ title, description, elementId }` | + `intent`, + `expectedSteps` |
| Planner emits chapters directly | Emits CoT (understanding / knowledgeAnchors / componentMapping) **first**, then chapters |
| Reasoning shape: one-line `thought` ticker only | Structured `WalkthroughPart.reasoning` (3 fields), rendered as expandable disclosure in the widget |
| No projection — model sees raw history | `wrapModelCall` middleware projects the active plan into a SystemMessage on every turn |
| Tool result carries the plan text | Tool result is a minimal ack; projection comes from conversation state |
| Chat agent's reply after planning | Auto-summary turn — middleware ensures the closing turn has plan context |
| Widget has `WalkthroughCard` (play button); no chapter list visible | Card expands into a checklist; live thought ticker |
| Walkthrough path is unreachable from the chat-with-tools agent | One tool call away |

## Canonical sources (skills first)

| Skill | What we use from it |
|---|---|
| `langchain-skills:langchain-fundamentals` | `createAgent`, `tool()` body where the planner runs |
| `langchain-skills:langchain-middleware` | None new — reuses `wrapToolCall` from `9/` |
| `langchain-skills:langgraph-persistence` | Same checkpointer, no new state shape |

Re-invoke before editing code. The framework moves; this folder doesn't.

## Cross-references

- `8-chat-subagent-review/04-rules-split.md` — the rules split is a
  precondition; chapter 03 here pulls it forward
- `9-chat-with-tools/02-architecture.md` — where the chat agent and its
  tool list live
- `9-chat-with-tools/05-chat-loop.md` — `bindTools` is how the planner
  tool reaches the model
- `7-guide-agent/02-prompts.md` — the test queries that will drive
  phase-1 acceptance
- `apps/api/src/services/agent/subagents/planner/` — existing planner
  code; phase 1 evolves it, doesn't rewrite it
