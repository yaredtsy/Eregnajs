# 0.3 — The Bad (fix these)

> Ordered by severity. Items 1–3 block any real deployment; the rest are debt that will tax you.
> Every item names the file where it lives, so this doubles as a punch list.

---

## 1. Embed auth is broken — the product cannot ship as-is ❌

`app.ts:28` puts **all** of `/v1` behind `authMiddleware` (Supabase JWT). The widget's
`runStream` sends no token. So the one endpoint the public embed must call requires a login the
visitor can never have. Meanwhile `agents.secret_key` exists in the schema and is used **nowhere**.

**Fix (designed in `3-server/06-persistence-and-auth.md`):** a separate public surface
(`/public/agent/run`) authenticated by `public_id` + an **origin allowlist** per agent + rate
limiting. `secret_key` is reserved for server-to-server calls later. Never reuse dashboard auth
for visitor traffic.

## 2. Run records have no ownership scoping ❌

`GET /v1/agent/runs/:id` (`routes/agent.ts`) loads any run by id — any authenticated user can read
any other customer's run. SQLite rows aren't joined to `agents.owner_id` at all.

**Fix:** every runs query filters through agent ownership. Trivial now, painful after launch.

## 3. One LLM hiccup kills the whole run ❌

No retry, no timeout, no per-chapter degradation anywhere in `subagents/*/run.ts` or the graph.
A planner 500 = dead stream; a narrator failure mid-chapter 3 = dead stream *after* the visitor
has watched two chapters.

**Fix:** retry-with-backoff wrapper around every subagent call; chapter-level degradation
(mark chapter `failed`, continue with the next); a final `error` patch so the widget always learns
the run ended. See `3-server/02-orchestration.md` §4.

## 4. Docs–code drift, undocumented ⚠️

The code quietly dropped v1's `ContextProvider` abstraction (`context/compose.ts` is one inline
function), made `conversationHistory` a string `""` instead of `BaseMessage[]`, and passes flat
element rows where docs promise a tree. None of this is *wrong* — inlining providers for MVP is
defensible — but undocumented drift means the docs lie. v2 rule: **when code diverges, the doc
gets a one-line "as-built" note in the same PR.**

## 5. Tool calls are unvalidated and fire-and-forget ⚠️

The stepper can emit `call-tool` with arbitrary `args`; nothing checks the tool exists or that
args match its declared `parameters`. The widget ignores `run()`'s return value and any thrown
error. For a product whose premise is "agents operate your components," tools are the weakest part.

**Fix:** validate specs at the route (already partial), validate emitted args against the tool's
schema before the step ships, and design the result round-trip seam now even if it lands later.
See `3-server/04-dynamic-tools.md`.

## 6. Context has budgets on paper, none in code ⚠️

v1 §02 specifies token budgets and `hostState` truncation at 4k. The implementation loads
everything and truncates nothing. Fine at 50 elements; a real customer page with 300 registered
elements silently blows the prompt.

**Fix:** enforce budgets in the prompt sections (truncate + marker), and make the planner's
element list a *projection* (id, label, one-line description), not full rows.

## 7. Fragile streamable-path regexes ⚠️

`patcher/streamablePaths.ts` hardcodes regexes like `/messages/0/parts/0/...`. Add one metadata
field to the path shape and string-append silently stops matching — the failure mode is *visual
jank*, not an error.

**Fix:** mark streamability by **trailing field name** (`body`, `text`, `detail`) rather than full
path shape, and add a unit test that walks a real run's ops.

## 8. Element addressing is a single point of failure ⚠️

Everything assumes `dom_id` exists on the customer's DOM. The schema already stores
`css_selector`/`xpath` but nothing uses them; if an id is missing or renamed the step just dies
client-side. The user-facing requirement ("if it cannot find the component, show a message, mark
the segment red") cannot be met without a resolver + recovery design. See
`4-client/03-engine-and-recovery.md` and the **element manifest** idea in `2-system/02-contracts.md`.

## 9. Smaller debts (track, don't panic)

- Embedding column + IVFFlat index shipped but unused — either use it for element retrieval
  (Phase 4) or drop it; an unused vector index is pure cost.
- No backpressure on the NDJSON writer (slow client = frames buffer in memory).
- `messages` table in Postgres vs. run snapshots in SQLite store overlapping truths — pick one
  source of truth per question (see `3-server/06`).
- Hardcoded `model` strings; no per-subagent model map (v1 open question #9 — v2 locks it).
- No tests anywhere in the agent service. The patcher and `matchUrl` are pure functions begging
  for unit tests; start there.
