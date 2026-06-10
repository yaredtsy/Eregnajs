# 6.1 — Build Order

> Phases continue from the code as it exists today (see `0-review/01`). Each phase is shippable,
> ends with a demo, and unblocks the next. Within a phase, items are ordered. Don't start phase
> N+1 with phase N's demo failing.

---

## Phase 0 — Stabilize what exists (small, do first)

| # | Task | Touches |
|---|---|---|
| 0.1 | Commit the `graph.ts` channel-default fix (+ module-import test) | `workflow/graph.ts` |
| 0.2 | Run envelope: `hello` / `patch` / `end` frames; widget handles them + 60s watchdog | `transport/ndjson.ts`, `agent/runStream.ts` |
| 0.3 | `withRetry` around subagent calls; chapter degradation; terminal `end` on every exit | `subagents/*/run.ts`, `workflow/nodes/*` |
| 0.4 | Streamable-paths → leaf-name set + patcher replay test | `patcher/streamablePaths.ts` |
| 0.5 | Ownership scoping on `runs/*` (`owner_id` denormalized at save) | `runs/*`, `routes/agent.ts` |
| 0.6 | "As-built" notes into v1 docs where code diverged | `docs/mvp/02,04` |

**Demo:** kill the API mid-run → widget shows "connection lost"; narrator failure → run finishes with a red chapter.

## Phase 1 — Public surface (unblocks real embedding)

`/public/agent/run` with origin allowlist + rate limit (`3-server/06` §2); `agents.allowed_origins`
column + dashboard field; move widget to the public endpoint; `visitorId` in localStorage.

**Demo:** a plain HTML file on `localhost` with only the script tag runs a real walkthrough; the same file with a wrong agent id / disallowed origin fails cleanly.

## Phase 2 — Player v2 (frontend, can start parallel to Phase 1)

Build against the **sample conversation** first — no server needed: extend fixture with thoughts +
chapter statuses + manifest; `ChapterTimeline` → `ThinkingTicker` → `PlanPanel` → new `PlayerBar`
→ docked↔detached transition → buffered ("play on demand") mode; component gallery route alongside.

**Demo:** sample conversation plays through the full v2 player in all three modes; gallery shows every visual state.

## Phase 3 — Knowledge model v2 + engine resolver

`elements.key` + `selectors` jsonb migration; `site_facts` table + CRUD; manifest emission in
`enrich`; `knowledgeBlock` prompt section; engine resolver + retry ladder + not-found path
(message, red segment, continue); `__debugResolve` hook.

**Demo:** the acceptance scenario's not-found half — a removed component produces the notice + red segment while the run continues.

## Phase 4 — Thoughts + context discipline (server)

`thought` fields in planner/stepper schemas → patches → ticker goes live end-to-end; post-parse
validation + self-repair retry (`3.3 §3`); token budgets + truncation markers + counters
(`3.1 §5`); debug endpoints `context|plan|step|narrate`.

**Demo:** ask on a real page — thinking ticker streams during planning; `/debug/plan` shows the exact prompt and output that produced it.

## Phase 5 — Playground + tools v2

Playground stage + seeded KB + panels (`5-playground/01`); `addKnowledge` + `configure` in the
embed API; `api` tool kind + same-origin guard + execution timeouts; tool call log; knowledge
health view (`4-client/04` §4).

**Demo:** the full MVP acceptance test from `1-product/03` — runable start to finish in the playground.

## Phase 6+ — earned upgrades (in unlock order)

Tool-result round-trip (then: reactive stepper) → multi-turn history → embedding retrieval at
~100+ components → per-role models → second provider → share links/analytics. Each has a named
seam (`2-system/03`); each waits for a real trigger, not an itch.

## Parallelism map

```
P0 ──▶ P1 ──┬─▶ P3 ──▶ P4 ──▶ P5
P2 ─────────┘   (P2 frontend overlaps P0/P1 freely; merges at P3's manifest)
```

## Working rules

- Every phase lands its scenario-matrix rows (`5-playground/02`) — even before the playground
  exists, the rows are the manual test script.
- Contract changes follow `2-system/02` §7 (fixture updated in the same PR).
- One phase = one or few PRs; the demo line is the merge gate.
