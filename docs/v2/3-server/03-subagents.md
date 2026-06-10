# 3.3 — Subagents

> The three LLM calls. Built and working; v2 changes their *output schemas* (thoughts, validation)
> more than their structure.

> **What you're learning here:** role decomposition — small calls with scoped context and narrow
> output beat one smart call with everything; schema design as behavior control (the schema is
> half the prompt); structured output vs. free streaming and when each fits.

---

## 1. The cast

| Subagent | Input (projection, see 3.1 §3) | Output | Mode |
|---|---|---|---|
| **Planner** | question + component index + facts + tools + state | `{ thought, goal, rationale, chapters[] }` | structured (one shot) |
| **Stepper** | one chapter + focused projection + tool specs | `{ thought, steps[] }` | structured (one shot) |
| **Narrator** | one step + chapter + voice rules | popover body text | **token stream** |

Why the narrator streams and the others don't: the popover body is *displayed as it generates* —
streaming is UX. Plans and steps are *consumed by code* — atomic, validated objects. Choosing the
output mode per role is the skill.

## 2. Schema deltas for v2

```ts
// planner — additions
thought: z.string().describe("One sentence on how you read the question and what you'll show. Visitor-visible.")
chapters: z.array(z.object({
  title: z.string(),
  description: z.string(),
  elementKey: z.string().describe("MUST be a key from the component index. Never invent one."),
})).min(1).max(6)        // cap: walkthroughs, not novels

// stepper — additions
thought: z.string()
steps: z.array(...).max(8)
// call-tool action args validated AFTER parse against the tool's declared parameters (see 3.4 §4)
```

The `thought` fields feed the player ticker (`2-system/02` §3). Putting them *first* in the schema
is deliberate: the model commits to an interpretation before emitting structure — cheap
chain-of-thought you control, fully displayable.

## 3. Validation beyond the schema (the part Zod can't see)

Schema-valid output can still be *semantically* wrong. Post-parse checks, with one self-repair
retry (re-prompt with the specific violation appended), then degrade per `3.2 §4`:

| Check | On fail (after retry) |
|---|---|
| every `chapters[].elementKey` ∈ component index | drop the bad chapter; thought notes it |
| every step action's `elementKey` ∈ manifest | replace with chapter's target key |
| `call-tool` name ∈ registered tools, args match parameters | drop the action, mark step `skipped`, reason `unknown-tool` / `bad-args` |
| `wait.ms` ≤ 10_000 | clamp |

Lesson: **validate at the boundary between model output and everything else.** The model is a
text generator; the moment its output becomes program input, treat it like user input.

## 4. Prompt files stay co-located

`subagents/<role>/{prompt.ts, schema.ts, run.ts}` (as built) is the right layout — a role's
prompt, contract, and invocation read as one unit. Each `run.ts` gains the `withRetry` wrapper and
the post-parse validators; keep them under ~80 lines each.

## 5. Evolution paths (named, deferred)

- **Per-role models** — narrator on a cheap model is the first cost win. Config map, no surgery.
- **Planner with retrieval** — arrives automatically when the components loader swaps (3.1 §6).
- **Reactive stepper** — consumes tool results mid-chapter; requires the round-trip (3.4 §5) and
  a reactive orchestrator (3.2 §3). The schema gains `expectation?: string` per tool call when
  that lands — don't add it before.
- **Critic** — a fourth role that reviews a plan before streaming ("are these chapters actually
  answerable from these components?"). Cheap to add later because roles are files, not branches.
