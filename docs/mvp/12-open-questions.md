# 12 — Open Questions

> Decisions still to lock before coding. Each has a **default** that the rest of the plan assumes. Lock or override; if overridden, the affected doc(s) are listed so we know what to patch.

---

## 1. Tool-call result round-trip

**Question.** When a step's `call-tool` action runs on the widget and the host's `run()` returns a value, do we send that value back to the agent (i.e., make it observable to the LLM in a later turn)?

**Default for MVP: no.** The widget invokes `run(args)`, ignores the return value, advances. The Stepper's prompt is told "assume tool calls succeed."

**Why default no.** Round-tripping requires:
- A `tool_result` patch flowing widget → server.
- A way to *pause* the orchestrator until the result lands.
- A new workflow node (`waitForToolResult`) gated on a channel.
- A re-entry into Stepper or Narrator with the result included.

Doable, but a full Phase 1.5 feature.

**If overridden:** add a new `tool_result` route; one new LangGraph node; one new workflow channel. Affected: `04-workflow.md`, `06-patcher-and-wire.md`, `07-engine.md`, `08-embed-and-host-api.md`.

---

## 2. Provider count

**Question.** OpenAI only, or also Anthropic / Gemini in MVP?

**Default for MVP: OpenAI only.** `services/agent/llm/openai.ts`. The `pickModel(agent.model)` factory exists so adding a provider is one file.

**Why default one.** Less surface area for the first run; agents that need Claude can wait one week.

**If overridden:** add `services/agent/llm/anthropic.ts` (or `gemini.ts`). Update `pickModel`. Affected: `10-libraries.md` (add `@langchain/anthropic`).

---

## 3. Conversation continuity across `ask()` calls

**Question.** When the visitor asks a second question in the same widget session, does the agent see the prior conversation?

**Default for MVP: no.** Each `ask()` is its own run with a fresh `Conversation`. `conversationHistory` provider (`02-context.md` §3.6) returns `[]`.

**Why default no.** Continuity needs a session/visitor id stable across reloads, a deterministic conversation join across runs, and prompt-size discipline. The seam is wired so the upgrade path is "make the provider non-empty."

**If overridden (within MVP):** generate a visitor id at first `ask()`, persist in `localStorage`, send on every subsequent request; `conversationHistory` provider reads prior `agent_runs` rows and projects them into `BaseMessage[]`. Affected: `02-context.md`, `08-embed-and-host-api.md`.

---

## 4. Element-id namespace

**Question.** What string does the LLM emit for `WalkthroughChapter.elementId` / action `elementId`?

**Default for MVP: the registered element's `dom_id` (the literal DOM `id` attribute).** The Stepper's prompt sees `elements.dom_id` as the id. The engine resolves with `document.getElementById(elementId)`.

**Why default this.** It's already in the schema; works with `useElementRect`; the simplest mental model for the LLM.

**Implication.** Every registered element must have a non-null `dom_id`. Customers who only have CSS selectors today must add a DOM id, OR we mark the element registration "MVP-incompatible" until `01-conversation-shape.md`'s `SelectorSpec` lift lands.

**If overridden:** lift `elementId` to a `SelectorSpec` union. Affected: `01-conversation-shape.md`, `07-engine.md` (new resolver path), `05-subagents.md` (Stepper schema).

---

## 5. Chapter `elementId` required vs. optional

**Question.** Every chapter has an `elementId`, or can a chapter be "general" (no target)?

**Default for MVP: required.** A chapter without a component is rare (intro/outro). Those use the page-root element as the target.

**Why default required.** Two code paths in the focused-context builder (chapter with target vs without) doubles testing surface.

**If overridden:** make `elementId` optional in `WalkthroughChapter`. Update `focusChapter` to skip element resolution when null. Update the Stepper prompt to handle "no target" mode. Affected: `01-conversation-shape.md`, `02-context.md`, `05-subagents.md`.

---

## 6. Popover-body streaming granularity

**Question.** Narrator yields what — character, token, word, sentence?

**Default for MVP: whatever LangChain's `.stream()` yields.** Typically a model's token deltas, ~2–6 chars each. The widget renders the literal accumulating string; no extra batching.

**Why default this.** Lowest latency to first visible char; no extra logic.

**Tuning knob (not a decision):** if we ever see "the text twitches too fast", `narrator/run.ts` can batch deltas into ~50ms windows before yielding. One small change; no schema impact.

---

## 7. How aggressive is the Planner about "out of scope"?

**Question.** If the visitor's question doesn't match any registered element, does the Planner (a) try to answer text-only, (b) refuse, (c) make a one-chapter walkthrough targeting the page-root with an apology?

**Default for MVP: (c).** A one-chapter walkthrough on the page-root with a description like "Sorry, this page doesn't have what you're asking about." The chat preface ("I couldn't find that on this page…") is the assistant's free-text content; the walkthrough is the formal close-out.

**Why default (c).** Keeps the wire shape uniform (always one walkthrough); lets the existing renderer handle it without a special "no walkthrough" branch.

**If overridden to (a):** the Planner returns 0 chapters and the workflow short-circuits before any walkthrough patch. Affected: `04-workflow.md` (new branch), `05-subagents.md` (Planner schema allows empty chapters, with a `noPlanReason` field).

---

## 8. Live mode scrubber behaviour

**Question.** In live mode, can the visitor scrub backwards / replay a step?

**Default for MVP: no.** Live mode is forward-only. The scrubber is hidden (or disabled), prev/next are disabled. The visitor can pause; pausing doesn't affect the network stream — patches keep landing into the store but the engine stops advancing actions.

**Why default no.** Replaying a live step requires re-running its actions (or pretending — both wrong choices). Live mode is fundamentally a one-way fall.

**If overridden:** add a `liveScrub: false → true` mode; PlayerBar shows the scrubber over `currentStepIndex / steps.length`. Affected: `07-engine.md` (`playStep` becomes re-entrant).

---

## 9. Per-sub-agent model assignment

**Question.** Same model for all three sub-agents, or split (e.g., gpt-4o for Planner, gpt-4o-mini for Narrator)?

**Default for MVP: same model everywhere** (`pickModelForSubAgent` returns `pickModel(agent.model)` regardless of role).

**Why default same.** One configuration surface to debug. Easier to A/B "is model X better overall."

**If overridden:** `pickModelForSubAgent` consults a per-role map; `agent.model` becomes a default; per-role overrides live in agent settings. Affected: `05-subagents.md` §7, dashboard agent settings UI (`apps/eregna`).

---

## 10. Replay endpoint visibility

**Question.** Who can see past runs? Just the agent owner? Visitors who initiated a run? Anonymous via a share link?

**Default for MVP: agent owner only.** Authenticated through the dashboard's Supabase JWT. Same enforcement as the existing CRUD.

**Why default this.** Visitor-side replay isn't a Phase 1 product need. Anonymous share links touch privacy + access-control design that doesn't need to be MVP work.

**If overridden:** a `share_token` column on `agent_runs`; a public GET that requires the token. Affected: `09-persistence.md` (schema), route auth in `apps/api/src/routes/agent.ts`.

---

## 11. Locking process

For each item above:

1. Pick a value (default or override).
2. If override: edit the affected doc(s) to reflect the locked decision; remove the "Open Questions" entry.
3. Commit the change in a single PR titled `mvp: lock <question N>`.

When all entries here are zero, the spec is frozen and Stage 1 can start (`11-build-order.md`).

---

## 12. Decisions already locked elsewhere (recap)

These were decided in conversation and folded into the docs. Listed for traceability:

| Decision | Where it lives |
|---|---|
| Wire format = JSON Patch over NDJSON via `fast-json-patch` | `06-patcher-and-wire.md` |
| Workflow = LangGraph `StateGraph` from day one | `04-workflow.md` |
| Three sub-agents (Planner, Stepper, Narrator), not one monolithic agent | `04-workflow.md`, `05-subagents.md` |
| Sub-agents use `withStructuredOutput` / `.stream()`, not forced tool calls | `05-subagents.md` §1 |
| Granular patch helpers (1:1 mutation → patch), not a streaming JSON-arg parser | `06-patcher-and-wire.md` §3, `05-subagents.md` §1 |
| `agent_runs` in SQLite via `bun:sqlite`, not Postgres | `09-persistence.md` |
| Walkthrough types extended in `packages/walkthrough-core`, not redesigned | `01-conversation-shape.md` |
| Two play modes (live event-driven, history offset-driven) | `01-conversation-shape.md` §4, `07-engine.md` |
| Host page never has its HTML scraped/fetched by the server | `00-overview.md`, `02-context.md` §1 |
