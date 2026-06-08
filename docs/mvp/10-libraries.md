# 10 — Libraries

> Every dependency we add, what it does, and what we considered instead. The MVP brings in **five new packages** total; everything else is either already in the repo, built into Bun, or rolled by hand.

---

## 1. Shared (new shared package)

### `packages/walkthrough-core`

Not a third-party library — the new shared package described throughout these docs. Adding it now (not later) gives `apps/api` and `packages/widget` a single source of truth for `Conversation` / `WalkthroughPart` types, the JSON-Patch wrapper, and the LangChain adapters.

Workspace dependencies it adds:
- `fast-json-patch`
- `@langchain/core` (for the message adapters)

---

## 2. Server (`apps/api`)

| Package | Purpose | Alternatives considered |
|---|---|---|
| **`@langchain/core`** | `BaseMessage`, `BaseChatModel`, `withStructuredOutput`, `.stream()`, `Runnable` | Direct OpenAI SDK — would need to hand-roll structured output parsing, stream parsing, and provider-swap. Not worth the savings. |
| **`@langchain/openai`** | `ChatOpenAI` provider | `openai` SDK directly — see above. |
| **`@langchain/langgraph`** | `StateGraph`, `START`/`END`, conditional edges | Hand-rolled `while` loop — works for MVP linearity but bakes in growth pain. LangGraph is explicit, instrumentable, and graph promotion is no-cost (`04-workflow.md`). |
| **`fast-json-patch`** | `observe()` on the conversation mirror; `applyOperation` on the wire ops | `jsondiffpatch` — heavier; `immer + custom diff` — more code; pure-RFC 6902 hand-roll — re-inventing. `fast-json-patch` is small and exactly fits. |
| **`nanoid`** | Stable IDs for runs, messages, chapters, steps | `crypto.randomUUID()` — UUIDs are 36 chars and log-noisy; nanoid is 8–10 chars, URL-safe. |
| `bun:sqlite` (**built-in, not a dep**) | `agent_runs` storage (see `09-persistence.md`) | `better-sqlite3` — requires native compilation; `bun:sqlite` ships with the runtime. `drizzle-orm` + sqlite driver — overkill for one table with two JSON columns. |
| `zod-to-json-schema` (transitive) | Used internally by LangChain's `withStructuredOutput` when given a Zod schema | Pulled in by `@langchain/core`; listed here for visibility. Not added explicitly. |

Already in `apps/api`'s `package.json` (no change):
- `hono`, `@hono/zod-validator`, `zod`, `@supabase/supabase-js`, `@repo/db`

Optional, deferred:
- `@langchain/anthropic` — Claude as an alternate provider. Add when an agent owner needs it; one new file under `services/agent/llm/`.

---

## 3. Widget (`packages/widget`)

| Package | Purpose | Alternatives considered |
|---|---|---|
| **`fast-json-patch`** | `applyOperation` for incoming wire ops (with the string-append wrapper in `walkthrough-core`) | Hand-rolled patcher — small enough, but mismatching the server is a foot-gun. Sharing the lib keeps semantics in sync. |
| **`nanoid`** | Stable client-only IDs (e.g., optimistic user-message id before the server frame arrives) | `Date.now()` — collisions; `crypto.randomUUID` — overkill. |

Already in the widget (no change):
- `react`, `react-dom`
- `@repo/ui`

We add **no** state-management lib (Zustand, Redux, Jotai). The existing `useReducer + Context` gets one new action (`APPLY_PATCH`); that's the entire integration cost.

We add **no** SSE parser library. NDJSON parsing is ~15 LOC of native `fetch` + `TextDecoderStream` (`06-patcher-and-wire.md` §9).

We add **no** DOM-utilities lib (`@floating-ui/dom` etc.). The shipped overlay uses `useElementRect` and does its own positioning.

We add **no** animation lib. CSS + the existing rAF tick covers everything.

---

## 4. Dashboard (`apps/eregna`)

No new dependencies for the MVP agent flow. Phase 2 session replay viewer will want:
- `react-window` or similar — virtualised list for long runs.
- No widget code; it just loads `agent_runs.state_snapshot` and renders the widget package in history mode.

---

## 5. Workspace-level

| Concern | Tooling | Notes |
|---|---|---|
| Monorepo | existing `turbo` / `pnpm-workspace.yaml` | Add `packages/walkthrough-core` to the workspace. |
| Build (widget IIFE) | existing `vite` | One new entry `embed-auto.ts` in `packages/widget/vite.config.ts`. |
| Supabase types | hand-edited `packages/db/types.ts` (per `01-folder-structure.md`) | No change — `agent_runs` lives in SQLite, not Supabase. |
| SQLite file location | env var `EREGNA_RUNS_DB_PATH` (default `./eregna-runs.sqlite`) | One file path to back up; one path to wipe in dev. |

---

## 6. Bundle size budget (widget IIFE)

The IIFE the customer drops on their site is the only size that matters externally.

| Component | gzipped (estimate) |
|---|---|
| React 19 + ReactDOM | ~45 KB |
| Widget UI + CSS | ~12 KB |
| `fast-json-patch` | ~6 KB |
| `nanoid` | ~0.5 KB |
| Engine + agent + embed glue | ~6 KB |
| **Total IIFE** | **~70 KB gzipped** |

For comparison, Driver.js is ~12 KB gzipped (pure tour, no chat, no streaming, no host-tool surface). Intercom's chat widget is ~150 KB gzipped. We're comfortably under.

If we ever want to drop below 50 KB: lazy-load the chat popup (FAB only until the visitor opens), code-split the agent stack from the engine.

---

## 7. Things we deliberately do not pull in

| Lib | Why not |
|---|---|
| LangChain agent executors (`AgentExecutor`, `createToolCallingAgent`) | We use `BaseChatModel` directly. Executors target ReAct loops; ours is a state machine. |
| LangChain `RunnableSequence` for prompt composition | Prompts are pure functions; no need for the sequence abstraction. |
| LangChain output parsers | `withStructuredOutput(zodSchema)` returns the typed object. |
| `eventsource-parser` / `eventsource` polyfill | We use NDJSON, not SSE. |
| `axios` / `ky` | Native `fetch` is sufficient on both sides. |
| `pino` (server logging) | Hono's built-in `logger()` + `console` covers MVP. Revisit in Phase 2. |
| `dotenv` (server) | Bun reads `.env` natively. |
| `better-sqlite3`, `drizzle-orm`, etc. | `bun:sqlite` is built into the runtime. One table; raw SQL is clearer than an ORM. |
| State-management lib on the widget | `useReducer + Context` handles it. |
| `framer-motion` / `react-spring` | CSS transitions cover MVP visuals. |
| `react-query` / `swr` (in the widget) | The widget speaks NDJSON straight into the store — no cached-query model needed. |

---

## 8. Version pinning policy

- Pin **minor** for `@langchain/*` packages (they ship breaking changes between minors more often than not).
- Pin **major** for everything else (allow patches).
- Quarterly refresh; weekly Dependabot scans for security only.

---

## 9. References

- `04-workflow.md` — LangGraph usage.
- `05-subagents.md` — `withStructuredOutput` + `.stream()` usage.
- `06-patcher-and-wire.md` — `fast-json-patch` usage on both sides.
- `08-embed-and-host-api.md` — IIFE entry + Vite config notes.
- `09-persistence.md` — `bun:sqlite` usage.
