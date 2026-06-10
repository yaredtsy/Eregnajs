# 1.3 — MVP Scope

> What ships in v2's MVP, what explicitly waits, and the seam each deferred item plugs into.
> Scope discipline is the difference between "learning project that ships" and "rewrite #3".

---

## In scope (MVP)

### Customer side
- Create agent; knowledgebase CRUD: site facts, pages, components **with selector queries**
  (domId / css / text strategies, ordered).
- Embed snippet with `public_id`; per-agent **allowed origins** list.
- **Playground**: fake host page + state/tools/knowledge panels + per-subsystem debug runs.
- Run list + replay (history mode) + per-step failure visibility.

### Visitor side
- Ask via widget; receive streamed walkthrough.
- **Player v2**: detached input bar, chapter-segmented timeline (hover-grow + title), thinking
  ticker + plan display, live / buffered("play on demand") / history playback.
- Step recovery: component not found → inline message + red segment + auto-continue.

### Agent side
- Five context sources (facts, pages, components, hostState/hostTools/hostKnowledge).
- Planner → Stepper → Narrator under the deterministic graph, with **retries and chapter-level
  degradation**.
- Tool *invocation* (fn + api kinds), args validated against declared parameters. Results are
  **not** fed back to the model yet.
- Thoughts streamed as document fields.
- Public run endpoint (origin-checked, rate-limited); debug endpoints (owner-only).

## Out of scope (with its seam)

| Deferred | Seam that already exists for it |
|---|---|
| Multi-turn memory | `conversationHistory` context source returns empty; flip to non-empty |
| Tool-result round-trip into the model | `tool-result` POST + `waitForToolResult` node, designed in `3-server/04` §5 |
| Embedding retrieval over components/facts | context source swap: `loadAll` → `retrieveTopK` (`3-server/01` §6) |
| Second LLM provider | `llm/provider.ts` factory; one new file |
| Per-subagent model split | locked: same model MVP; map lives in `subagents/types.ts` when needed |
| Anonymous run share links | `share_token` column + public GET |
| Analytics dashboard | runs table already records statuses per step |
| Visual selector picker (point-and-click capture) | dashboard-only feature; manifest shape unchanged |

## Non-negotiables carried from v1 (still true)

1. JSON Patch over NDJSON is the only wire format.
2. The orchestrator never calls an LLM.
3. The server never fetches the host's HTML.
4. Walkthrough types live in `packages/walkthrough-core`; widget re-exports.
5. One Conversation shape serves live, buffered, and history playback.

## New non-negotiables in v2

6. **Visitor traffic never touches dashboard auth.** Public surface is separate and origin-checked.
7. **The LLM emits component keys, never selectors.** Addressing belongs to the engine via the
   element manifest.
8. **Every failure is a visible state, not an exception.** Steps skip, chapters degrade, runs end
   with a terminal status patch.
9. **Anything the model saw must be reproducible** — debug endpoints can replay any single
   subagent call with the exact prompt.

## MVP acceptance test (the one demo that proves it)

On the playground page: inject state `{plan: "free"}`, register the `openDialog` tool and one
hostKnowledge fact, ask *"how do I upgrade my plan?"* → the agent plans 3 chapters (one targeting
a dialog-only component), the player streams with thoughts ticking, the dialog opens via tool
call, one deliberately-removed component produces a red segment + message while the run continues,
and the finished run replays from the dashboard identically.
