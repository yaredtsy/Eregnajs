# agent/07 — Iteration Workflow

How we change the agent without breaking running sessions or losing quality. This is the workflow doc — read it whenever you're about to edit a prompt, the Plan schema, or the streamer's tool definition.

---

## The three iteration loops

```
Fast loop     ── edit prompts only ────────────────► restart API, manual test
                ~minutes

Medium loop   ── edit Plan schema ─────────────────► migrator + replay fixtures
                ~hour

Slow loop     ── edit engine action schema ────────► widget + walkthrough-core changes
                ~day (cross-package)
```

Each loop has its own discipline. Most iteration lives in the fast loop. The Plan JSON exists precisely so that **schema-aware iteration** is the second-fastest loop, not the slowest.

---

## Fast loop — prompt-only edits

Editing `prompts/planner.prompt.ts` or `prompts/streamer.prompt.ts`:

1. Make the change.
2. Bump `PROMPT_VERSION` in `prompts/constants.ts` (e.g. `'2026-05-22-a'` → `'2026-05-22-b'`).
3. Restart the API.
4. Run the manual smoke test: open the widget, ask 3 canned questions, eyeball the output.
5. Commit.

The session row stores `promptVersion` on every session. When you bisect "why did quality drop", you can join sessions to prompt versions.

**Don't** change prompts and the Plan schema in the same commit unless they truly depend on each other. The git history is more useful when isolated.

---

## Medium loop — Plan schema edits

Editing `services/schemas/plan.schema.ts`:

1. Decide if the change is additive or breaking (`03-plan-json-schema.md` has the cheat sheet).
2. For breaking changes, bump `version: z.literal(N)` and add a migrator branch in `migratePlan`.
3. Update the planner system prompt if the new field needs to be requested.
4. Update the streamer system prompt if it consumes the new field.
5. Add/update fixtures in `apps/api/test/fixtures/plans/`. At minimum:
   - One fixture exercising the new field positively.
   - One fixture from the previous version that the migrator should upgrade.
6. Run the eval rig (below).
7. Commit.

---

## The eval rig (lightweight, MVP version)

We don't need an MLOps platform. We need a script that runs a fixed set of queries through the live planner + streamer and diffs the output.

```
apps/api/test/agent-eval/
├── queries.json                ← fixed list of representative questions
├── snapshots/                  ← committed reference outputs
│   ├── q01.plan.json
│   ├── q01.steps.jsonl         ← one Step per line, the wire format
│   └── ...
└── run.ts                      ← bun-runnable script
```

`queries.json`:

```json
[
  { "id": "q01", "publicId": "fixture-acme", "pageUrl": "https://acme.com/pricing",
    "query": "how do I subscribe to pro?" },
  { "id": "q02", "publicId": "fixture-acme", "pageUrl": "https://acme.com/pricing",
    "query": "what is team tier?" },
  { "id": "q03", "publicId": "fixture-acme", "pageUrl": "https://acme.com/",
    "query": "how do I sign in?" }
]
```

`run.ts`:

```ts
// bun run --cwd apps/api test/agent-eval/run.ts
import { runPlanner, runStreamer } from '../../src/services/...'
import queries from './queries.json'
import { diffJSON } from './diff'

for (const q of queries) {
  const plan = await runPlanner({ ...q })
  const steps: Step[] = []
  await runStreamer({ plan, emit: async (s) => { steps.push(s) } })

  const planSnapshot = readSnapshot(`snapshots/${q.id}.plan.json`)
  const stepsSnapshot = readSnapshot(`snapshots/${q.id}.steps.jsonl`).split('\n').map(JSON.parse)

  diffJSON(planSnapshot, plan, { keysToIgnore: ['rationale', 'notes'] })
  diffJSON(stepsSnapshot, steps, { keysToIgnore: ['popover.body'] })
}
```

The `keysToIgnore` list captures fields that legitimately vary across runs (LLM-written prose). We **don't** ignore structural fields. If `pickedPageId` changes between runs for the same query, that's signal.

Outputs:

```
q01  plan: 0 diffs · steps: 0 diffs                        ok
q02  plan: 1 diff (pickedPageId changed)                   FAIL
q03  plan: 0 diffs · steps: 2 diffs (action order changed) FAIL
```

CI runs this nightly against a snapshot dataset; engineers run it locally before merging a prompt change.

---

## Snapshot maintenance

When a prompt change is **intentionally** going to change snapshot output:

1. Run `bun run eval --update q01,q02` to refresh those snapshots.
2. Hand-review the new snapshots in the diff. Are they better? Worse?
3. Commit prompt + snapshot updates together.

We don't blindly accept new snapshots. A regression must be reasoned about: "this change improves explain steps for Pricing but breaks recap timing on /home — accepted, will revisit".

---

## Replay-from-stored-plan

The `walkthrough_sessions.plan_outline` column gives us a real-user-query corpus. The replay tool:

```bash
bun run replay --sessionId sess_01H...
```

reads the stored Plan, re-runs the streamer (with current prompts + schema), and diffs against the stored `walkthrough_steps` rows. This is how we evaluate prompt changes against real customer queries without re-paying for planner tokens.

---

## Versioning matrix

Three orthogonal version numbers. Every session stores all three.

| Version | Lives in | Bumped when |
|---|---|---|
| `promptVersion` | `prompts/constants.ts` | Any prompt text change. |
| Plan schema `version` | `plan.schema.ts` | Plan schema breaks. Additive changes don't bump. |
| Engine action schema `version` | `walkthrough-core/.../walkthrough.ts` | The `Action` union changes shape. |

A session that has `promptVersion = X`, `planVersion = 1`, `engineVersion = 1` is replayable. If we later raise `planVersion` to 2, `migratePlan` makes the stored v1 plan usable.

---

## When to bump `agent.model` (and providers)

Customers pick a model. We don't auto-upgrade them. When a new model lands (OpenAI **or** Anthropic):

1. Add it to the relevant allowlist (`OPENAI_MODELS` or `ANTHROPIC_MODELS`) in `services/llm/pickProvider.ts`.
2. Run the eval rig against the new model with current prompts. Snapshots are provider-tagged; you'll see a `provider:` field on each diff line.
3. If it's strictly better than the current default, update the default for **new** agents only.
4. Document the trade-off in the model picker in the dashboard.

Adding a brand-new provider:

1. New file `services/llm/<provider>.ts` implementing `LlmProvider`.
2. Add its model ids to a new allowlist + entry in `pickProvider`.
3. Add a `provider` enum value alongside `'openai' | 'anthropic'` on the session row.
4. Run the eval rig across all providers; the diff tool ignores `provider` so quality is comparable.

Existing agents stay on their chosen model. Customers update via the settings page.

---

## Debugging a bad session

1. Pull the session row: `select * from walkthrough_sessions where id = $1`.
2. Note `promptVersion`, `pickedPageId`, `errorMessage`.
3. Pull steps: `select step from walkthrough_steps where session_id = $1 order by stream_index`.
4. If the Plan looks bad: `bun run replay --sessionId X --stage planner` re-runs the planner with current prompts and diffs.
5. If the steps look bad: `bun run replay --sessionId X --stage streamer` uses the stored Plan but re-streams.
6. Capture findings in a comment on the GitHub issue. Update prompts or schema. Re-run eval.

---

## Anti-patterns

| Don't | Why |
|---|---|
| Add prompt instructions in response to a single bad session | Overfits. Verify across multiple cases. |
| Add Plan fields the streamer doesn't read | Dead schema bloat. |
| Skip the eval rig because "the change is small" | Small changes that move snapshots reveal hidden coupling. |
| Hand-edit JSON snapshots to make the eval pass | The whole point is unfaked comparison. |
| Change two layers (prompts + schema) in one commit | Bisecting is impossible. |

---

## Future (Phase 2+) iteration tools we explicitly defer

- **A/B prompt routing** — splitting traffic between prompt versions and aggregating outcomes. Requires us to define an outcome metric (Phase 2 analytics).
- **LLM-as-judge eval** — using a second model to score Plan/Steps for quality. Useful but expensive; not Phase 1.
- **Prompt change PR comments** showing eval diffs — nice CI ergonomics, build later.
- **A prompt-versioned chatbot in the dashboard** — "test your agent" feature. Phase 2.

The MVP version of iteration is: edit prompt, bump version, run eval, eyeball diffs, ship.
