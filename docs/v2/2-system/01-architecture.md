# 2.1 — System Architecture

> The actors, the surfaces between them, and the trust boundaries. One level more concrete than
> `1-product/`; still no file-level detail (that's levels 4+).

---

## 1. The four actors

```
┌─────────── Host page ───────────┐   ┌────── Widget (shadow DOM) ──────┐
│ <script data-agent-id=…>        │   │ player ── engine ── store       │
│ window.eregna                   │◀──│   ▲          │                  │
│   .setState(...)                │   │   │ patches  │ touches host DOM │
│   .registerTool(...)            │──▶│   │          ▼                  │
│   .addKnowledge(...)   NEW      │   │ runStream    selector resolver  │
│   .ask(...)                     │   └───┬─────────────────────────────┘
└─────────────────────────────────┘       │ NDJSON (public surface)
                                          ▼
┌────────── Dashboard ────────────┐   ┌──────────── API ────────────────┐
│ agents / knowledgebase CRUD     │──▶│ /v1/*        dashboard (JWT)    │
│ playground                      │   │ /public/*    visitor (origin+id)│
│ run replay                      │   │ agent service: context →        │
└─────────────────────────────────┘   │   orchestrator → subagents →    │
                                      │   patcher → transport           │
                                      │ Postgres (KB)  SQLite (runs)    │
                                      └─────────────────────────────────┘
```

## 2. The two API surfaces (the v2 fix)

| Surface | Auth | Consumers | Endpoints |
|---|---|---|---|
| `/v1/*` | Supabase JWT (dashboard session) | dashboard, playground | KB CRUD, runs list/replay, `agent/debug/*` |
| `/public/*` | `public_id` + Origin allowlist + rate limit | embedded widget | `agent/run`, (later) `agent/tool-result` |

This split is non-negotiable #6. The widget never holds a JWT; the dashboard never calls the
public surface. Details in `3-server/06-persistence-and-auth.md`.

## 3. Who writes what

| Actor | Writes | Reads |
|---|---|---|
| Agent service | patches mutating the run's `Conversation` | knowledgebase + request-injected host context |
| Widget store | applies patches; local play state (mode, position) | `Conversation` |
| Engine | step statuses (`done`/`skipped`+reason) — *client-side* | element manifest, host DOM, host tools |
| Host page | state / tools / knowledge, `ask()` | nothing (fire-and-forget) |
| Dashboard | knowledgebase rows | runs, statuses, failures |

Single-writer-per-field is the rule that keeps the patch stream conflict-free: the server owns
content, the client owns playback state. The one shared field is step `status` — server initializes
`pending`, engine flips it locally during play; persisted run snapshots store the *server's* view,
and (later) a client telemetry POST reports what actually happened.

## 4. Trust boundaries (read this twice)

1. **Host page is untrusted by the server.** `hostState`/`hostTools`/`hostKnowledge` arrive in the
   request body — they are *claims*, schema-validated then quoted into prompts as data, never as
   instructions with authority (prompt-injection surface: see `3-server/01` §7).
2. **Server is semi-trusted by the host page.** The widget executes tool calls the model chose —
   but only tools the page itself registered, with args validated against the page's own declared
   schema. The blast radius is what the customer explicitly exposed.
3. **Visitor is anonymous.** Nothing the visitor types grants access to anything but this agent's
   public knowledgebase. Rate limiting is the only thing between you and a token-burning script.
4. **The server never touches the host DOM.** All DOM addressing is client-side via the manifest.

## 5. One run, end to end

```
ask("how do I export invoices?")
  → widget POST /public/agent/run {publicId, pageUrl, query, hostState, hostTools, hostKnowledge}
  → API: origin check → rate limit → composeContext (KB + host claims)
  → graph: enrich (seed message + manifest) → plan (thoughts + chapters)
       → per chapter: steps → per step: narration   [all mutations → patches → NDJSON]
  → widget: applyPatch per frame → player renders (live | buffered)
  → engine per step: resolve key via manifest → scroll → highlight → tool? → advance
       └─ resolution fails → status skipped + message + red segment → continue
  → complete: terminal status patch → run snapshot saved (owner-scoped)
```

Everything below this file zooms into one box of this diagram.
