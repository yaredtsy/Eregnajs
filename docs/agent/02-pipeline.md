# agent/02 — Pipeline

The two-stage flow. This is the architecture; provider-level code is in `04-llm-providers.md` and prompts are in `05-prompts.md`.

---

## End-to-end sequence

```
HTTP POST /v1/walkthroughs/run
      │
      ▼
┌──────────────────────────────────────────────────────────────┐
│ walkthroughService.startSession                              │
│  - INSERT walkthrough_sessions row                           │
│  - SSE emit { event: 'session', data: { id, ... } }          │
└──────────────────────────────────────────────────────────────┘
      │
      ▼
┌──────────────────────────────────────────────────────────────┐
│ planner.run(session)                                          │
│  - load agent + pages (titles, urls, element labels)         │
│  - provider = pickProvider(agent.model)                       │
│  - provider.generatePlan({ systemPrompt, userPrompt, model }) │
│  - validate, UPDATE session.plan_outline = plan              │
│  - SSE emit { event: 'plan', data: plan }                    │
└──────────────────────────────────────────────────────────────┘
      │ Plan JSON (committed)
      ▼
┌──────────────────────────────────────────────────────────────┐
│ streamer.run(session, plan)                                   │
│  - load picked page snapshot (full element tree)             │
│  - provider = pickProvider(agent.model)                       │
│  - provider.streamSteps({ ... }, onStep, signal)              │
│    LangChain+OpenAI: tool_calls on AIMessageChunk             │
│    Claude SDK:       eager_input_streaming on emit_step       │
│  - per validated Step:                                        │
│      • Zod-validate the Step                                 │
│      • INSERT walkthrough_steps row                          │
│      • SSE emit { event: 'step', data: step }                │
│  - on stream end: SSE emit { event: 'done', data: {} }       │
└──────────────────────────────────────────────────────────────┘
      │
      ▼
walkthroughService.endSession (status = 'complete')
```

If branching, the same pipeline runs again with `resumeSessionId` set. The planner gets played-steps as additional context (see `06-context-strategy.md`); the streamer renders the branch.

Both stages call an LLM through the `LlmProvider` interface. Specifics — including the LangChain+OpenAI and Claude SDK implementations — are in `04-llm-providers.md`.

---

## Module layout

```
apps/api/src/services/
├── walkthrough.service.ts        ← orchestrates: session row + SSE plumbing + stage handoff
├── planner.service.ts            ← Stage 1: produce Plan JSON
├── streamer.service.ts           ← Stage 2: stream Step objects
├── prompts/
│   ├── planner.prompt.ts         ← system + user template for planner
│   ├── streamer.prompt.ts        ← system + user template for streamer
│   └── context.ts                ← element-tree formatter, branch-context formatter
└── schemas/
    ├── plan.schema.ts            ← Zod schema for Plan
    └── step.schema.ts            ← Zod schema for Step (re-exported from walkthrough-core)
```

`walkthrough.service.ts` is the only module the route handler talks to. It owns the SSE emitter (a function passed in by the route) and decides what events to fire when.

---

## State machine of a session

```
draft (in-memory)
  │ insert row
  ▼
planning ─────► error (planner failed)
  │
  │ plan saved
  ▼
streaming ────► error (streamer failed)
  │       └──► aborted (client disconnected)
  │
  │ done
  ▼
complete
```

Persisted on the row: `status` (`'streaming' | 'complete' | 'aborted' | 'error'`), `plan_outline` (JSON, present from `planning` onward), `picked_page_id`, `completed_at`.

---

## Where each piece of state lives

| State | Where | Lifetime |
|---|---|---|
| Session row | Postgres | forever |
| Plan JSON | Postgres (`walkthrough_sessions.plan_outline`) | forever |
| Step rows | Postgres (`walkthrough_steps`) | forever |
| In-flight LLM stream | Node process | only during request |
| SSE writer | Node process | only during request |
| Visitor's Step queue | Browser memory | only during widget session |

The DB has the durable record. Nothing in the LLM client state needs to survive a server restart — if the connection drops mid-stream, we lose the in-progress LLM call (cost: the partial completion). Phase 2 reconnection re-reads the persisted steps and resumes.

---

## Plan handoff: what the streamer gets

The planner persists the full Plan. The streamer doesn't re-fetch it — it gets the plan in-process as a typed object:

```ts
// walkthrough.service.ts
const plan = await planner.run(session, opts)
await emitSSE('plan', plan)

await streamer.run(session, plan, opts, emitSSE)
```

If the streamer dies and we retry, we re-read `walkthrough_sessions.plan_outline` and start the streamer fresh. The planner doesn't run twice for the same session.

---

## Branching pipeline

```
POST /v1/walkthroughs/run with resumeSessionId + branchAtStepId
      │
      ▼
walkthroughService.startBranch
  - read session row + played walkthrough_steps up to branchAtStepId
  - SSE emit 'session' (same sessionId)
      │
      ▼
planner.runBranch(session, playedSteps, branchQuery)
  - prompt includes original goal + plan + played-steps + branch query
  - returns a new Plan (branch_of: original_plan_id)
  - SSE emit 'plan'  (UI marks it as a branch)
      │
      ▼
streamer.run (as before) — appends new walkthrough_steps with continuing stream_index
      │
      ▼
done
```

Branching adds a `branchOf` field to Plan (see `03-plan-json-schema.md`); otherwise the schema is unchanged.

---

## Failure handling at the pipeline level

| Failure | Pipeline reaction |
|---|---|
| Planner Zod validation fails | Retry once with validator error appended to prompt. If still fails: `error` event, status `error`. |
| Planner returns `pickedPageId` not owned by agent | Hard fail. `error` event. |
| Streamer emits a step that fails schema | Drop that step, ask LLM to retry (single retry, in-band). If still bad, skip. |
| Streamer hits provider rate limit (OpenAI/Anthropic 429) | 429 surfaces as `error` event; session row gets retry hint. |
| Client disconnects | `streamSSE`'s aborted signal cancels the in-flight `messages.stream()`; session marked `aborted`. |
| Unhandled exception | Try/catch around each stage; SSE `error` emitted; rethrown to Hono so logs capture it. |

All recoverable failures append a JSON line to `walkthrough_sessions.error_message` for post-hoc analysis.

---

## Where the LLM clients live

Two provider implementations under `apps/api/src/services/llm/`. Both implement the same `LlmProvider` interface (see `04-llm-providers.md`):

- `langchain-openai.ts` — `ChatOpenAI` from `@langchain/openai`. Default for `gpt-4o-mini`, `gpt-4o`, `gpt-4.1`.
- `claude-sdk.ts` — `@anthropic-ai/sdk` direct. Used for `claude-sonnet-4-6`, `claude-opus-4-7`, `claude-haiku-4-5`. Direct access to `eager_input_streaming` for the streamer.

`pickProvider(agent.model)` returns the right instance. The service code never names a provider — it gets one back from the picker.

`agent.model` is allowlisted (3 OpenAI + 3 Anthropic ids in MVP). Validation runs at agent-create time so invalid values never reach `pickProvider`.

Adding a third provider (Gemini, OpenRouter, local) means adding a new file under `services/llm/` and one line in `pickProvider`. Callers don't change.
