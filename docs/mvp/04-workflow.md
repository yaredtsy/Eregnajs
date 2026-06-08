# 04 — Workflow (LangGraph Orchestrator)

> The orchestrator. A LangGraph `StateGraph` that decides *which sub-agent runs next* and applies each sub-agent's output to the `Conversation` via patch helpers. **The orchestrator itself does not call an LLM.** Every LLM interaction is delegated to one of the three sub-agents in `05-subagents.md`.

Folder: `apps/api/src/services/agent/workflow/`

---

## 1. Role split

| Layer        | Does                                                                          | LLM call? |
|--------------|-------------------------------------------------------------------------------|-----------|
| Route        | HTTP, NDJSON stream open/close, request validation                            | no        |
| **Workflow** | dispatch sub-agents in a fixed order; apply outputs; loop chapters and steps  | **no**    |
| Sub-agents   | each: one focused LLM call with its own narrow prompt + minimal output surface | yes       |
| Patch helpers| imperative mutations on the in-memory `Conversation` mirror                   | no        |

Sub-agents don't import each other or the patch helpers. The workflow is the only place that knows the full picture.

---

## 2. State

```ts
// apps/api/src/services/agent/workflow/types.ts
import type { BaseMessage } from "@langchain/core/messages"
import type { Conversation, Message, WalkthroughPart, WalkthroughStep } from "@repo/walkthrough-core"
import type { AgentContext } from "../context/types"

export interface GraphState {
  ctx:                 AgentContext        // immutable for the run
  conversation:        Conversation        // observed by Patcher; mutated by helpers
  assistantMsg:        Message             // reference into conversation.messages[N]
  walkthrough:         WalkthroughPart | null
  currentChapterIndex: number              // 0-based
  currentStepIndex:    number              // 0-based within the current chapter's step span
}
```

The orchestrator does **not** accumulate a `history: BaseMessage[]` channel. Each sub-agent builds its own focused message list per call (see `05-subagents.md`). This is deliberate: the previous monolithic "agent with growing history" design encouraged long contexts; the sub-agent split makes each call's history scoped and short.

Channels for LangGraph:

```ts
const channels = {
  ctx:                 null,                 // set once
  conversation:        null,                 // reference; mutated in place
  assistantMsg:        null,                 // reference into conversation
  walkthrough:         null,                 // reference into assistantMsg.parts
  currentChapterIndex: null,                 // replace
  currentStepIndex:    null,                 // replace
} satisfies StateGraphArgs<GraphState>["channels"]
```

All channels use replace semantics. Mutations to nested fields on `conversation` happen in place — the patcher (`06-patcher-and-wire.md`) observes them.

---

## 3. Graph shape

```
                ┌──────────────┐
       START ──▶│   enrich     │   (no LLM — seed assistant message)
                └──────┬───────┘
                       ▼
                ┌──────────────┐
                │     plan     │   → PlannerSubAgent
                └──────┬───────┘
                       ▼
                ┌──────────────┐
                │ streamChapter│ ◀───────────┐  → StepperSubAgent (once per chapter)
                └──────┬───────┘             │
                       ▼                     │
                ┌──────────────┐             │
                │  streamBody  │ ◀──┐        │  → NarratorSubAgent (once per step)
                └──────┬───────┘    │        │
                       ▼            │        │
                ┌──────────────┐    │        │
                │  routeStep   │────┘        │
                └──────┬───────┘             │
                       ▼ (chapter done)      │
                ┌──────────────┐             │
                │ routeChapter │─────────────┘
                └──────┬───────┘
                       ▼ (all chapters done)
                ┌──────────────┐
                │   complete   │   (no LLM — flip statuses, save run)
                └──────┬───────┘
                       ▼
                      END
```

Edges:

| From            | To             | Kind         | Condition                                                   |
|-----------------|----------------|--------------|-------------------------------------------------------------|
| START           | `enrich`       | entry        | —                                                           |
| `enrich`        | `plan`         | direct       | —                                                           |
| `plan`          | `streamChapter`| direct       | (`currentChapterIndex` initialised to 0 by `plan`)          |
| `streamChapter` | `streamBody`   | direct       | (after stepper returns, `currentStepIndex` reset to 0)      |
| `streamBody`    | `routeStep`    | direct       | —                                                           |
| `routeStep`     | `streamBody`   | conditional  | `currentStepIndex + 1 < steps_in_chapter`                   |
| `routeStep`     | `routeChapter` | conditional  | else                                                        |
| `routeChapter`  | `streamChapter`| conditional  | `currentChapterIndex + 1 < walkthrough.chapters.length`     |
| `routeChapter`  | `complete`     | conditional  | else                                                        |
| `complete`      | END            | direct       | —                                                           |

`routeStep` and `routeChapter` are pure functions; they don't appear as graph nodes but as conditional-edge functions in the LangGraph API.

---

## 4. Graph factory

```ts
// apps/api/src/services/agent/workflow/graph.ts
import { StateGraph, START, END } from "@langchain/langgraph"

export interface WorkflowDeps {
  planner:    PlannerSubAgent
  stepper:    StepperSubAgent
  narrator:   NarratorSubAgent
  patcher:    Patcher
  helpers:    PatchHelpers
}

export function createWorkflow(deps: WorkflowDeps) {
  return new StateGraph<GraphState>({ channels })
    .addNode("enrich",        makeEnrich(deps))
    .addNode("plan",          makePlan(deps))
    .addNode("streamChapter", makeStreamChapter(deps))
    .addNode("streamBody",    makeStreamBody(deps))
    .addNode("complete",      makeComplete(deps))
    .addEdge(START, "enrich")
    .addEdge("enrich", "plan")
    .addEdge("plan", "streamChapter")
    .addEdge("streamChapter", "streamBody")
    .addConditionalEdges("streamBody",   routeStep,    { next: "streamBody",    done: "routeChapter" })
    .addConditionalEdges("routeChapter", routeChapter, { next: "streamChapter", done: "complete" })
    .addEdge("complete", END)
    .compile()
}

function routeStep(state: GraphState): "next" | "done" {
  const chapter = state.walkthrough!.chapters[state.currentChapterIndex]
  const stepsInChapter = countStepsInChapter(state.walkthrough!, chapter)
  return state.currentStepIndex + 1 < stepsInChapter ? "next" : "done"
}

function routeChapter(state: GraphState): "next" | "done" {
  return state.currentChapterIndex + 1 < state.walkthrough!.chapters.length ? "next" : "done"
}
```

Note: `routeChapter` is a pure conditional function tied to its outgoing edges; "routeChapter" is the label LangGraph attaches, not a separate node. Implementation detail of LangGraph; the diagram in §3 shows it as a box for clarity.

---

## 5. Nodes

Each node is a thin function that:
1. invokes its sub-agent,
2. applies the result via patch helpers,
3. updates counters and references in the state.

### 5.1 `nodes/enrich.ts`

No LLM. Seeds an empty assistant message in the conversation so the widget immediately renders a "..." bubble.

```ts
export function makeEnrich({ helpers }: WorkflowDeps): GraphNode {
  return async (state) => {
    const msg = helpers.appendAssistantMessage(state.conversation)
    return { assistantMsg: msg }
  }
}
```

### 5.2 `nodes/plan.ts`

Calls `planner.run`. Receives the full plan. Patches `start_walkthrough` then one `add_chapter` per chapter.

```ts
export function makePlan({ planner, helpers, patcher }: WorkflowDeps): GraphNode {
  return async (state) => {
    const plan = await planner.run({
      ctx:   state.ctx,
      query: state.ctx.userQuery,
    })

    const wt = helpers.startWalkthrough(state.assistantMsg, {
      planGoal:      plan.planGoal,
      planRationale: plan.planRationale,
    })
    await patcher.emit()                 // visible: walkthrough part appears with status=planning

    for (const c of plan.chapters) {
      helpers.addChapter(wt, c)
      await patcher.emit()               // visible: chapter row materialises in the checklist
    }

    helpers.setWalkthroughStatus(wt, "playing")
    await patcher.emit()

    return { walkthrough: wt, currentChapterIndex: 0 }
  }
}
```

Why we emit per chapter rather than batching: the checklist UI should fill row-by-row, not all at once. Frames are cheap; the perceived UX gain is real.

### 5.3 `nodes/streamChapter.ts`

Calls `stepper.run` for one chapter. Receives the chapter's step skeletons (actions + popover meta, no body). Patches `open_step` + `append_action` per step.

```ts
export function makeStreamChapter({ stepper, helpers, patcher }: WorkflowDeps): GraphNode {
  return async (state) => {
    const wt = state.walkthrough!
    const idx = state.currentChapterIndex
    const chapter = wt.chapters[idx]

    const focused = focusChapter(state.ctx, chapter)
    const skeletons = await stepper.run({
      ctx: state.ctx,
      plan: { planGoal: wt.planGoal, planRationale: wt.planRationale, chapters: wt.chapters },
      chapter, focused,
    })

    for (let i = 0; i < skeletons.length; i++) {
      const step = helpers.openStep(wt, idx, skeletons[i].popover)
      if (i === 0) helpers.setChapterStepIndex(wt, idx, wt.steps.length - 1)
      await patcher.emit()

      for (const action of skeletons[i].actions) {
        helpers.appendAction(step, action)
        await patcher.emit()
      }
    }

    return { currentStepIndex: 0 }
  }
}
```

### 5.4 `nodes/streamBody.ts`

Calls `narrator.run` for one step. Streams content deltas. Per delta, patches a `popover_chunk` (string-append) onto that step's `popover.body`.

```ts
export function makeStreamBody({ narrator, helpers, patcher }: WorkflowDeps): GraphNode {
  return async (state) => {
    const wt = state.walkthrough!
    const chapter = wt.chapters[state.currentChapterIndex]
    const step = stepOfChapter(wt, chapter, state.currentStepIndex)

    if (!step.popover) {
      // step has no popover — nothing to narrate
      return { currentStepIndex: state.currentStepIndex }
    }

    const stream = narrator.run({
      ctx: state.ctx,
      chapter,
      step,
      focused: focusChapter(state.ctx, chapter),
    })

    for await (const chunk of stream) {
      helpers.popoverChunk(step, chunk)
      await patcher.emit()                      // each delta becomes one wire frame
    }

    return { currentStepIndex: state.currentStepIndex + 1 }
  }
}
```

`stream` here is an async iterable of strings — the narrator returns text-content deltas directly (see `05-subagents.md` §3 for the exact shape).

### 5.5 `nodes/complete.ts`

No LLM. Flips statuses, saves the run.

```ts
export function makeComplete({ helpers, patcher }: WorkflowDeps): GraphNode {
  return async (state) => {
    helpers.setWalkthroughStatus(state.walkthrough!, "complete")
    helpers.setMessageStatus(state.assistantMsg, "complete")
    await patcher.emit()
    return {}
  }
}
```

Persistence is `runs.save` called by `apps/api/src/services/agent/run.ts` after `graph.invoke` resolves (so the orchestrator stays pure about persistence). See `09-persistence.md`.

---

## 6. Run entry point — `apps/api/src/services/agent/run.ts`

The route handler calls this. It wires deps and invokes the graph.

```ts
export async function run(opts: RunOpts, emit: EmitFrame, signal: AbortSignal) {
  const ctx = await composeContext(opts, { db, logger })

  const planner  = createPlannerSubAgent({ model: pickModel(ctx.agent.model), signal })
  const stepper  = createStepperSubAgent({ model: pickModel(ctx.agent.model), signal })
  const narrator = createNarratorSubAgent({ model: pickModel(ctx.agent.model), signal })

  const conversation = createInitialConversation(opts, ctx)
  const patcher = createPatcher(conversation, emit)
  const helpers = createPatchHelpers()

  const graph = createWorkflow({ planner, stepper, narrator, patcher, helpers })

  try {
    await graph.invoke({
      ctx,
      conversation,
      assistantMsg: null as any,       // populated by enrich
      walkthrough: null,
      currentChapterIndex: 0,
      currentStepIndex: 0,
    }, { signal })

    await runs.save({ status: "complete", conversation, patchLog: patcher.getLog(), opts })
  } catch (err) {
    helpers.failWalkthrough(conversation, errorMessage(err))
    await patcher.emit()
    await runs.save({ status: signal.aborted ? "aborted" : "error", conversation, patchLog: patcher.getLog(), opts, errorMessage: errorMessage(err) })
    throw err
  }
}
```

The route handler closes the NDJSON stream when `run()` resolves or rejects.

---

## 7. Why sub-agents instead of one agent with a registry of tools

| Concern                                              | Monolithic agent w/ tools         | Sub-agent split (this design)               |
|------------------------------------------------------|-----------------------------------|---------------------------------------------|
| Prompt size                                          | one big prompt + element tree + plan + history grows | each sub-agent's prompt is scoped to its job |
| Tool surface to the model                            | 7+ tools (start_walkthrough, add_chapter, open_step, append_action, popover_chunk, finish_chapter, complete_walkthrough) at once | each sub-agent sees 0 or 1 forced tool       |
| Wire complexity                                      | streamRouter peeking partial JSON args for popover body | orchestrator iterates returned arrays; one helper call per patch |
| Replaceability                                       | hard — change one behaviour, regression risk on others | swap one sub-agent's prompt/model/schema in isolation |
| Cost                                                 | fewer LLM calls but larger context per call | more LLM calls, smaller contexts; net often cheaper at scale |
| Quality                                              | model has to juggle plan + step + narration in one stream | each sub-agent has one job |

The bet: **scoped LLM calls produce better outputs**, and the orchestrator's job is to compose those outputs, not to give the LLM a giant toolbox.

---

## 8. Failure modes

| Failure                                                                  | Behaviour                                                                                                                |
|--------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------|
| Planner returns 0 chapters or > 5                                        | Run errors before any patch is emitted; status=error, error message patched on assistant message, run row written.       |
| Planner cites an unknown elementId                                       | `addChapter` validator rejects; the validation error is shown to the planner via one retry (same prompt + correction). If still fails, that chapter is dropped (others proceed). |
| Stepper returns step targeting unknown elementId                         | Step is dropped from the chapter; if all steps drop, the chapter is marked `skipped` in the patches and `streamBody` skips it. |
| Stepper schema fails                                                     | One retry with validation error included. If still fails, chapter is marked `skipped`.                                    |
| Narrator stream errors                                                   | Skip the body for that step (it remains empty); continue.                                                                 |
| `model.stream` provider 429                                              | Wait one beat then retry with exponential backoff (3 attempts); if all fail, fail the run with provider error.            |
| Client disconnect (`signal.aborted`)                                     | LangGraph cancellation propagates; in-flight LLM call cancels; `run()`'s catch block writes status=aborted.               |

All failures flow through one try/catch in `run.ts`. Sub-agents throw typed errors; the workflow doesn't catch them; the run wrapper translates to patches and persistence.

---

## 9. Why no shared history

The earlier draft accumulated all LLM messages in a `history` channel and passed them to every node. With sub-agents, each call builds its own short message list:

- Planner: `[system, human(query)]` — that's it.
- Stepper: `[system, human(chapter prompt with plan summary)]`.
- Narrator: `[system, human(step prompt with chapter + actions)]`.

Plan, chapter, and step summaries are passed *as input*, not as accumulated history. This:
- keeps each call's context predictable in size,
- prevents prompt-injection cross-talk between sub-agents,
- makes per-sub-agent prompts independently snapshot-testable.

Phase 2 — if multi-turn within a session is added — the `conversationHistory` provider (`02-context.md`) supplies prior turns *only* to the planner (because it's the only sub-agent that needs to know "what did we talk about already"). Stepper and narrator stay scoped.

---

## 10. Module file list

```
workflow/
├── types.ts                # GraphState, GraphNode, WorkflowDeps
├── graph.ts                # createWorkflow + routeStep + routeChapter
├── nodes/
│   ├── enrich.ts
│   ├── plan.ts
│   ├── streamChapter.ts
│   ├── streamBody.ts
│   └── complete.ts
├── util/
│   ├── stepOfChapter.ts
│   └── countStepsInChapter.ts
└── index.ts
```

`graph.ts` < ~60 LOC. Each `nodes/*.ts` < ~60 LOC. Util helpers < ~25 LOC.

---

## 11. References

- `01-conversation-shape.md` — types the state references.
- `02-context.md` — `composeContext`, `focusChapter`.
- `03-prompts.md` — section library used by each sub-agent's prompt composer.
- `05-subagents.md` — the three sub-agents themselves.
- `06-patcher-and-wire.md` — `Patcher`, `PatchHelpers`, wire format.
- `09-persistence.md` — `runs.save`.
