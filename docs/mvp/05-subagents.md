# 05 — Sub-agents

> Three focused LLM calls. Each has tight inputs and one well-defined output:
> **Planner** returns a `Plan` (structured output, JSON), **Stepper** returns a `StepList` (structured output, JSON), **Narrator** streams a text body. None of them use LLM tool-calling — tool-calling is for LLM *choice* ("which one of these, or none"); these sub-agents have a single deterministic responsibility, so their output *is* the answer.
>
> The orchestrator (`04-workflow.md`) wires their results into the conversation via patch helpers (`06-patcher-and-wire.md`).

Folder: `apps/api/src/services/agent/subagents/`

---

## 1. Tool calls vs. structured output (the rule we follow)

| Pattern                                | When to use                                                                | Used by             |
|----------------------------------------|----------------------------------------------------------------------------|---------------------|
| `model.withStructuredOutput(schema)`   | The sub-agent has **one** answer with a known shape. No decisions about *what* to do. | planner, stepper    |
| `model.stream()`                       | The sub-agent writes prose; output is text deltas.                          | narrator            |
| `model.bindTools([t1, t2, ...])`       | The sub-agent must **choose** which tool (or none) to call, possibly multiple times. | — none in MVP        |

Forcing a tool call (`tool_choice: { name: "submit_plan" }`) for a sub-agent that only ever emits one thing is theatre — structured output is the same idea without the ceremony. We reserve `bindTools` for a future "decider" sub-agent (e.g., a supervisor that picks between `retry`, `replan`, `proceed`).

The host page's `call-tool` action inside steps is **not** an LLM tool call. It's a field in the Stepper's structured output that the **widget** executes at play time. The LLM doesn't call host tools directly.

---

## 2. `SubAgent` interface

```ts
// apps/api/src/services/agent/subagents/types.ts
import type { BaseChatModel } from "@langchain/core/language_models/chat_models"

export interface SubAgentDeps {
  model:  BaseChatModel
  signal: AbortSignal
}

export interface PromiseSubAgent<I, O> {
  name: string
  run(input: I, deps: SubAgentDeps): Promise<O>
}

export interface StreamingSubAgent<I> {
  name: string
  run(input: I, deps: SubAgentDeps): AsyncIterable<string>
}
```

Planner and Stepper implement `PromiseSubAgent`. Narrator implements `StreamingSubAgent`. Each lives in its own folder:

```
subagents/<name>/
├── run.ts        # the SubAgent implementation
├── prompt.ts     # composeSubAgentPrompt
├── schema.ts     # Zod schema (planner, stepper) — narrator omits this file
└── index.ts
```

---

## 3. PlannerSubAgent

Folder: `subagents/planner/`

### Job

Given the full agent context + visitor query, decide a 1-line goal, an optional one-line rationale, and 1–5 chapters. Each chapter targets one registered element.

### Input

```ts
interface PlannerInput { ctx: AgentContext; query: string }
```

### Output schema

```ts
// subagents/planner/schema.ts
import { z } from "zod"

export const PlanSchema = z.object({
  planGoal:      z.string().min(1).max(120).describe("One short sentence restating what the visitor needs."),
  planRationale: z.string().max(280).optional().describe("Optional one-line note explaining the chapter choice."),
  chapters: z.array(z.object({
    title:       z.string().min(1).max(40).describe("Short label, like a checklist item."),
    description: z.string().min(1).max(140).describe("One sentence summarising what happens at this step."),
    elementId:   z.string().min(1).max(64).describe("The DOM id of the target component."),
  })).min(1).max(5),
})

export type Plan = z.infer<typeof PlanSchema>
```

`.describe()` calls produce JSON-Schema descriptions visible to the model — they replace the need for prompt-level instructions about each field's meaning.

### Prompt sections used

From the section library in `03-prompts.md`:

- `rules` (weight 10)
- `customerOverlay` (weight 20)
- `pageContext` (weight 30)
- `elementsTree` (weight 40)
- `hostStateBlock` (weight 50)
- `hostToolsBlock` (weight 60)

Plus a planner-specific block appended at the end (no mention of "tools" or "calls" — the model is asked to return a `Plan`, period):

```text
You are the PLANNER sub-agent. Your single job: produce a 1–5 chapter plan
for a walkthrough on the page above.

Rules:
  - Each chapter MUST reference exactly one elementId from REGISTERED ELEMENTS.
  - Chapters are ordered as the visitor will experience them.
  - The chapter description is a single sentence.
  - Do NOT write steps, actions, or popover text. Other sub-agents do those.

If the question cannot be answered with a walkthrough on this page, return
one chapter targeting the page-root element with a description explaining
why it's out of scope.
```

### Run

```ts
// subagents/planner/run.ts
export function createPlannerSubAgent(): PromiseSubAgent<PlannerInput, Plan> {
  return {
    name: "planner",
    async run({ ctx, query }, { model, signal }) {
      const sys   = composePlannerPrompt(ctx)
      const typed = model.withStructuredOutput(PlanSchema, { name: "Plan" })
      return await typed.invoke(
        [new SystemMessage(sys), new HumanMessage(query)],
        { signal },
      )
    },
  }
}
```

Caller gets a `Plan`. No tool call layer, no parsing layer; LangChain validates the structured output against `PlanSchema` and throws on schema mismatch.

### Validation outside the schema

Schema enforces shape; the orchestrator enforces **semantics**:
- Each `chapters[].elementId` must exist in `ctx.elementById`. If not, that chapter is dropped on `addChapter` validation (`06-patcher-and-wire.md`).
- If 0 chapters survive validation, the run errors.

This split — structural validation in Zod, semantic validation in patch helpers — is the same pattern Phase 2 retrieval will fit into without reshuffling.

### Failure handling

| Failure                         | Behaviour                                                                                   |
|---------------------------------|---------------------------------------------------------------------------------------------|
| `OutputParserException`         | One retry with a clarification message added to the prompt; if still fails, run errors.     |
| Provider 429 / 5xx              | Exponential backoff, up to 3 attempts; if all fail, run errors with provider message.       |
| Schema validates but all elementIds unknown | All chapters dropped → run errors with "no valid chapters".                       |

---

## 4. StepperSubAgent

Folder: `subagents/stepper/`

### Job

Given one chapter + its focused element context, return the steps for that chapter: actions + popover meta. **No popover body** — Narrator writes that.

### Input

```ts
interface StepperInput {
  ctx:     AgentContext
  plan:    Pick<Plan, "planGoal" | "planRationale" | "chapters">    // for arc consistency
  chapter: WalkthroughChapter
  focused: ChapterContext                                            // 02-context.md
}
```

### Output schema

```ts
// subagents/stepper/schema.ts
import { z } from "zod"

const ActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("scroll-to"),      elementId: z.string() }),
  z.object({ type: z.literal("highlight"),      elementId: z.string() }),
  z.object({ type: z.literal("wait"),           ms: z.number().int().min(0).max(10_000) }),
  z.object({ type: z.literal("wait-for-click"), elementId: z.string(), timeoutMs: z.number().int().optional() }),
  z.object({ type: z.literal("call-tool"),      toolName: z.string(), args: z.record(z.unknown()) }),
])

export const StepListSchema = z.object({
  steps: z.array(z.object({
    actions: z.array(ActionSchema).min(1).max(8),
    popover: z.object({
      title:     z.string().max(60).optional(),
      elementId: z.string().optional().describe("Anchor element for the popover; defaults to viewport-center if absent."),
    }).optional(),
  })).min(1).max(4),
})

export type StepList = z.infer<typeof StepListSchema>
```

`popover.body` is deliberately absent from the schema. The stepper has no way to emit a body even if it tried — the type forbids it.

### Prompt sections used

- `rules` (weight 10)
- `customerOverlay` (weight 20)

Plus a stepper-specific block:

```text
You are the STEPPER sub-agent. Your single job: given ONE chapter from an
already-decided plan, return 1–4 steps for it.

Plan goal: "{plan.planGoal}"
Plan chapters (for arc context):
  1. "{plan.chapters[0].title}" — {plan.chapters[0].description}
  2. "{plan.chapters[1].title}" — {plan.chapters[1].description}
  ...

THIS chapter:
  title:       "{chapter.title}"
  description: "{chapter.description}"
  elementId:   "{chapter.elementId}"

Target element:
  id:          "{focused.target.id}"
  label:       "{focused.target.label}"
  description: "{focused.target.description}"
  notes:       "{focused.target.notes}"
  path:        {focused.parents.map(label).join(" > ")} > "{focused.target.label}"

Sibling elements:
  - id: "..." label: "..."
  ...

Action types you may emit:
  - scroll-to(elementId)
  - highlight(elementId)
  - wait(ms)
  - wait-for-click(elementId, timeoutMs?)
  - call-tool(toolName, args)              ← only if a host tool fits

Host tools available for this run:
  - {hostToolsBlock from 03-prompts.md}

Do NOT include popover.body — a separate sub-agent writes it.

Aim for clarity:
  - Most chapters open with scroll-to → highlight on the target.
  - Use wait-for-click when the visitor must actually do something.
  - 1–3 steps is typical; 4 is the max.
```

### Run

```ts
// subagents/stepper/run.ts
export function createStepperSubAgent(): PromiseSubAgent<StepperInput, StepList["steps"]> {
  return {
    name: "stepper",
    async run(input, { model, signal }) {
      const sys   = composeStepperPrompt(input)
      const typed = model.withStructuredOutput(StepListSchema, { name: "StepList" })
      const out   = await typed.invoke(
        [new SystemMessage(sys), new HumanMessage("Return the steps for this chapter.")],
        { signal },
      )
      return out.steps
    },
  }
}
```

### Failure handling

| Failure                                     | Behaviour                                                                          |
|---------------------------------------------|------------------------------------------------------------------------------------|
| `OutputParserException`                     | One retry with correction; if still fails, mark this chapter `skipped`, continue.  |
| Action references unknown `elementId`       | `appendAction` drops it. If all actions of a step drop, step is dropped. If all steps drop, chapter is `skipped`. |
| `call-tool` with unknown `toolName`         | Action dropped; same cascade.                                                      |
| All-empty step list                         | Chapter marked `skipped`, run continues.                                           |

A skipped chapter is wire-visible (`/chapters/N/stepIndex` stays at `-1`; the renderer shows a struck-through checklist row). Phase 2: add a `skipReason` on the chapter.

---

## 5. NarratorSubAgent

Folder: `subagents/narrator/`

### Job

Given one step (its actions, its anchor) inside one chapter, write a 1–3 sentence popover body. **Streams text content deltas**, no tool, no schema.

### Input

```ts
interface NarratorInput {
  ctx:     AgentContext
  chapter: WalkthroughChapter
  step:    WalkthroughStep            // actions populated, popover.body === ""
  focused: ChapterContext             // same focus the stepper saw
}
```

### Output

```ts
AsyncIterable<string>                  // each yielded string is a text chunk
```

The orchestrator (`streamBody` node) writes each chunk into `step.popover.body` via the `popoverChunk` patch helper, producing one wire frame per chunk.

### Prompt sections used

- `rules` (weight 10)
- `customerOverlay` (weight 20)

Plus a narrator-specific block:

```text
You are the NARRATOR sub-agent. Your single job: write the popover body for
ONE step.

Chapter: "{chapter.title}" — {chapter.description}

Target element:
  label:       "{focused.target.label}"
  description: "{focused.target.description}"

This step's actions (already decided, runs in order):
{step.actions.map(humanReadableActionLine).join("\n")}

Write 1–3 sentences. First sentence describes what's about to happen or
what the visitor will see. Be concrete. Don't number sentences. No JSON,
no markdown, no headings.

Output plain text only.
```

### Run

```ts
// subagents/narrator/run.ts
export function createNarratorSubAgent(): StreamingSubAgent<NarratorInput> {
  return {
    name: "narrator",
    async *run(input, { model, signal }): AsyncIterable<string> {
      const sys = composeNarratorPrompt(input)
      const stream = await model.stream(
        [new SystemMessage(sys), new HumanMessage("Write the popover body.")],
        { signal },
      )
      for await (const chunk of stream) {
        const text = typeof chunk.content === "string" ? chunk.content : ""
        if (text.length > 0) yield text
      }
    },
  }
}
```

### Failure handling

| Failure                                  | Behaviour                                                            |
|------------------------------------------|----------------------------------------------------------------------|
| Provider error mid-stream                | Catch in orchestrator; leave partial body; continue to next step.    |
| Empty output                             | Step stays with `popover.body === ""`; engine renders title only.    |

Narrator failures **do not error the run**. A walkthrough without a popover body is worse than one with one, but better than nothing.

### Why no tools, no schema

Free-text generation is what models do best. Forcing a tool or schema would add an emitted-token preamble before the model can start typing the body. Pure `model.stream()` over a tight prompt gets to the first body token fastest.

---

## 6. Prompt composers

```
subagents/planner/prompt.ts   composePlannerPrompt(ctx): string
subagents/stepper/prompt.ts   composeStepperPrompt(input): string
subagents/narrator/prompt.ts  composeNarratorPrompt(input): string
```

Each ~30 LOC. Each:
1. Picks the relevant sections from `prompts/sections/` (the library).
2. Calls `render(ctx)` on each, filters empties.
3. Joins with `\n\n---\n\n`.
4. Appends the sub-agent-specific instruction block.

The section library (`03-prompts.md`) is **unchanged**. Only the per-sub-agent assembly differs.

---

## 7. Model selection per sub-agent

```ts
// apps/api/src/services/agent/llm/pickModel.ts
export function pickModelForSubAgent(agent: AgentInfo, role: "planner" | "stepper" | "narrator"): BaseChatModel {
  // MVP: same model everywhere.
  // Phase 2: planner = strong, stepper = strong, narrator = cheap-and-fast.
  return pickModel(agent.model)
}
```

A natural Phase 2 split: `gpt-4o` for planner+stepper (reasoning), `gpt-4o-mini` for narrator (prose). Narrator is the dominant call volume per run, so cost savings compound.

---

## 8. Test strategy

- Each `prompt.ts` is a pure function → snapshot test the output for a canonical input.
- Each `schema.ts` → round-trip tests (valid examples parse; invalid examples reject).
- Each `run.ts` → mock `model` to return a canned `AIMessage` / a canned stream; assert returned shape.
- The orchestrator's nodes → mock sub-agents; assert the patch log against an expected sequence.

No end-to-end LLM test in CI. Nightly smoke against a real model is enough.

---

## 9. Module file list

```
subagents/
├── types.ts
├── planner/
│   ├── run.ts
│   ├── prompt.ts
│   ├── schema.ts
│   └── index.ts
├── stepper/
│   ├── run.ts
│   ├── prompt.ts
│   ├── schema.ts
│   └── index.ts
└── narrator/
    ├── run.ts
    ├── prompt.ts
    └── index.ts
```

Each `run.ts` < ~40 LOC. Each `prompt.ts` < ~50 LOC. Each `schema.ts` < ~40 LOC.

---

## 10. Why this gives us scalability

- **Add a sub-agent** (e.g., `ReplannerSubAgent` for when the visitor's question doesn't match any page) — one folder, registered as a new node in `04-workflow.md`. No changes elsewhere.
- **Swap a model for one sub-agent** — `pickModelForSubAgent` returns a different instance. No prompt change.
- **A/B test a prompt** — write `prompt-v2.ts` alongside `prompt.ts`, branch in `run.ts` on a flag. The schema and the orchestrator don't care.
- **Add a new action type** — extend `ActionSchema`, extend `WalkthroughAction` in `01-conversation-shape.md`. Stepper schema accepts it; engine learns to play it; orchestrator unchanged.

---

## 11. References

- `01-conversation-shape.md` — types each sub-agent's output is patched into.
- `02-context.md` — `AgentContext`, `focusChapter`, `ChapterContext`.
- `03-prompts.md` — the section library each composer draws from.
- `04-workflow.md` — the orchestrator that dispatches these sub-agents.
- `06-patcher-and-wire.md` — the helpers that translate sub-agent outputs into wire patches.
