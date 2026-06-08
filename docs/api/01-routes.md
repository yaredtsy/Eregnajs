# api/01 — Routes

Hono on Bun. All routes are versioned under `/v1/`. Today every `/v1/*` route is JWT-gated — the visitor-facing walkthrough endpoint is on the roadmap but not yet shipped.

- **User routes** — require Supabase JWT. Used by the dashboard. Mounted under `/v1/` behind `authMiddleware`.
- **Visitor routes (planned)** — would not carry a JWT; authenticated by the agent's `public_id` + `Origin` header. The streaming endpoint will live under `/v1/walkthroughs/`. See `data/02-auth-and-ownership.md` for the trust model.

The widget *does* call one endpoint today — `POST /v1/sessions` — but it currently sends an `Authorization: Bearer …` header from the embedding page's logged-in session, which is fine for dev but is not the visitor model. When real visitors land, sessions creation moves under the visitor mount and the agent identifier is `public_id`, not `agent_id`.

---

## App factory

```ts
// apps/api/src/app.ts
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { authMiddleware } from './middleware/auth.js'
import { agentsRouter } from './routes/agents.js'
import { elementsRouter } from './routes/elements.js'
import { pagesRouter } from './routes/pages.js'
import { sessionsRouter } from './routes/sessions.js'

export const app = new Hono()

app.use('*', logger())

const corsOrigins = process.env.EREGNA_CORS_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean)
app.use('*', cors({
  origin: corsOrigins?.length ? corsOrigins : '*',
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
}))

app.get('/health', (c) => c.json({ ok: true, ts: new Date().toISOString() }))

const v1 = new Hono()
v1.use('*', authMiddleware)
v1.route('/agents',   agentsRouter)
v1.route('/pages',    pagesRouter)
v1.route('/elements', elementsRouter)
v1.route('/sessions', sessionsRouter)
app.route('/v1', v1)

app.onError((err, c) => {
  console.error(err)
  return c.json({ error: 'Internal server error' }, 500)
})

app.notFound((c) => c.json({ error: 'Not found' }, 404))
```

Auth middleware verifies the bearer token via `supabase.auth.getUser(token)` and writes `userId` onto the Hono context. There is no service-role escalation step — the `createServerClient()` factory already uses the service-role key, so RLS is irrelevant once a request is past auth middleware.

---

## `GET /v1/agents`

Returns agents owned by the caller with a `page_count` aggregate.

```ts
// services/agent.service.ts
async listForUser(userId: string): Promise<AgentListItem[]> {
  const db = createServerClient()
  const { data, error } = await db
    .from('agents')
    .select('*, pages(count)')
    .eq('owner_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []).map(mapAgentListRow)   // flattens pages[0].count → page_count
}
```

`secret_key` is included on the row (the dashboard's Embed tab renders it through `CopyField` with `masked`). If you build a public agent list endpoint later, strip it explicitly there.

## `POST /v1/agents`

Body:

```ts
{
  name:           string             // 2..80
  website_url:    string             // valid URL
  description?:   string | null      // ≤ 500
  model?:         'gpt-4o-mini' | 'gpt-4o' | 'claude-3-5-haiku'
  system_prompt?: string | null      // ≤ 2000
}
```

The service generates `public_id` via `generatePublicId(name)` (slug + 6 random chars) and `secret_key` via `crypto.randomUUID()`. Response is the full row plus `page_count: 0`.

## `GET|PATCH|DELETE /v1/agents/:id`

`PATCH` accepts `{ name?, description?, model?, system_prompt?, is_active? }` and rejects empty bodies. `DELETE` cascades pages/elements via FKs. Every handler scopes the query by `owner_id = userId` — there is no separate `assertAgentOwnership` helper today; ownership is enforced by the `.eq('owner_id', userId)` clause being present on every read/write.

---

## `GET /v1/pages?agentId=…`

Query param `agentId` (uuid). The handler first checks `agentService.assertOwnedByUser(userId, agentId)`; on failure it returns `404 Not found` (not `403`) so probing IDs can't enumerate ownership.

## `POST /v1/pages`

```ts
{
  agent_id:     string (uuid)
  parent_id?:   string (uuid) | null
  title:        string (1..200)
  url_pattern?: string | null
  description?: string | null
  sort_order?:  number
}
```

Server:
- `assertOwnedByUser(userId, agent_id)` — throws `Agent not found` (mapped to 404).
- Computes `path` via `computePagePath` (slugify title, attach to parent's path, collide-resolve with a random suffix).
- No URL-origin check yet — the original design said "validate `url_pattern` origin matches `agent.website_url` origin." Worth adding when we start filtering walkthroughs by URL.

## `PATCH|DELETE /v1/pages/:id`

`PATCH` accepts `{ title?, url_pattern?, description?, sort_order? }`. Note: **changing `parent_id` is not exposed** — the path-recomputation transaction described in the original design isn't implemented. Drag-to-reparent in the dashboard is therefore Phase 2.

---

## `GET /v1/elements?pageId=…`

Returns the full element list for the page (no flat-vs-tree transformation server-side). Each row has `has_embedding: boolean` derived from the nullable `embedding` column; the raw embedding value is never returned.

## `POST /v1/elements`

```ts
{
  page_id:       string (uuid)
  parent_id?:    string (uuid) | null
  label:         string (1..200)
  dom_id?:       string | null     // one of these two is required
  css_selector?: string | null
  description?: string | null
  notes?:       string | null
  sort_order?:  number
}
```

Validator enforces `dom_id || css_selector` via a Zod `.refine`. No `xpath` field today.

## `PATCH|DELETE /v1/elements/:id`

Same ownership chain (element → page → agent → user). `PATCH` accepts the same field set as `POST` minus required label, plus `sort_order`. Reparenting (`parent_id` change) is not exposed for the same reason as pages.

---

## `GET /v1/sessions?agentId=…` — visitor sessions list

Used by the Embed tab on the dashboard to show recent visitors per agent. Ownership-gated by `agentId`. Returns up to 50 sessions, newest first.

```ts
type SessionItem = {
  id:             string
  agent_id:       string
  visitor_id:     string | null
  page_url:       string | null
  created_at:     string
  last_active_at: string
}
```

## `POST /v1/sessions` — create session

Used by the widget on boot to register a session. Body:

```ts
{
  agent_id:      string (uuid)
  visitor_id?:   string | null
  page_url?:     string | null
  visitor_meta?: Record<string, unknown> | null   // cast to Json on insert
}
```

> **Not yet visitor-mounted.** This is currently behind `authMiddleware`. When we add the public widget flow, this route will move to a sibling mount (`/v1/widget/sessions`) keyed on `public_id`, and the auth contract switches from JWT to "origin matches agent's `website_url`."

## `GET /v1/sessions/:id`

Single session lookup. No ownership check on this route (returns 404 only if the row is missing). Worth tightening if/when sessions hold sensitive state.

## `POST /v1/sessions/:id/touch`

Updates `last_active_at = now()`. 204 No Content. Cheap heartbeat the widget pings on activity so we can compute "active session" counts later.

---

## `POST /v1/walkthroughs/run` — *planned, not shipped*

The streaming endpoint described in the original design. Not implemented:

- No `routes/walkthroughs.ts` exists.
- The planner + streamer services (LLM calls #1 and #2) are not implemented.
- The widget currently plays `packages/widget/src/data/sample-conversation.ts` — a hard-coded sample — to validate the UI layer.

When this lands, it will:

1. Mount under `/v1/walkthroughs` *outside* the JWT-gated `v1` group.
2. Validate the request's `Origin` against `agents.website_url`.
3. Start a `walkthrough_sessions` row (or attach to an existing one via `resumeSessionId`).
4. Insert a user `session_messages` + `message_text_parts` for the query.
5. Run the planner to pick a page + plan outline.
6. Insert an assistant `session_messages` + a `walkthroughs` row.
7. Stream `walkthrough_steps` rows as the LLM emits them; mirror each one to an SSE `step` event.
8. On finish: set `walkthroughs.stream_status = 'closed'`.

See `agent/02-pipeline.md` for the planner/streamer split.

---

## Error envelope

`apps/api/src/lib/http.ts` exposes `jsonError(c, status, message)` which writes `{ error: string }` at the given status. The global `onError` swallows the exception detail and returns `{ error: 'Internal server error' }` with a 500 — change this if you want stack-trace exposure in dev (gate on `NODE_ENV`).

---

## Rate limiting (Phase 2)

Defer. Add `hono/rate-limiter` keyed on `public_id` for `/v1/walkthroughs/run` and on `userId` for `/v1/*` once we see the first abuse.
