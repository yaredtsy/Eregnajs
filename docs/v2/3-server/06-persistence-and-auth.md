# 3.6 — Persistence & Auth

> The two ship-blockers (review items #1, #2) get their design here, plus where data lives.

> **What you're learning here:** multi-tenant auth surfaces — why "who is calling" has three
> different answers (owner, embedder, visitor) needing three different mechanisms; and choosing a
> source of truth per question instead of per table.

---

## 1. The three callers

| Caller | Proves identity by | May do |
|---|---|---|
| **Owner** (dashboard) | Supabase JWT | CRUD their agents/KB; read their runs; debug endpoints |
| **Embedder** (customer's site) | `public_id` in script tag + page **Origin** | nothing directly — it configures what visitors can trigger |
| **Visitor** (anonymous) | nothing — inherits the embedder's standing | `POST /public/agent/run` for that agent, within rate limits |

v1 conflated all three behind JWT (`app.ts:28`), which is why the embed can't work. The
`secret_key` column maps to a *fourth*, future caller — the customer's **backend** (mint visitor
tokens, server-side KB sync). Leave the column; document it as reserved.

## 2. The public surface (fix #1)

```
POST /public/agent/run        body: { publicId, pageUrl, query, hostState?, hostTools?, hostKnowledge?, visitorId? }
```

Admission checks, in order, all before any LLM spend:
1. `publicId` resolves to an active agent → else 404 (don't distinguish missing/inactive).
2. `Origin` header ∈ `agents.allowed_origins` (new `text[]` column; dashboard manages; supports
   `localhost:*` for development). No Origin (curl) → reject in prod, allow in dev mode.
3. Rate limit (token bucket, in-memory per instance, MVP): per `publicId` 30 runs/min, per
   IP 6 runs/min. Headers `X-RateLimit-*` on 429.
4. Body Zod-validated with the size caps from `2-system/02` §6.

Honest threat model: Origin is spoofable by non-browser clients — combined with rate limits it
prevents *casual* freeloading (someone else embedding your agent), not determined abuse. Signed
short-lived tokens minted via `secret_key` are the real fix, deferred until a customer needs it.

## 3. Ownership scoping (fix #2)

Every run query joins through ownership: `loadRun(id, ownerId)`, `listRuns(agentId, ownerId)` —
the agent row's `owner_id` must match the JWT's user. No "load by id alone" function *exists* in
`runs/` after this fix; make the safe path the only path.

## 4. Where data lives (one truth per question)

| Question | Source of truth |
|---|---|
| What does the agent know? (KB: facts/pages/components) | **Postgres** (Supabase, RLS as today) |
| What happened in run X? (full document, thoughts, manifest, statuses) | **run snapshot** — SQLite `agent_runs` for MVP |
| Which runs exist / failed lately? | SQLite `agent_runs` (id, agent_id, status, created_at, failure counts) |

Resolved tension from v1: the Postgres `conversations`/`messages` tables overlap with run
snapshots. **Decision:** run snapshots are the only record of agent output in MVP; the legacy
`messages` table is not written by the agent path (leave it for the old chat CRUD until removed).
Two stores writing the same fact is how replay bugs are born.

SQLite is fine for MVP (single API instance). The `runs/` module signature is the seam
(`2-system/03` §5); migrate to Postgres when analytics needs joins, not before.

```sql
-- agent_runs (SQLite), v2 columns
id TEXT PK, agent_id TEXT, owner_id TEXT, visitor_id TEXT,
status TEXT,            -- complete | error
page_url TEXT, query TEXT,
snapshot TEXT,          -- final Conversation JSON (incl. manifest + thoughts)
truncation_count INT, failed_chapters INT, skipped_steps INT,   -- budget/failure telemetry (3.1 §5)
created_at INT, duration_ms INT, tokens_in INT, tokens_out INT
```

`owner_id` is denormalized in on purpose — SQLite can't join to Postgres; copy the value at save
time and scope queries on it.

## 5. Visitor identity (MVP-minimal)

`visitorId`: random UUID minted by the widget, persisted in `localStorage`, sent with every run.
No auth value — it exists so (a) rate limiting has a second key, (b) future multi-turn history has
a join key. Never put trust in it.

## 6. Privacy note (don't skip)

`hostState` can contain user PII (the customer decides what to inject). It lands in prompts and in
run snapshots. MVP stance, documented for customers: "don't inject secrets; state is retained in
run history." A `redactKeys` option on the embed config is cheap and worth adding early.
