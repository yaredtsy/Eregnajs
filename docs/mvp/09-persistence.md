# 09 — Persistence (SQLite)

> One new table, `agent_runs`, lives in a **local SQLite database** managed by Bun's built-in `bun:sqlite`. The shipped Supabase Postgres remains for the existing CRUD (`agents`, `pages`, `elements`, etc.); SQLite is added only for run records. Reasons: zero new infra, no Postgres migration coordination, fast local dev, and the run records are write-once / read-by-id — exactly SQLite's sweet spot.

Folder: `apps/api/src/services/agent/runs/`, plus one schema/init file.

---

## 1. Why SQLite (and what we give up)

| Gain                                                                                                | Cost                                                                                                                  |
|-----------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------|
| Zero new infra: a file on disk; no Supabase migration; no network roundtrip per write.              | One file per process; multiple API instances need a shared volume (NFS) or a Phase 2 swap to Postgres.                |
| `bun:sqlite` is built into Bun — **no npm dep**.                                                    | Less Postgres-style tooling (psql, pgAdmin, Supabase Studio); SQLite browser tools cover Phase 1.                     |
| Run-record writes never block the existing Supabase queries.                                        | Two databases to back up. MVP backup = `cp eregna.sqlite eregna.sqlite.bak` cron.                                     |
| Bun's `Database` is synchronous on hot path — sub-millisecond writes for our row sizes.             | No JSON-path queries like Postgres `jsonb`. We store `state_snapshot` / `patch_log` as `TEXT` (serialised JSON). Replay reads the whole row; no field-level queries. |
| Easy to wipe in dev: `rm eregna.sqlite` and restart.                                                | Phase 2 dashboards that want aggregations (avg run length, popular questions) need either an export job or the Postgres migration. |

When we hit "we need multi-instance API" or "we want SQL analytics over runs": migrate to Postgres. The schema is intentionally Postgres-compatible (no SQLite-only features), so the migration is mechanical: copy schema, dump-restore, swap the client.

---

## 2. Schema

```
apps/api/db/schema.sql            -- the single source of truth for the SQLite shape
```

```sql
-- apps/api/db/schema.sql

CREATE TABLE IF NOT EXISTS agent_runs (
  id              TEXT    PRIMARY KEY,                        -- nanoid(10)
  agent_id        TEXT    NOT NULL,                            -- matches agents.id (UUID string)
  conversation_id TEXT,                                        -- nullable in MVP
  visitor_id      TEXT,
  page_url        TEXT,
  query           TEXT    NOT NULL,

  state_snapshot  TEXT    NOT NULL DEFAULT '{}',               -- JSON.stringify(Conversation)
  patch_log       TEXT    NOT NULL DEFAULT '[]',               -- JSON.stringify(PatchFrame[])

  status          TEXT    NOT NULL
                  CHECK (status IN ('streaming','complete','aborted','error')),
  error_message   TEXT,

  started_at      INTEGER NOT NULL,                            -- ms epoch
  completed_at    INTEGER
);

CREATE INDEX IF NOT EXISTS agent_runs_agent_id_started_at
  ON agent_runs(agent_id, started_at DESC);

CREATE INDEX IF NOT EXISTS agent_runs_status_started_at
  ON agent_runs(status, started_at DESC);
```

Notes:
- `id`: a 10-char `nanoid` — fits in a URL, easy to log, no UUID overhead.
- `agent_id`: kept as `TEXT` matching `agents.id` UUID **string form** so a cross-DB join in code is straightforward.
- Timestamps as `INTEGER` ms-epoch. Sortable, comparable, no timezone confusion.
- `state_snapshot` / `patch_log` as `TEXT` (serialised JSON). We don't query inside them in MVP.

No `RLS` concept on SQLite. Ownership enforcement stays in the service layer (consistent with `data/02-auth-and-ownership.md`).

---

## 3. The DB connection

```
apps/api/src/lib/sqlite.ts
```

```ts
import { Database } from "bun:sqlite"

let db: Database | null = null

export function getRunsDb(): Database {
  if (db) return db
  const path = process.env.EREGNA_RUNS_DB_PATH ?? "./eregna-runs.sqlite"
  db = new Database(path, { create: true })
  db.exec("PRAGMA journal_mode = WAL")              // multi-reader, single-writer concurrency
  db.exec("PRAGMA synchronous = NORMAL")            // durability/perf trade-off; ok for runs
  db.exec("PRAGMA foreign_keys = ON")
  initialise(db)
  return db
}

function initialise(db: Database) {
  const schema = Bun.file(new URL("../../db/schema.sql", import.meta.url)).text()
  schema.then(sql => db.exec(sql))                   // synchronous on first call; idempotent (CREATE IF NOT EXISTS)
}
```

A single shared connection. Bun's `Database` is fully synchronous; we don't need a pool. WAL mode lets the dashboard read while the API writes.

The DB file path is read from env so dev / staging / prod can point at different files (or `:memory:` for tests).

---

## 4. The `runs` service

```
apps/api/src/services/agent/runs/
├── types.ts            # AgentRunRow, SaveOpts
├── save.ts             # write row
├── load.ts             # read by id
├── list.ts             # list by agent_id (used by dashboard)
└── index.ts
```

### 4.1 `types.ts`

```ts
import type { Conversation } from "@repo/walkthrough-core"
import type { PatchFrame }   from "../patcher/createPatcher"

export type RunStatus = "streaming" | "complete" | "aborted" | "error"

export interface AgentRunRow {
  id:              string
  agent_id:        string
  conversation_id: string | null
  visitor_id:      string | null
  page_url:        string | null
  query:           string
  state_snapshot:  Conversation               // parsed
  patch_log:       PatchFrame[]               // parsed
  status:          RunStatus
  error_message:   string | null
  started_at:      number                     // ms epoch
  completed_at:    number | null
}

export interface SaveOpts {
  agentId:        string                      // resolved UUID, not publicId
  conversationId?: string
  visitorId?:     string
  pageUrl?:       string
  query:          string
  status:         RunStatus
  conversation:   Conversation
  patchLog:       PatchFrame[]
  errorMessage?:  string
  startedAt:      number                      // ms epoch — captured by the workflow at start
}
```

### 4.2 `save.ts`

One write at the end of the run. The row is INSERTed wholesale; no per-frame writes in MVP (the patch log is captured in memory until the row lands).

```ts
import { nanoid } from "nanoid"
import { getRunsDb } from "../../lib/sqlite"
import type { SaveOpts } from "./types"

const STMT = `
  INSERT INTO agent_runs (
    id, agent_id, conversation_id, visitor_id, page_url, query,
    state_snapshot, patch_log, status, error_message,
    started_at, completed_at
  ) VALUES ($id, $agentId, $convId, $visId, $url, $query,
            $snap, $log, $status, $err,
            $startedAt, $completedAt)
`

export function save(opts: SaveOpts): string {
  const db = getRunsDb()
  const id = nanoid(10)
  db.prepare(STMT).run({
    id,
    agentId:     opts.agentId,
    convId:      opts.conversationId ?? null,
    visId:       opts.visitorId ?? null,
    url:         opts.pageUrl ?? null,
    query:       opts.query,
    snap:        JSON.stringify(opts.conversation),
    log:         JSON.stringify(opts.patchLog),
    status:      opts.status,
    err:         opts.errorMessage ?? null,
    startedAt:   opts.startedAt,
    completedAt: Date.now(),
  })
  return id
}
```

Bun's `prepare(...).run({...})` uses named bindings; ~30 µs per call for rows of our size.

Called from `apps/api/src/services/agent/run.ts` (`04-workflow.md` §6):

```ts
const startedAt = Date.now()
try {
  await graph.invoke(initialState, { signal })
  runs.save({
    agentId: ctx.agent.id, query: opts.query, status: "complete",
    conversation, patchLog: patcher.getLog(),
    visitorId: opts.visitorId, pageUrl: opts.pageUrl,
    startedAt,
  })
} catch (err) {
  helpers.failWalkthrough(conversation, errorMessage(err))
  await patcher.emit()
  runs.save({
    agentId: ctx.agent.id, query: opts.query,
    status: signal.aborted ? "aborted" : "error",
    conversation, patchLog: patcher.getLog(),
    visitorId: opts.visitorId, pageUrl: opts.pageUrl,
    errorMessage: errorMessage(err),
    startedAt,
  })
  throw err
}
```

`runs.save` is synchronous (Bun's API is sync). Total time: well under 1 ms for our row sizes; not worth `await`-ing in a separate microtask.

### 4.3 `load.ts`

```ts
import { getRunsDb } from "../../lib/sqlite"
import type { AgentRunRow } from "./types"

const STMT = `SELECT * FROM agent_runs WHERE id = $id`

export function load(id: string): AgentRunRow | null {
  const row = getRunsDb().prepare(STMT).get({ id }) as RawRow | undefined
  if (!row) return null
  return hydrate(row)
}

function hydrate(r: RawRow): AgentRunRow {
  return {
    ...r,
    state_snapshot: JSON.parse(r.state_snapshot),
    patch_log:      JSON.parse(r.patch_log),
  }
}
```

### 4.4 `list.ts`

```ts
const STMT = `
  SELECT id, agent_id, query, status, started_at, completed_at
  FROM agent_runs
  WHERE agent_id = $agentId
  ORDER BY started_at DESC
  LIMIT $limit OFFSET $offset
`

export function listByAgent(agentId: string, limit = 50, offset = 0): AgentRunListItem[] {
  return getRunsDb().prepare(STMT).all({ agentId, limit, offset }) as AgentRunListItem[]
}
```

`AgentRunListItem` omits the heavy JSON blobs — the dashboard list view doesn't need them.

---

## 5. History-mode replay (the widget reading a snapshot)

A thin route returns the deserialised row:

```ts
// apps/api/src/routes/agent.ts
app.get("/v1/agent/runs/:id", async (c) => {
  const row = runs.load(c.req.param("id"))
  if (!row) return c.json({ error: "not found" }, 404)
  // Ownership check: row.agent_id must belong to authenticated user (Supabase JWT)
  await assertAgentOwnership(c.get("userId"), row.agent_id)
  return c.json({ data: row })
})
```

Client:

```ts
const run = await fetch(`/v1/agent/runs/${id}`).then(r => r.json())
dispatch({ type: "SET_CONVERSATION", conversation: run.data.state_snapshot })
dispatch({ type: "SET_PLAY_MODE",    playMode: "history" })
dispatch({ type: "PLAY_WALKTHROUGH", walkthroughId: firstWalkthroughOf(run.data.state_snapshot) })
```

The existing `usePlayer` rAF tick then animates the walkthrough — same path as `sample-conversation.ts` today.

---

## 6. Phase 2 — resume-on-reconnect

```
GET /v1/agent/runs/:id/stream?fromSeq=N
  → if status terminal: NDJSON of patch_log[seq>N], stream ends
  → if status === 'streaming': NDJSON of patch_log[seq>N], then re-attaches the live writer
```

For the live re-attach case, the in-process `Patcher` instance for that run must be discoverable by id. MVP: not implemented. The schema already supports it (`patch_log`, `status` enum).

---

## 7. Storage sizing

Per row, typical (Phase 1):
- `state_snapshot`: 8–20 KB.
- `patch_log`: 30–80 KB.
- Total: ~50–100 KB.

At 10K runs/day per customer: ~1 GB/day across the SQLite file. SQLite handles single files into the hundreds of GB without drama; Phase 2 compaction (truncate patch_log past a deadline) lands when median file size > 50 GB.

---

## 8. Multi-instance + concurrency

WAL mode permits unbounded concurrent readers and one writer. For multiple `apps/api` instances:
- **Single-instance MVP** is the recommended setup.
- **Multi-instance** path: put the SQLite file on a shared volume *or* migrate to Postgres. Don't try to multi-write the SQLite file from N processes — that's not what it's for.

This is a deliberate boundary. The day we need multi-instance, we migrate the table to Postgres (≤ 1 day of work given the Postgres-compatible schema).

---

## 9. Backups, retention, privacy

- **Backup**: `apps/api` cron command runs `cp eregna-runs.sqlite eregna-runs.sqlite.bak.<date>` daily. Off-site sync (S3 etc.) is operator-configured.
- **Retention**: 90 days. Cron: `DELETE FROM agent_runs WHERE started_at < ?`.
- **Privacy**: `state_snapshot` holds visitor queries + the live `hostState` snapshot. Same considerations as Postgres-based design; SQLite doesn't change them.

---

## 10. Failure modes

| Failure                                       | Behaviour                                                                            |
|-----------------------------------------------|--------------------------------------------------------------------------------------|
| Disk full                                     | Save throws; logged. The visitor's experience is unaffected (the run already streamed). |
| File locked by a stale writer (shouldn't happen with WAL) | `SQLITE_BUSY` error logged; retry once with backoff. |
| `JSON.parse` of `state_snapshot` fails        | Hydration throws; route returns 500. Means the row was corrupted at write time — should be unreachable. |
| Replay endpoint called for an in-flight run   | Returns the partial `patch_log` so far (and `status === 'streaming'`). Phase 2 also re-attaches live. |

---

## 11. Module file list

```
apps/api/
├── db/
│   └── schema.sql                  # CREATE TABLE etc.
└── src/
    ├── lib/
    │   └── sqlite.ts               # getRunsDb()
    └── services/agent/runs/
        ├── types.ts
        ├── save.ts
        ├── load.ts
        ├── list.ts
        └── index.ts
```

`sqlite.ts` < ~25 LOC. `save.ts` ~40 LOC. `load.ts` ~25 LOC. `list.ts` ~15 LOC. Schema file ~25 lines of SQL.

---

## 12. Why this isn't `Drizzle` or another ORM

`bun:sqlite` is small, fast, and built into the runtime we already use. A typed ORM for one table (whose two big columns are stringified JSON) adds layers without benefit. When we promote to Postgres, the conversation re-opens — Drizzle is the leading candidate then (consistent with the deferred plan in `docs/01-folder-structure.md`).

---

## 13. References

- `04-workflow.md` — call sites for `runs.save`.
- `06-patcher-and-wire.md` — `Patcher.getLog()` returns the `PatchFrame[]` we persist.
- `01-conversation-shape.md` — shape of `state_snapshot`.
- `10-libraries.md` — `bun:sqlite` is built-in; no new dep.
