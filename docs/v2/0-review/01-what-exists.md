# 0.1 — What Exists Today

> Inventory before judgment. Three artifacts exist: the v1 docs, the server implementation,
> and the widget/dashboard. They are **not** in sync — the drift itself is a finding (see `03-the-bad.md`).

---

## 1. The v1 docs (`docs/mvp/`, 12 files)

A complete, decision-logged plan: conversation shape, context providers, prompt sections,
LangGraph workflow, three subagents, JSON-Patch streaming, host API, SQLite persistence,
build order, open questions. Quality is high — decisions carry reasons and escape hatches.

## 2. The server (`apps/api/src/services/agent/`) — mostly built

| Piece | Status | Notes |
|---|---|---|
| `run.ts` | built | composes context → builds graph → streams frames → saves run |
| `workflow/graph.ts` + `nodes/*` | built | enrich → plan → streamChapter → streamBody → complete |
| `subagents/planner,stepper,narrator` | built | Zod-schema structured outputs; narrator streams |
| `context/compose.ts` | built, **diverged** | providers folded into one function; flat element rows; `conversationHistory: ""` (a string!) |
| `prompts/compose.ts` + `sections/*` | built | customerOverlay, elementsTree, rules, pageContext, hostStateBlock, hostToolsBlock |
| `patcher/*` | built | fast-json-patch observe + string-append transform + regex streamable paths |
| `transport/ndjson.ts` | built | NDJSON over a held-open fetch |
| `runs/*` (SQLite) | built | save/load/list, no ownership scoping |
| `llm/openai.ts` | built | single provider |
| Route `POST /v1/agent/run` | built, **behind dashboard auth** | `app.ts:28` puts all of `/v1` behind Supabase JWT |

Uncommitted: `workflow/graph.ts` swaps a throwing channel-`default` for a typed null placeholder
(LangGraph calls `default()` at module load — the throw was a real bug; commit this).

## 3. The client

| Piece | Status |
|---|---|
| Widget embed (`embed.tsx`, shadow DOM, `installGlobal`) | built — pre-mount buffering works |
| `window.eregna` host API (`setState`, `registerTool`, `ask`) | built |
| `runStream` → `APPLY_PATCH` → store | built — **sends no auth token** |
| Player (`WalkthroughOverlay`, `ChatPopup`, `PlayerBar`, `BubbleFAB`, `usePlayer`, `useLiveEngine`, `playStep`) | built for the sample-conversation demo |
| Dashboard (agents, pages, elements CRUD, sessions) | built — manual selector entry, no preview, no playground |

## 4. The database

- **Supabase Postgres**: `agents` (with unused `secret_key`), `pages` (ltree), `elements`
  (ltree, `dom_id`, `css_selector`, `xpath`, **unused** 1536-dim embedding + IVFFlat index),
  `conversations`, `messages`.
- **SQLite** (`bun:sqlite`): `agent_runs` snapshots, disconnected from Postgres entities.

## 5. What does not exist at all

- A working **public** run endpoint an embedded widget can call.
- Knowledgebase beyond per-page element trees (no site-level facts, no script-injected knowledge).
- Multi-turn conversation, tool-result round-trip, retries, token budgets.
- The v2 walkthrough player UX (segmented timeline, detached bar, thinking ticker).
- The playground.
