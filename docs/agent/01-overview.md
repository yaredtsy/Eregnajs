# agent/01 — Overview

Start here. Read top-to-bottom: each subsequent doc is one layer more specific.

```
01-overview.md            ← what the agent is, IO contract                      (general)
02-pipeline.md            ← planner → streamer → engine flow
03-plan-json-schema.md    ← the JSON plan schema, the iteration surface
04-llm-providers.md       ← code-level: LangChain+OpenAI and Claude SDK behind one interface
05-prompts.md             ← exact planner + streamer prompts
06-context-strategy.md    ← what data we feed into prompts
07-iteration-workflow.md  ← how we evolve the agent without breaking playback   (specific)
```

---

## What the agent does

The agent is a server-side service in `apps/api/src/services/`. It is invoked by `POST /v1/walkthroughs/run` and produces, over SSE:

1. A **plan** — a JSON document describing the walkthrough's intent and outline. Emitted **once**, fully, before any step.
2. A **stream of steps** — `Step` objects (`engine/01-action-schema.md`) emitted one by one as the model produces them.

The plan is the iteration surface. It's the artifact we'll tweak, log, replay, A/B test, and feed into evals. Keeping it strictly JSON (not free-form text) means:

- We can validate it with a schema.
- We can persist it untouched in `walkthrough_sessions.plan_outline` and diff plans over time.
- We can re-run a session with a stored plan and a different streamer to compare quality.
- We can manually edit a plan in a test fixture and replay it through the streamer.

---

## LLM providers

We support **two** providers behind a single `LlmProvider` interface (`04-llm-providers.md`):

- **LangChain + OpenAI** (`@langchain/openai`) — default. `withStructuredOutput(PlanSchema)` for the planner; `bindTools([emitStep], { tool_choice: 'required' })` + `model.stream(...)` for the streamer. Idiomatic, low-friction.
- **Claude Agent SDK** (`@anthropic-ai/sdk`) — direct. `messages.create(...)` with `tool_choice: { type: 'tool', name: 'save_plan' }` for the planner; `messages.stream(...)` with `eager_input_streaming: true` on `emit_step` for the streamer. Native access to fine-grained tool streaming.

Choice is per-agent (`agent.model`). The dashboard surfaces a picker; service code calls `pickProvider(model)` and uses the same interface regardless. Prompts, schemas, and SSE protocol are identical across providers.

We do **not** use LangGraph. The agent loop here is short (two stages, optional branch), and a manual loop is clearer than a graph.

---

## IO contract

### Input (HTTP body)

```ts
{
  publicId:        string         // identifies the agent
  query:           string         // the visitor's question
  pageUrl:         string         // their current URL
  visitorId?:      string         // opaque
  resumeSessionId?: string        // present on branches
  branchAtStepId?:  string        // present on branches
}
```

### Output (SSE event stream)

| Event | Payload | Emitted by |
|---|---|---|
| `session` | `{ id, pickedPageId? }` | walkthrough service (before agent runs) |
| `plan` | full Plan JSON (see `03-plan-json-schema.md`) | planner stage |
| `step` | a `Step` object | streamer stage, once per tool call |
| `narration_chunk` | `{ stepId, charDelta }` | streamer (Phase 2 polish) |
| `done` | `{}` | streamer when finished |
| `error` | `{ message }` | either stage on failure |

Plan is exactly **one** `plan` event. Steps are many. `done` is exactly one.

---

## Non-goals for the agent in MVP

- **No multi-turn dialogue inside a session.** Branching is "new session, with context"; not "agent and visitor chat for 5 turns and then the engine plays". Pause+chat is structured: visitor's query becomes a new branch plan.
- **No tool use beyond `save_plan` / `emit_step`.** Planner binds one tool that returns the Plan JSON; streamer binds one tool, `emit_step`, called once per step. No DB lookups, no web fetches, no calculator. Everything the agent needs is in the prompt.
- **No multi-page walkthroughs.** Planner picks one page, period. `navigate` action exists in the schema but is rejected by the executor in MVP.
- **No autonomous interaction.** Agent points; visitor clicks. `simulate-click` and `fill-input` exist for Phase 2; the streamer is prompted to never emit them.
- **Limited provider set.** Two providers in MVP (OpenAI via LangChain, Anthropic via Claude SDK). Adding Gemini or OpenRouter is a new file under `services/llm/` and one line in `pickProvider` — left for Phase 2.

---

## Why two stages (planner + streamer)

Single-call generation of a structured walkthrough tends to:

- Begin emitting step 1 before deciding on a coherent arc.
- Stall briefly while the model "thinks out loud".
- Mid-stream revisions: step 2 contradicts step 1 because the model just realized something.

Splitting forces commitment before execution:

```
planner   ── fast, non-streaming ──► JSON Plan (committed)
                                          │
                                          ▼
streamer  ── streaming tool calls ──► Step, Step, Step, ...
```

The planner is a single LLM call that **must** return a Plan (via a structured-output tool). The streamer is a single streaming LLM call that renders the Plan into `Step` objects via repeated `emit_step` tool calls, so the wire is live as each step finalizes.

The flip side is a second LLM call (latency, cost). Acceptable for now — planner runs in ~1–2 seconds and unblocks the visible "plan" event before the streamer starts. End-to-end TTFB is still under 3s for typical queries.

---

## What "agent building plan" means in this folder

Each doc answers a different scope of question:

| Doc | Answers |
|---|---|
| `02-pipeline.md` | How do planner and streamer connect, what state lives where, how is the SSE driven? |
| `03-plan-json-schema.md` | What's the shape of a Plan? How do I add a field? How is it versioned? |
| `04-llm-providers.md` | The `LlmProvider` interface plus the LangChain+OpenAI and Claude SDK implementations. How tools are defined; how streaming is consumed; how a provider is chosen per agent. |
| `05-prompts.md` | Word-for-word system + user prompts for each stage. What we tell the model. |
| `06-context-strategy.md` | What page/element data goes into the prompt. MVP = full tree; Phase 2 = retrieval. |
| `07-iteration-workflow.md` | How do we change a prompt or schema without breaking running sessions? Eval rig? |

You can build the agent in that order — pipeline → schema → provider wiring → prompts → context — and have a working planner+streamer by the end.
