# api/01 — Routes

Hono on Bun. All routes are versioned under `/v1/`. Two categories:

- **User routes** — require Supabase JWT. Used by the dashboard. Mounted under `/v1/` behind `authMiddleware`.
- **Visitor routes** — no JWT. Authenticated by the agent's `public_id` + `Origin` header. Mounted under `/v1/walkthroughs/`.

See `data/02-auth-and-ownership.md` for the trust model.

---

## App factory

```ts
// apps/api/src/app.ts
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { authMiddleware } from './middleware/auth'
import { agentsRouter } from './routes/agents'
import { pagesRouter } from './routes/pages'
import { elementsRouter } from './routes/elements'
import { walkthroughsRouter } from './routes/walkthroughs'

export const app = new Hono()

app.use('*', logger())
app.use('*', cors({
  origin: process.env.EREGNA_CORS_ORIGINS?.split(',') ?? '*',
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
}))

app.get('/health', (c) => c.json({ ok: true }))

// Visitor route — no auth middleware
app.route('/v1/walkthroughs', walkthroughsRouter)

// User routes — JWT required
const v1 = new Hono()
v1.use('*', authMiddleware)
v1.route('/agents',   agentsRouter)
v1.route('/pages',    pagesRouter)
v1.route('/elements', elementsRouter)
app.route('/v1', v1)

app.onError((err, c) => {
  console.error(err)
  return c.json({ error: err.message ?? 'Internal error' }, err.status ?? 500)
})
```

---

## `GET /v1/agents`

Returns agents owned by the caller, with aggregate counts.

```ts
// services/agent.service.ts
async listForUser(userId: string) {
  return db.select({
    id: agents.id,
    name: agents.name,
    websiteUrl: agents.websiteUrl,
    publicId: agents.publicId,
    isActive: agents.isActive,
    pageCount: sql<number>`(select count(*) from pages where pages.agent_id = ${agents.id})`,
    elementCount: sql<number>`(
      select count(*) from elements e
      join pages p on p.id = e.page_id
      where p.agent_id = ${agents.id})`,
  })
  .from(agents)
  .where(eq(agents.ownerId, userId))
  .orderBy(desc(agents.createdAt))
}
```

`secret_key` is never selected.

## `POST /v1/agents`

Body: `{ name, websiteUrl, description?, model?, systemPrompt? }`. Server generates `publicId` and `secretKey`.

## `GET|PATCH|DELETE /v1/agents/:id`

Every handler calls `assertAgentOwnership(userId, id)` first.

---

## `GET /v1/pages?agentId=...`

Returns the flat list of pages for one agent, ordered by `path`. The dashboard reconstructs the tree from `path` + `parentId`.

## `POST /v1/pages`

```
{
  "agentId":    "uuid",
  "parentId":   "uuid" | null,
  "title":      "Pricing",
  "urlPattern": "https://acme.com/pricing",
  "description": "..."
}
```

Server:
- `assertAgentOwnership(userId, agentId)`
- Validates `urlPattern` origin matches `agent.websiteUrl` origin.
- Slugifies `title` → label.
- Computes `path` from parent's path + label. First page with no parent gets path `root`.
- Inserts.

## `PATCH|DELETE /v1/pages/:id`

`assertPageOwnership` first. Moving a page (changing `parentId`) recomputes `path` for the page and **all its descendants** in a single transaction.

---

## `GET /v1/elements?pageId=...`

Flat list with `path`, `parentId`, `dom_id`, `css_selector`, `xpath`, `description`, `register_intent`. `embedding` is **never** returned.

## `POST /v1/elements`

```
{
  "pageId":         "uuid",
  "parentId":       "uuid" | null,
  "label":          "Subscribe button",
  "domId":          "#pro-subscribe",
  "cssSelector":    ".pricing-card.pro button.subscribe",
  "description":    "...",
  "registerIntent": ["subscribe to pro"]
}
```

Server checks: at least one of `domId / cssSelector / xpath` present.

## `PATCH|DELETE /v1/elements/:id`

Same ownership chain. In Phase 2, a description change kicks off async embedding generation.

---

## `POST /v1/walkthroughs/run` — the streaming endpoint

The whole point of the product. Visitor-facing, no JWT.

```
Headers
  Content-Type: application/json
  Accept:       text/event-stream
  Origin:       https://acme.com               ← validated against agent.websiteUrl

Body
{
  "publicId":      "acme-abc123",
  "query":         "how do I subscribe to Pro?",
  "pageUrl":       "https://acme.com/pricing",
  "visitorId":     "anon-7f3...",                ← optional, opaque
  "resumeSessionId": "uuid" | null               ← present when branching from pause
}
```

Response: `Content-Type: text/event-stream`. Event protocol detailed in `api/02-streaming-protocol.md`.

Handler skeleton:

```ts
// routes/walkthroughs.ts
walkthroughsRouter.post('/run', async (c) => {
  const body = await c.req.json()
  const origin = c.req.header('Origin') ?? ''

  return streamSSE(c, async (stream) => {
    const session = await walkthroughService.startSession({ ...body, origin })

    try {
      // 1. planner — sync, produces { pickedPageId, planOutline }
      await walkthroughService.plan(session, async (event) => {
        await stream.writeSSE({ event: event.kind, data: JSON.stringify(event.data) })
      })

      // 2. streamer — emits Step objects as the LLM produces them
      await walkthroughService.stream(session, async (step) => {
        await stream.writeSSE({ event: 'step', data: JSON.stringify(step) })
      })

      await stream.writeSSE({ event: 'done', data: '{}' })
    } catch (err) {
      await stream.writeSSE({ event: 'error', data: JSON.stringify({ message: err.message }) })
    } finally {
      await walkthroughService.endSession(session.id)
      stream.close()
    }
  })
})
```

Persistence to `walkthrough_sessions` and `walkthrough_steps` happens inside `walkthroughService` — see `agent/01-planning-pipeline.md`.

---

## Error envelope

Every JSON error response: `{ "error": "human message" }` with the appropriate HTTP status. The SSE stream uses `event: error` with a JSON body of the same shape.

---

## Rate limiting (Phase 2)

Defer. Add `hono/rate-limiter` keyed on `publicId` for `/v1/walkthroughs/run` and on `userId` for `/v1/*` once we see the first abuse.
