# 02 — Roadmap

The MVP is the smallest end-to-end loop that proves: **a visitor asks a question, the agent streams a walkthrough, the engine plays it on the host DOM.** Everything else waits.

---

## Phase 1 — MVP (this iteration)

Goal: one customer, one site, one page. Visitor types a question → sees a streamed walkthrough that highlights real elements on their page and explains them.

### Work streams

```
A — Foundations:  Drizzle schema + API skeleton + auth
B — Dashboard:    Register site → page → element tree → copy embed snippet
C — Engine core:  walkthrough-core package — types, engine, executor, queue
D — Widget:       Embed bootstrap + shadow DOM + overlay + DOM adapter
E — Streaming:    Planner + streamer services on the API + SSE NDJSON
F — Player UX:    Store + controls + chat input + pause/branch
```

A must finish first. B/C/D can run in parallel after A. E depends on the engine schema (C) being frozen. F depends on D + C.

### Acceptance criteria for Phase 1

| # | Criterion |
|---|-----------|
| 1 | User can sign up (Google or email/password) and create an agent. |
| 2 | User can register a single page with a hierarchical element tree (label + selector + description). |
| 3 | Dashboard shows a copy-pasteable `<script>` embed snippet. |
| 4 | Pasting the snippet on the registered page mounts the widget in a shadow DOM with a host-body overlay. |
| 5 | Visitor types a question; API plans a walkthrough and streams `Step` objects over SSE. |
| 6 | Engine appends streamed steps to its queue and plays them as they arrive (no need to wait for full plan). |
| 7 | Each step can highlight an element, scroll it into view, show a popover with typewriter narration, and wait for "Next" or a target click. |
| 8 | Player bar exposes play / pause / next / prev / speed. Same input field doubles as chat. |
| 9 | While paused, typing a question opens a new mini-walkthrough that splices into the queue. |
| 10 | If a selector is missing, the engine retries within a budget then visibly skips the step and continues. |

### What's explicitly NOT in Phase 1

- Autonomous click / fill on the host page (action types exist in the schema but the executor rejects them in MVP).
- Multi-page walkthroughs (planner picks one page, period).
- pgvector retrieval — MVP feeds the full element tree of the chosen page to the LLM.
- Analytics, rate limiting, billing.
- Driver.js-style "next/prev" buttons attached to each spotlight — narration drives advance via the player bar.

---

## Phase 2 — Hardening + retrieval

Once Phase 1 plays end-to-end on a real customer site:

1. **pgvector retrieval** for element descriptions — switch from "full page tree" to "top-K matched elements + page tree skeleton" once a single page's element count crosses ~50.
2. **Multi-page walkthroughs** — planner can emit `navigate` actions that change `window.location`; engine resumes after page load via a session token.
3. **Interactive actions** (`simulate-click`, `fill-input`) behind a per-element trust flag the dashboard owner toggles.
4. **Session replay** — `walkthrough_sessions` already records every emitted step; add a viewer in the dashboard.
5. **Rate limit + per-agent cost cap** on `/v1/walkthroughs/run`.

## Phase 3 — Platform

- Team workspaces and role-based access.
- CDN-delivered widget bundle, versioned + immutable.
- Custom branding tokens (`data-theme` JSON on the script tag).
- Self-hosted option for enterprise.

---

## Tech-debt items already known

| Item | Why it's debt | When we pay |
|---|---|---|
| Step IDs are timestamps in MVP — not stable across replays. | Replay viewer needs deterministic IDs. | Phase 2 (replay viewer). |
| Overlay z-index hardcoded to `2147483646`. | Host sites with their own max-z elements will fight us. | First customer complaint. |
| Only two providers in MVP (OpenAI via LangChain, Anthropic via Claude SDK). | Gemini, OpenRouter, local models will come. | Phase 2; add a new `LlmProvider` impl + line in `pickProvider`. |
| `ltree` paths recomputed in app code on every move. | Slow if a tree gets large; should be a trigger or recursive CTE. | When a customer has > 200 elements. |
| Shadow-DOM mount is recreated on every `initWidget` call. | Hot-reload during dev re-mounts noisily. | Dev-experience pass. |
