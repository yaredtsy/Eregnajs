# 11.2 — Plan + Reasoning + Chapter shape

> The contract. Everything else (prompt, tool wiring, UI) follows from
> these shapes. The planner runs as **three LLM calls** inside one
> `runPlanner` function — reason, plan frame, chapters — each with a
> small, focused schema and its own prompt builder (chapter 03).

---

## Why three calls

A single call asking the model to fill *all* of reasoning + plan frame
+ 1–6 chapters is ~33 distinct decisions in one shot. The model rushes
past CoT to commit to chapters; the schema validator has a wide failure
surface; evals can't separate reasoning quality from chapter quality.

Splitting gives each call one job, *and* lets each call have:
- a focused prompt built for that task (chapter 03),
- a small schema with room to be detailed where it matters,
- its own retry/repair cycle without re-running the others.

```
   stage 1: REASON       stage 2: PLAN FRAME     stage 3: CHAPTERS
   ────────────────       ─────────────────────   ─────────────────
   understanding         planGoal                 chapters[1..6]
   knowledgeAnchors[]    planRationale?              title
   componentMapping      thought                     description
                                                    elementId
                                                    intent
                                                    expectedSteps

   detailed reasoning    short, decisive frame    enumerated commit
   prompt: "think        prompt: "state the       prompt: "given the
   about this goal       goal as one outcome"     goal and reasoning,
   and what we know"                              list ordered chapters"

   ~200-400 tokens out   ~80 tokens out           ~400 tokens out
   patcher writes        patcher writes           patcher writes
   reasoning → UI        goal + thought → UI      chapters → UI
```

Each stage shares the **same system prompt** (`PLANNER_SECTIONS`,
chapter 03). The human prompt per stage is unique.

---

## Stage 1 — `PlanReasoningSchema`

```ts
// apps/api/src/services/agent/subagents/planner/schema.ts
import { z } from "zod";

export const PlanReasoningSchema = z.object({
  understanding: z.string().min(20).describe(
    "Restate the visitor's goal in your own words, then briefly note " +
    "what they likely already know vs. what they'll need to learn. " +
    "Visible to the visitor in the reasoning disclosure — write it " +
    "for them, not for yourself. As detailed as the goal warrants.",
  ),
  knowledgeAnchors: z.array(z.string()).max(8).describe(
    "Titles of knowledge entries or hostKnowledge facts you relied on. " +
    "Use the exact titles from the Knowledge section. Empty array if " +
    "no facts applied.",
  ),
  componentMapping: z.string().min(20).describe(
    "Walk through which components on the page address this goal and " +
    "why those over the alternatives. Mention components you considered " +
    "and rejected if the choice was non-obvious. Visible to the visitor.",
  ),
});

export type PlanReasoningType = z.infer<typeof PlanReasoningSchema>;
```

No hard upper bound on `understanding` and `componentMapping` — the
disclosure UI handles long text natively (collapsed by default). The
prompt sets the *style* (chapter 03); the schema sets the *shape*.

`min(20)` exists to catch one-word answers, not to enforce length.

---

## Stage 2 — `PlanFrameSchema`

```ts
export const PlanFrameSchema = z.object({
  planGoal: z.string().min(1).max(120).describe(
    "One sentence goal of the entire walkthrough. Shown above the " +
    "checklist. Visitor-facing — concrete and outcome-oriented.",
  ),
  planRationale: z.string().max(280).optional().describe(
    "Optional: why this plan over alternatives. Omit when obvious.",
  ),
  thought: z.string().min(1).max(200).describe(
    "Short ticker line for the live UI — the 'what I'm about to do' " +
    "voice. Distinct from componentMapping (decision) and " +
    "understanding (restatement).",
  ),
});

export type PlanFrameType = z.infer<typeof PlanFrameSchema>;
```

Stage 2 *frames* — small schema, hard caps. The output is meant to be
crisp: one goal sentence, one ticker line. If the model wants to
elaborate it goes in `planRationale`.

---

## Stage 3 — `ChaptersSchema`

```ts
const ChapterIntent = z.enum(["show", "click", "fill", "compare"])
  .describe(
    "What the chapter accomplishes for the visitor. " +
    "'show' = spotlight only. 'click' = teach a click target. " +
    "'fill' = teach an input. 'compare' = juxtapose siblings.",
  );

export const PlanChapterSchema = z.object({
  title: z.string().min(1).max(60).describe(
    "Short chapter title shown in the checklist. Visible label, " +
    "not a key. Sentence case.",
  ),
  description: z.string().min(1).max(140).describe(
    "One sentence: what the visitor learns or does in this chapter.",
  ),
  elementId: z.string().describe(
    "Component key for the primary target — copied EXACTLY from the " +
    "component index above. Never invent.",
  ),
  intent: ChapterIntent,
  expectedSteps: z.number().int().min(1).max(5).describe(
    "Soft hint to the stepper: how many interactions this chapter " +
    "needs. 1 for spotlight-only, 2-3 for typical clicks, up to 5 " +
    "for multi-field forms.",
  ),
});

export const ChaptersSchema = z.object({
  chapters: z.array(PlanChapterSchema).min(1).max(6).describe(
    "Ordered chapters that fulfill planGoal. Shortest plan that " +
    "answers the goal wins.",
  ),
});
```

`expectedSteps` and `intent` are read by the stepper in phase 2.
Phase 1 just stores them on `WalkthroughChapter`.

---

## Runtime types (`subagents/types.ts`)

```ts
export interface PlanReasoning {
  understanding: string;
  knowledgeAnchors: string[];
  componentMapping: string;
}

export interface PlanFrame {
  planGoal: string;
  planRationale?: string;
  thought: string;
}

export interface PlanChapter {
  title: string;
  description: string;
  elementId: string;
  intent: "show" | "click" | "fill" | "compare";
  expectedSteps: number;
}

export interface Plan {
  reasoning: PlanReasoning;
  planGoal: string;
  planRationale?: string;
  thought: string;
  chapters: PlanChapter[];
}
```

`Plan` flattens the three stages into one return value. Downstream code
treats it as one object — the three-call shape is `runPlanner`'s
internal mechanic.

---

## Three-call flow inside `runPlanner`

```
   runPlanner(model, ctx, goal, { patcher, partIndex, ledger })
            │
            ▼
   ┌──────────────────────────────────────────────────────────┐
   │ Stage 1: reason                                          │
   │   messages = [                                           │
   │     SystemMessage(composeSystemPrompt(ctx, PLANNER_…)),  │
   │     HumanMessage(buildReasoningPrompt(ctx, goal)),       │
   │   ]                                                      │
   │   reasoning = await model                                │
   │     .withStructuredOutput(PlanReasoningSchema)           │
   │     .invoke(messages)                                    │
   └───────────────────────────┬──────────────────────────────┘
                               │  patcher.setWalkthroughReasoning(..., reasoning)
                               │  → widget renders ▶ Reasoning
                               ▼
   ┌──────────────────────────────────────────────────────────┐
   │ Stage 2: plan frame                                      │
   │   messages = [                                           │
   │     SystemMessage(composeSystemPrompt(ctx, PLANNER_…)),  │
   │     HumanMessage(buildReasoningPrompt(ctx, goal)),       │
   │     AIMessage(formatReasoningAsPrior(reasoning)),        │
   │     HumanMessage(buildFramePrompt(goal)),                │
   │   ]                                                      │
   │   frame = await model                                    │
   │     .withStructuredOutput(PlanFrameSchema)               │
   │     .invoke(messages)                                    │
   └───────────────────────────┬──────────────────────────────┘
                               │  patcher.setPlanGoal(..., frame.planGoal,
                               │                     frame.planRationale)
                               │  patcher.addThought(..., { phase:"plan",
                               │                            label: frame.thought })
                               │  → widget renders card title + ticker
                               ▼
   ┌──────────────────────────────────────────────────────────┐
   │ Stage 3: chapters                                        │
   │   messages = [                                           │
   │     SystemMessage(composeSystemPrompt(ctx, PLANNER_…)),  │
   │     HumanMessage(buildReasoningPrompt(ctx, goal)),       │
   │     AIMessage(formatReasoningAsPrior(reasoning)),        │
   │     AIMessage(formatFrameAsPrior(frame)),                │
   │     HumanMessage(buildChaptersPrompt(ctx, goal)),        │
   │   ]                                                      │
   │   { chapters } = await model                             │
   │     .withStructuredOutput(ChaptersSchema)                │
   │     .invoke(messages)                                    │
   │   chapters = filterInvalidChapters(chapters,             │
   │              validElementKeys(ctx))                       │
   └───────────────────────────┬──────────────────────────────┘
                               │  for each chapter: patcher.addChapter(...)
                               │  → widget renders checklist
                               ▼
                  return {
                    reasoning,
                    planGoal: frame.planGoal,
                    planRationale: frame.planRationale,
                    thought: frame.thought,
                    chapters,
                  } as Plan
```

The patcher writes are the seams that make the three-call shape visible
as progress — not a single freeze-frame "planning…" spinner. If a
later stage fails after an earlier write, the part stays at the last
good state; the orchestrator's closing turn explains the gap (chapter
04 covers the error surface).

---

## `WalkthroughPart` additions

`packages/walkthrough-core/src/walkthrough/types.ts`:

```ts
export type WalkthroughPart = {
  type: "walkthrough";
  walkthroughId: string;
  planGoal: string;
  planRationale?: string;
  status: WalkthroughStatus;
  reasoning?: PlanReasoning;          // ◄── NEW; written after stage 1
  chapters: WalkthroughChapter[];     // populated after stage 3
  steps: WalkthroughStep[];
  parentContext: WalkthroughPosition | null;
  thoughts?: Thought[];               // stage 2's `thought` lands here
  manifest?: ElementManifest;
};

export type WalkthroughChapter = {
  title: string;
  description: string;
  elementId: string;
  intent: "show" | "click" | "fill" | "compare";   // ◄── NEW
  expectedSteps: number;                            // ◄── NEW
  stepIndex: number;                                 // -1 until stepper runs
  status?: ChapterStatus;
};
```

`reasoning?` is optional at the type level so existing fixtures keep
typechecking. Runtime gates the disclosure on its presence.

Patcher gains two new helpers:

```ts
// apps/api/src/services/agent/patcher/helpers.ts
export function setWalkthroughReasoning(
  conv: Conversation,
  msgIndex: number,
  partIndex: number,
  reasoning: PlanReasoning,
): void;

export function setPlanGoal(
  conv: Conversation,
  msgIndex: number,
  partIndex: number,
  planGoal: string,
  planRationale?: string,
): void;
```

`addChapter` extends to accept `intent` + `expectedSteps`.

---

## Why this shape

```
   understanding       → catches misreads BEFORE goal commits;
                         can be detailed — disclosure handles length
   knowledgeAnchors    → ties answers to grounded facts, not vibes
   componentMapping    → catches wrong-element thinking at the reasoning layer;
                         walks through the options the model considered

   planGoal (frame)    → locks the destination once, in one sentence
   thought             → in-flight voice line; one per planning pass
   planRationale?      → only when the choice is non-obvious

   intent              → steers stepper without dictating actions
   expectedSteps       → budgets the stepper without locking it
```

Each field closes one failure mode. Add a field only when a new failure
mode appears in evals — don't pre-pessimize.

---

## Trust framing on visible CoT

The reasoning disclosure is visitor-visible. The planner prompt
enforces:

> *Write the reasoning fields for the visitor. Plain language; no
> internal keys, no JSON, no "the model thinks…", no apologies.*

Chapter 03 puts that line in `walkthroughRules` and echoes it inline
in `buildReasoningPrompt`.

---

## What stays unchanged

- `WalkthroughStatus` enum.
- `WalkthroughStep` (phase 2 will touch it; phase 1 doesn't write it).
- `Thought` shape — the ticker still uses it; stage 2's `thought` is
  one entry; stages 1 and 3 add system-phase tickers
  ("Thinking through your goal…", "Mapping out chapters…").
- `PlanGoal` semantics — one sentence above the checklist.
- The validator (`validatePlanKeys`, `filterInvalidChapters`,
  `sanitizeStepList`) — phase 1 adds `intent` + `expectedSteps` to
  the chapter row only.

---

## Cost / latency budget

| Stage | Out tokens (typical) | Wall-clock estimate (sonnet) |
|---|---|---|
| 1 — reason | 200–400 | 800–1200 ms |
| 2 — frame | 60–100 | 500–700 ms |
| 3 — chapters | 300–500 | 900–1400 ms |
| **Total** | **~700** | **2.2–3.3 s** |

vs. a single call (~33 fields, ~600 tokens, one structured-output
parse): 1.2–1.8 s wall-clock but worse reasoning quality and a single
freeze-frame UI.

The trade favors three calls because:
- The UI fills incrementally — visitor sees the disclosure and the
  card title before chapters arrive; *perceived* first-byte latency is
  the 800–1200 ms of stage 1.
- Each stage is testable in isolation.
- Re-planning one stage (chapter 04 covers retries) costs one call,
  not three.

---

## Cross-references

- `00-overview.md` — phase 1 picture
- `03-prompt-and-rules-split.md` — `buildReasoningPrompt`,
  `buildFramePrompt`, `buildChaptersPrompt` literal text + the
  rules-split that backs PLANNER_SECTIONS
- `04-orchestrator-wiring.md` — how the tool body invokes the three
  stages and writes the patcher between them
- `05-planner-ui.md` — disclosure UI for `reasoning`; checklist for
  `chapters`; ticker for `thought`
- `apps/api/src/services/agent/subagents/planner/schema.ts` — file to edit
- `apps/api/src/services/agent/subagents/planner/run.ts` — file to edit
  (three-stage flow)
- `packages/walkthrough-core/src/walkthrough/types.ts` — file to edit
