# Fix 04 — OpenAI strict structured-output rejects `.optional()`

> Stage 2 of the planner (`PlanFrameSchema`) throws the moment it's
> handed to `withStructuredOutput` because `planRationale` uses
> `.optional()` without `.nullable()`. OpenAI's strict structured-
> output mode requires **every** property to be in `required[]` —
> there's no way to mark a field as "may be omitted". The escape
> hatch is `.nullable()`: the field is always present in the JSON
> output, but its value can be `null` when the model has nothing to
> say. This applies to every subagent schema we add (planner, stepper,
> narrator) — `.optional()` is permanently off the table.

---

## Symptom (from the diagnostic log)

After fixes 01 + 03 landed and stage 1 began succeeding, stage 2
started throwing immediately. The per-stage try/catch added during
diagnosis surfaced the exact error:

```
[planner] stage 2 (frame) threw:
  error: Zod field at `#/definitions/extract/properties/planRationale`
  uses `.optional()` without `.nullable()` which is not supported by
  the API. See: https://platform.openai.com/docs/guides/structured-
  outputs?api-mode=responses#all-fields-must-be-required
    at zodToJsonSchema (openai/_vendor/zod-to-json-schema/parsers/object.mjs:38:27)
    at zodResponseFormat (openai/helpers/zod.mjs:67:73)
    at invocationParams (@langchain/openai/chat_models/completions.js:43:26)
    …

[start_walkthrough] runPlanner threw: <same error>
```

The throw originates *before* the HTTP call to OpenAI. The
`openai` SDK's Zod → JSON-Schema converter inspects the schema, sees
an `.optional()` field whose Zod definition isn't also `.nullable()`,
and refuses to translate it. The model is never called; the patcher
sees no stage-2 writes; the tool body's catch flips `status: error`.

---

## Root cause

### What OpenAI strict mode demands

From the linked docs:

> *All fields must be required. To denote optional fields, use a union
> type with null.*

The strict structured-output endpoint (`response_format:
{ type: "json_schema", strict: true }`) accepts JSON Schemas where:
- Every property appears in `required[]`.
- "Absence" is expressed as a nullable union (`{ type: ["string", "null"] }`),
  not as a missing required entry.

This is a hard wall, not a soft preference. The `openai` SDK enforces
it at schema-translation time precisely so we get a clear error
instead of a runtime 400 from the API.

### How our schema triggered it

`apps/api/src/services/agent/subagents/planner/schema.ts`:

```ts
export const PlanFrameSchema = z.object({
  planGoal: z.string().min(1).max(120),
  planRationale: z.string().max(280).optional(),   // ◄── trips strict mode
  thought: z.string().min(1).max(200),
});
```

`.optional()` in Zod means "this property may be missing from the
object." The JSON Schema converter would naturally translate this by
*omitting* the property from `required[]` — but strict mode forbids
that.

`PlanReasoningSchema` and `ChaptersSchema` had no `.optional()` fields,
which is why stage 1 and stage 3 (when reached) ran cleanly.

### Why this is a permanent constraint, not a one-off

Every future structured-output schema we wire — stepper, narrator,
revised planner — will hit the same wall the moment it adds an
`.optional()` field. **`.optional()` is permanently unsupported on
OpenAI strict mode.** From now on, every "may be absent" field uses
`.nullable()`.

(See `apps/api/src/services/agent/subagents/stepper/schema.ts` —
three existing `.optional()` calls there will need the same
treatment when stepper wakes in phase 2.)

---

## Fix

### A — Switch `planRationale` to `.nullable()`

`apps/api/src/services/agent/subagents/planner/schema.ts`:

```ts
export const PlanFrameSchema = z.object({
  planGoal: z.string().min(1).max(120).describe(…),
  // .nullable() (not .optional()) because OpenAI's strict structured-output
  // mode requires every property to be in required[]. The model writes
  // null when no rationale is needed; the consumer treats null as "omit".
  planRationale: z.string().max(280).nullable().describe(
    "Why this plan over alternatives. Use null when obvious.",
  ),
  thought: z.string().min(1).max(200).describe(…),
});
```

Two semantic shifts on the wording:

1. The description now tells the model to **emit `null`** when there
   is no rationale, instead of "omit when obvious." `null` is a
   first-class value the model writes; "omit" wasn't really possible
   under strict mode anyway.
2. `.nullable()` (without `.optional()`) means the field is
   **always present** in the parsed object. Its value is either a
   `string` or `null`.

### B — Reflect `string | null` in the runtime types

`apps/api/src/services/agent/subagents/types.ts`:

```ts
export interface PlanFrame {
  planGoal: string;
  // null (not undefined) because the planner schema uses .nullable() for
  // OpenAI strict structured-output compatibility. The model writes null
  // when no rationale is warranted; convert to undefined at the patcher
  // boundary.
  planRationale: string | null;
  thought: string;
}

export interface Plan {
  reasoning: PlanReasoning;
  planGoal: string;
  planRationale: string | null;
  thought: string;
  chapters: PlanChapter[];
}
```

Note the field is no longer optional (`?:`). It is **always present**;
the value just may be `null`. That matches the runtime shape Zod
returns.

### C — Convert `null` → `undefined` at the patcher boundary

The widget-facing `WalkthroughPart.planRationale` stays
`string | undefined` (i.e. "omit when empty") — that contract was
already in place and we don't need to change it. The single bridging
point is the `setPlanGoal` call inside `runPlanner`:

`apps/api/src/services/agent/subagents/planner/run.ts`:

```ts
h.setPlanGoal(
  opts.patcher.conversation,
  opts.msgIndex,
  opts.partIndex,
  frame.planGoal,
  frame.planRationale ?? undefined,   // ◄── null → undefined at the seam
);
```

`?? undefined` reads explicit and only converts `null`; it leaves any
non-empty string untouched.

`formatFrameAsPrior` in `planner/prompt.ts` already uses a truthy
check (`f.planRationale ? … : ""`) so it handles `null` correctly
without changes.

---

## Why not other options

| Option | Why we didn't take it |
|---|---|
| Make the schema **not** use strict mode | LangChain's `withStructuredOutput` for `ChatOpenAI` defaults to strict on gpt-4o; opting out trades reliability for permissiveness, and the workaround (`{ strict: false }`) regresses parse quality |
| Use `.nullable().optional()` to allow both | Works on Zod side, but produces `string | null | undefined` runtime types — three states for what is morally one ("no rationale"). One sentinel is enough |
| Make `planRationale` a required `string` and use `""` for "none" | Pollutes the model's vocabulary — `""` looks like a bug rather than a deliberate "no rationale"; `null` is the explicit signal |
| Drop `planRationale` entirely | Loses a useful optional field for non-obvious plans; only avoids the problem instead of fixing it |

---

## Files

```
EDIT  apps/api/src/services/agent/subagents/planner/schema.ts
        - planRationale: z.string().max(280).optional()
        + planRationale: z.string().max(280).nullable()
        + update description: "Use null when obvious."

EDIT  apps/api/src/services/agent/subagents/types.ts
        - PlanFrame.planRationale?: string
        + PlanFrame.planRationale: string | null
        - Plan.planRationale?: string
        + Plan.planRationale: string | null

EDIT  apps/api/src/services/agent/subagents/planner/run.ts
        - h.setPlanGoal(…, frame.planRationale)
        + h.setPlanGoal(…, frame.planRationale ?? undefined)
```

The diagnostic try/catches added in the previous step stay — they're
cheap, they tell us which stage failed when something else goes
wrong, and they re-throw so the normal flow is unaffected.

---

## Verification

1. **Re-run the failing query.** "Show me the dashboard hero and the
   agents grid." The wire should now show:
   - stage 1 reasoning written (already worked),
   - stage 2 patcher writes for `planGoal` + `thought` (the ticker
     line from the model, replacing the system "Mapping out
     chapters…" placeholder),
   - stage 3 chapter list,
   - `status: planned`,
   - the orchestrator's closing turn referencing chapter titles by
     visible labels.

2. **Test for the null path.** Pose a goal where rationale is
   obvious ("create an agent") — the model should emit `null` for
   `planRationale`; the WalkthroughPart should have
   `planRationale: undefined` (i.e. the property is absent or
   undefined). Card UI shows no rationale subline.

3. **Test for the non-null path.** Pose a goal where rationale is
   non-obvious ("compare two onboarding paths"). The model should
   emit a sentence; the card UI should show it under the goal.

4. **Confirm the next schema we touch.** When `stepper/schema.ts`
   wakes up (phase 2), the three existing `.optional()` calls
   (`timeoutMs`, `popoverTitle`, `popoverElementId`) must each move
   to `.nullable()` before the stepper can run a single LLM call.
   Note this in `docs/v2/12-walkthrough-stepper/` when that folder
   opens.

---

## What this fix does NOT solve

This is purely the stage-2 schema-compat issue. The architectural
question raised after fix 03 — *should the orchestrator be unable to
call any tool after a walkthrough is planned, so the closing turn is
guaranteed prose-only?* — is still open and belongs in fix 05
(`tool_choice: "none"` after a `planned` walkthrough exists in
conversation state). That's a separate, additive improvement.

---

## Cross-references

- `fixes/01-parallel-tool-calls-race.md` — first in this fix chain
- `fixes/02-structured-output-tokens-leak.md` — token-leak filter
- `fixes/03-parallel-tool-calls-breaks-structured-output.md` —
  binding scope for `parallel_tool_calls`
- `02-plan-shape.md` §"Stage 2 — `PlanFrameSchema`" — schema
  definition this fix updates
- `apps/api/src/services/agent/subagents/planner/schema.ts` — file
  edited
- `apps/api/src/services/agent/subagents/types.ts` — file edited
- `apps/api/src/services/agent/subagents/planner/run.ts` — file edited
- OpenAI docs: [Structured outputs — All fields must be required](https://platform.openai.com/docs/guides/structured-outputs?api-mode=responses#all-fields-must-be-required)
