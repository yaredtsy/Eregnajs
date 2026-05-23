# agent/03 — Plan JSON Schema

The Plan is the **iteration surface**. It's the artifact we tweak, log, diff, replay, and feed into evals. Keep it strict, keep it small, and bump its `version` when shape changes.

This is a separate doc (not buried inside the planner code) precisely so the schema is easy to find when you want to add a field.

---

## Plan, top level

```ts
import { z } from 'zod'

export const PlanSchema = z.object({
  version: z.literal(1),

  // ─── Where ─────────────────────────────────────────────────
  pickedPageId: z.string().uuid(),       // must be a page owned by the agent

  // ─── Why ──────────────────────────────────────────────────
  goal: z.string().min(4).max(200),      // restated intent in agent's voice
  rationale: z.string().min(4).max(300), // one sentence: why this page, this approach

  // ─── What ─────────────────────────────────────────────────
  steps: z.array(PlanStepSchema).min(1).max(8),

  // ─── Branch metadata (optional) ───────────────────────────
  branchOf: BranchInfoSchema.optional(),

  // ─── Reserved for evals / iteration ───────────────────────
  notes: z.string().max(500).optional(), // free-form. Never shown to visitor.
})

export type Plan = z.infer<typeof PlanSchema>
```

### `PlanStep` — outline level, not playback level

A `PlanStep` is what the planner outlines. The streamer later renders each `PlanStep` into one or more **engine** `Step` objects (the things the queue receives).

```ts
export const PlanStepSchema = z.object({
  id: z.string().regex(/^p\d{2}$/),                // 'p01', 'p02', ...
  title: z.string().min(2).max(40),                // shown in the player's progress skeleton
  intent: PlanStepIntentSchema,                    // what kind of step (discriminated)
  elementRefs: z.array(z.string().uuid()).max(4),  // elementIds the streamer should center on
  hint: z.string().max(160).optional(),            // optional cue for the streamer
})

export const PlanStepIntentSchema = z.enum([
  'orient',          // pan/scroll to a region; no action expected
  'explain',         // highlight + popover narration; no click required
  'demonstrate',     // highlight + wait-for-click on a CTA
  'compare',         // sequentially highlight 2-3 sibling elements
  'recap',           // closing summary popover, no element focus
])
```

`PlanStepIntentSchema` is intentionally small. Five intents cover ~all walkthroughs we expect in Phase 1. Adding an intent is an opinionated change — bump `version`.

### `BranchInfo`

```ts
export const BranchInfoSchema = z.object({
  parentSessionId: z.string().uuid(),
  branchAtStepId: z.string(),                      // engine Step id of the pause point
  visitorFollowup: z.string().min(2).max(400),     // verbatim user question
})
```

Branch plans look like a fresh plan with `branchOf` populated. The streamer knows it's a branch from this field and adjusts (see prompts).

---

## Example Plan JSON

```json
{
  "version": 1,
  "pickedPageId": "1f4e0b9a-3b88-4f8c-9f1a-2c0e7a51a111",
  "goal": "Show the visitor how to start a Pro subscription",
  "rationale": "Visitor asked about subscribing to Pro; the Pricing page contains the Pro card with a direct CTA.",
  "steps": [
    {
      "id": "p01",
      "title": "Find the Pro card",
      "intent": "orient",
      "elementRefs": ["el_pro_card"]
    },
    {
      "id": "p02",
      "title": "Explain what Pro includes",
      "intent": "explain",
      "elementRefs": ["el_pro_card", "el_pro_features"],
      "hint": "Mention monthly price and the included support tier"
    },
    {
      "id": "p03",
      "title": "Click Subscribe to continue",
      "intent": "demonstrate",
      "elementRefs": ["el_pro_subscribe"]
    }
  ]
}
```

A branch Plan would include `branchOf` and likely a tighter step list:

```json
{
  "version": 1,
  "pickedPageId": "1f4e...",
  "goal": "Clarify what Team tier means before the visitor decides",
  "rationale": "Visitor paused at Subscribe and asked about Team; comparison clarifies before they commit.",
  "branchOf": {
    "parentSessionId": "sess_01H...",
    "branchAtStepId": "step_02",
    "visitorFollowup": "wait, what does 'team' tier mean?"
  },
  "steps": [
    { "id": "p01", "title": "Highlight the Team card", "intent": "compare",
      "elementRefs": ["el_team_card", "el_pro_card"] },
    { "id": "p02", "title": "Recap differences",      "intent": "recap",
      "elementRefs": [] }
  ]
}
```

---

## How the planner produces a Plan

LangChain's structured-output mode binds the Zod schema to the model in one shot:

```ts
// services/planner.service.ts (excerpt)
import { PlanSchema } from './schemas/plan.schema'

const llm = makeChat(agent.model, { temperature: 0.2 })
const structured = llm.withStructuredOutput(PlanSchema, { name: 'save_plan' })

const plan: Plan = await structured.invoke([
  { role: 'system', content: SYSTEM_PROMPT },
  { role: 'user',   content: userPrompt(query, pageUrl, pageCatalog) },
])
```

Behind the scenes, LangChain registers a tool `save_plan` with the Plan JSON schema and uses OpenAI's strict mode (`strict: true`) to force the model to return a single, schema-conformant tool call. The Zod parse confirms it on our side too.

If the parse fails (rare with strict mode), we retry once with the validator error appended:

```ts
const retry = await structured.invoke([
  ...,
  { role: 'user', content: 'Your last response failed validation: ' + error.message + '\nRespond again, satisfying the schema.' },
])
```

Two retries total before surfacing as `error`.

---

## How the streamer reads a Plan

The streamer is given the full Plan in its system prompt (serialized as JSON inside a fenced block). It walks the `steps[]` array in order. For each `PlanStep`:

1. It produces **one or more** engine `Step` objects via `emit_step` tool calls.
2. It uses `elementRefs` as the candidate elements for `selector` fields.
3. It picks engine actions matching the `intent`:

| Plan intent | Typical engine actions |
|---|---|
| `orient` | `scroll-to` on the first elementRef; optional popover |
| `explain` | `scroll-to` → `highlight-element` → popover (typewritten body) |
| `demonstrate` | `scroll-to` → `highlight-element` → `wait-for-click` |
| `compare` | `highlight-element` (subtle) → popover → `highlight-element` (next) → popover |
| `recap` | popover anchored to viewport-center, no highlight |

This mapping is **suggestion in the prompt, not enforcement in code**. The streamer is free to deviate when it makes sense, but the prompt nudges it toward these patterns so playback feels consistent.

---

## Schema versioning

The schema lives in `apps/api/src/services/schemas/plan.schema.ts` and is exported with `version: z.literal(N)`. Bumping rules:

| Change kind | Bump? | What else to do |
|---|---|---|
| Add an optional field | no | Old plans still parse; new field defaults to `undefined`. |
| Add a required field | yes (v+1) | Provide a migrator from old plans to new (for replay). |
| Remove a field | yes | Migrator deletes the field. |
| Rename a field | yes | Migrator renames. |
| Add a value to an enum (e.g. new intent) | yes | Old plans still valid; new code must handle the new value. |

The migrator lives next to the schema:

```ts
// schemas/plan.schema.ts
export function migratePlan(stored: unknown): Plan {
  const obj = stored as { version: number }
  if (obj.version === 1) return PlanSchema.parse(obj)
  // future: if (obj.version === 1) return PlanSchema.parse(v1_to_v2(obj))
  throw new Error(`Unknown plan version: ${obj.version}`)
}
```

Replay always goes through `migratePlan` before feeding to the streamer.

---

## What lives in the Plan, what doesn't

| In the Plan | Why |
|---|---|
| Page selection | Commits the planner before the streamer runs. |
| Step titles | Visible in the player's progress skeleton. |
| Step intent + elementRefs | Guides the streamer; iterable independently of prompts. |
| Goal + rationale | Eval signal: did the agent understand the question? |
| Branch metadata | Lets us trace branches in `walkthrough_sessions`. |

| NOT in the Plan | Why |
|---|---|
| Engine `Action` details (selectors, durations, popover text) | Streamer's job. Plan is intent, not playback. |
| Visitor info (visitorId, IP) | Privacy; the LLM doesn't need it. |
| Agent's `system_prompt` overlay | That's a prompt input, not a plan field. |
| Token usage, latency | Telemetry; goes on the session row, not the plan. |

The separation matters: the Plan is **what we want to happen**, not **how it looks on the page**. The streamer translates intent → actions. Iterating the planner is "did it pick right?"; iterating the streamer is "did it look good?".

---

## Quick checklist when changing the schema

1. Update `PlanSchema` in `plan.schema.ts`. Bump `version` if not purely additive.
2. Update `migratePlan` if old stored plans exist.
3. Update the planner prompt in `05-prompts.md` if the new field changes what to ask the LLM for.
4. Update the streamer prompt if it should consume the new field.
5. Add a fixture in `apps/api/test/fixtures/plans/` exercising the new shape.
6. Run the eval rig (`07-iteration-workflow.md`) over your fixtures.
