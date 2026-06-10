# 0.4 — Direction: keep / fix / add

> The bridge from review to design. One table, then the strategy in three sentences.

---

## The strategy

Keep v1's skeleton — it is sound. Fix the three blockers (public auth, ownership, error recovery)
before building anything new on top. Then build the three genuinely new things — the knowledgebase
model, the walkthrough player UX, the playground — because they are what make this *your* product
and what teach the skills you're here for.

## Keep (from `02-the-good.md`)

| What | Where it stays |
|---|---|
| Conversation doc + JSON Patch over NDJSON | `2-system/02-contracts.md` |
| Deterministic orchestrator, LLM-only-in-leaves | `3-server/02-orchestration.md` |
| Planner / Stepper / Narrator | `3-server/03-subagents.md` |
| Closed context set (now five sources) | `3-server/01-context-engineering.md` |
| Buffered `window.eregna` shim | `4-client/01-embed-and-host-script.md` |
| Structured outputs over forced tool calls | `3-server/03-subagents.md` |
| Shared types package | `2-system/02-contracts.md` |

## Fix (from `03-the-bad.md`)

| # | Fix | Designed in |
|---|---|---|
| 1 | Public run endpoint: `public_id` + origin allowlist + rate limit | `3-server/06` |
| 2 | Ownership scoping on every runs query | `3-server/06` |
| 3 | Retries + chapter-level degradation + terminal error patch | `3-server/02` §4 |
| 4 | "As-built" notes whenever code diverges from docs | convention, `README.md` |
| 5 | Tool spec + args validation; result round-trip seam | `3-server/04` |
| 6 | Enforced context budgets + element projections | `3-server/01` §5 |
| 7 | Streamable paths by field name + patcher unit tests | `3-server/05` |
| 8 | Element manifest + selector-query resolver + recovery UX | `2-system/02`, `4-client/03` |

## Add (the new v2 surface)

| What | Why | Designed in |
|---|---|---|
| **Knowledgebase model**: site facts + pages + components + selector queries | "elements only" is too thin to answer real questions | `1-product/02`, `4-client/04` |
| **Script-injected knowledge** (`addKnowledge`) — optional quick-fix channel | customers patch gaps without touching the dashboard | `4-client/01` |
| **API-call tools** alongside JS-function tools | tools that hit the customer's backend, declared not coded | `3-server/04` §3 |
| **Walkthrough player v2**: detached input bar, YouTube-style chapter segments, thinking ticker, plan display, play-on-demand vs live | the product's face; same stream, different rendering than chat | `4-client/02` |
| **Thoughts in the stream**: structured reasoning summaries as document fields | "show thinking" without leaking raw CoT; same patch mechanism | `2-system/02` §3 |
| **Playground**: isolated testing of state / tools / knowledge / player against awkward components | tight feedback loop; the learning lab | `5-playground/*` |
| **Debug endpoints** (`/v1/agent/debug/*`): run one subagent, inspect its exact prompt + output | context engineering is invisible without this | `3-server/02` §5, `5-playground/01` |

## What v2 deliberately does NOT add yet

Multi-turn memory, retrieval over embeddings, multi-provider LLM, tool-result round-trip
*execution* (the seam is designed, the feature waits), anonymous run sharing, analytics.
Each has a named seam; none blocks MVP. Resist them until the roadmap says go
(`6-roadmap/01-build-order.md`).
