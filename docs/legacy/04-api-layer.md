# 04 — API Layer (Bun + Hono)

The API is a standalone **Bun** server using **Hono** as the HTTP framework.  
It lives at `apps/api/` and is the **only** process that holds the service-role Supabase key and the OpenAI key.

---

## Why Bun + Hono?

| Concern | Choice | Reason |
|---------|--------|--------|
| Runtime | Bun | Native TypeScript, fast cold start, built-in `.env` loading |
| Framework | Hono | Minimal, edge-compatible, excellent TypeScript types, first-class SSE |
| Validation | Zod | Schema-first, shared with frontend via `packages/db` |
| Auth | Supabase JWT | Verify `Authorization: Bearer <jwt>` with Supabase Admin |

---

## Package setup

```json
// apps/api/package.json
{
  "name": "api",
  "type": "module",
  "scripts": {
    "dev":   "bun --watch src/index.ts",
    "start": "bun src/index.ts",
    "test":  "bun test"
  },
  "dependencies": {
    "hono":                   "^4.x",
    "@hono/zod-validator":    "^0.x",
    "zod":                    "^3.x",
    "@supabase/supabase-js":  "^2.x",
    "openai":                 "^4.x",
    "@repo/db":               "workspace:*"
  }
}
```

---

## Entry point — `src/index.ts`

```typescript
import { serve } from 'bun'
import { app } from './app.js'

const port = Number(process.env.PORT ?? 4000)

serve({ fetch: app.fetch, port })
console.log(`API listening on http://localhost:${port}`)
```

---

## App factory — `src/app.ts`

```typescript
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { authMiddleware } from './middleware/auth.js'
import { agentsRouter }   from './routes/agents.js'
import { pagesRouter }    from './routes/pages.js'
import { elementsRouter } from './routes/elements.js'
import { chatRouter }     from './routes/chat.js'

export const app = new Hono()

// ── Global middleware ──────────────────────────────────────────────
app.use('*', logger())
app.use('*', cors({
  origin: process.env.EREGNA_CORS_ORIGINS?.split(',') ?? '*',
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
}))

// ── Health ────────────────────────────────────────────────────────
app.get('/health', (c) => c.json({ ok: true, ts: new Date().toISOString() }))

// ── Versioned API ─────────────────────────────────────────────────
const v1 = new Hono()

// Protected routes (JWT required)
v1.use('*', authMiddleware)
v1.route('/agents',   agentsRouter)
v1.route('/pages',    pagesRouter)
v1.route('/elements', elementsRouter)

// Chat is semi-public — verified by agent public_id, not user JWT
// Auth middleware is NOT applied here; chat.ts handles its own token check
app.route('/v1/chat', chatRouter)

app.route('/v1', v1)

export default app
```

---

## Middleware

### `src/middleware/auth.ts`

Extracts the Supabase JWT from `Authorization: Bearer <token>` and injects the verified user into Hono context.

```typescript
import type { MiddlewareHandler } from 'hono'
import { createServerClient } from '@repo/db'

declare module 'hono' {
  interface ContextVariableMap {
    userId: string
  }
}

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const authorization = c.req.header('Authorization')
  if (!authorization?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const token = authorization.slice(7)
  const supabase = createServerClient()

  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  c.set('userId', user.id)
  await next()
}
```

---

## Routes

### `GET /v1/agents`

Returns all agents owned by the authenticated user.

```
Response 200:
{
  "data": [
    {
      "id": "uuid",
      "name": "Acme Docs Agent",
      "website_url": "https://acme.com",
      "public_id": "acme-abc123",
      "is_active": true,
      "created_at": "...",
      "page_count": 12      // joined aggregate
    }
  ]
}
```

### `POST /v1/agents`

Create a new agent.

```
Request body:
{
  "name": "string",           // required
  "website_url": "string",    // required, valid URL
  "description": "string",    // optional
  "model": "gpt-4o-mini",     // optional, default: gpt-4o-mini
  "system_prompt": "string"   // optional
}

Response 201: { "data": { ...agent } }
```

`public_id` is generated server-side as a URL-safe random slug:
```typescript
function generatePublicId(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 20)
  const rand = Math.random().toString(36).slice(2, 8)
  return `${slug}-${rand}`
}
```

### `GET /v1/agents/:id`

Full agent detail (for the agent settings page).

### `PATCH /v1/agents/:id`

Partial update. Accepted fields: `name`, `description`, `model`, `system_prompt`, `is_active`.

### `DELETE /v1/agents/:id`

Soft-delete or hard-delete (cascade). Returns `204`.

---

### `GET /v1/pages?agentId=:agentId`

Returns all pages for an agent as a **flat list with `path` included**.  
The frontend builds the tree from `path` (ltree string) + `parent_id`.

```
Response 200:
{
  "data": [
    {
      "id": "uuid",
      "agent_id": "uuid",
      "path": "root",
      "parent_id": null,
      "title": "Home",
      "url_pattern": "/",
      "sort_order": 0
    },
    {
      "id": "uuid",
      "path": "root.docs",
      "parent_id": "uuid",
      "title": "Documentation",
      "url_pattern": "/docs/*",
      "sort_order": 0
    }
  ]
}
```

### `POST /v1/pages`

```
Request body:
{
  "agent_id": "uuid",         // required
  "parent_id": "uuid|null",   // null = root
  "title": "string",          // required
  "url_pattern": "string",    // optional
  "description": "string",    // optional
  "sort_order": 0             // optional
}
```

Server computes `path` from `parent_id`:
```typescript
async function computePath(parentId: string | null, title: string, db: SupabaseClient) {
  const label = slugifyLabel(title) // replace non-[A-Za-z0-9_] with _
  if (!parentId) return `root_${label}` // or just 'root' for first page

  const { data: parent } = await db.from('pages').select('path').eq('id', parentId).single()
  return `${parent.path}.${label}`
}
```

### `PATCH /v1/pages/:id` — update title, url_pattern, description, sort_order

### `DELETE /v1/pages/:id` — cascades to child pages + elements

---

### `GET /v1/elements?pageId=:pageId`

Returns all elements for a page as a flat list (ltree `path` + `parent_id` included).

```
Response 200:
{
  "data": [
    {
      "id": "uuid",
      "page_id": "uuid",
      "path": "navbar",
      "parent_id": null,
      "label": "Navbar",
      "dom_id": "#main-navbar",
      "css_selector": "nav.main",
      "description": "Top navigation bar...",
      "has_embedding": true
    },
    {
      "id": "uuid",
      "path": "navbar.left_nav",
      "parent_id": "uuid",
      "label": "Left Nav",
      "dom_id": "#left-nav",
      "css_selector": "nav.main ul:first-child",
      "description": "Left side navigation links...",
      "has_embedding": true
    }
  ]
}
```

> **Note**: `embedding` (vector) is never returned to the client — too large and a security risk.

### `POST /v1/elements`

Creates an element and **triggers embedding generation** asynchronously.

```
Request body:
{
  "page_id": "uuid",
  "parent_id": "uuid|null",
  "label": "string",
  "dom_id": "#my-id",         // at least one of dom_id / css_selector required
  "css_selector": "string",
  "description": "string",
  "notes": "string"
}
```

Embedding is generated in the service layer after insert:
```typescript
async function generateAndStoreEmbedding(elementId: string, text: string, db) {
  const openai = new OpenAI()
  const { data } = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
    dimensions: 1536,
  })
  await db.from('elements')
    .update({ embedding: data[0].embedding })
    .eq('id', elementId)
}
```

### `PATCH /v1/elements/:id` — re-generates embedding if `description` changes

### `DELETE /v1/elements/:id` — hard delete

---

### `POST /v1/chat/:agentId` — SSE streaming chat

This is the **widget-facing endpoint**. It does NOT require a user JWT.  
Authentication: the `public_id` in the URL path is the trust boundary.

```
Headers:
  Content-Type: application/json
  Accept: text/event-stream

Request body:
{
  "conversation_id": "uuid|null",   // null = start new conversation
  "message": "How do I reset my password?",
  "page_url": "https://acme.com/login",  // current page of visitor
  "visitor_id": "optional-opaque-string"
}

Response: SSE stream  (Content-Type: text/event-stream)
```

#### SSE event protocol (JSON-Patch over SSE)

Each SSE event carries a JSON-Patch (`application/json-patch+json`) operation  
that the widget applies to its local state object.

```
// State shape the widget maintains:
{
  "conversation_id": null,
  "messages": [],
  "status": "idle"   // "idle" | "thinking" | "streaming" | "done" | "error"
}
```

**Event sequence:**

```
event: patch
data: [{"op":"replace","path":"/status","value":"thinking"}]

event: patch
data: [{"op":"replace","path":"/conversation_id","value":"uuid-abc"}]

event: patch
data: [{"op":"add","path":"/messages/-","value":{"id":"m1","role":"assistant","content":""}}]

event: patch
data: [{"op":"replace","path":"/status","value":"streaming"}]

// Each token:
event: patch
data: [{"op":"replace","path":"/messages/0/content","value":"To reset"}]

event: patch
data: [{"op":"replace","path":"/messages/0/content","value":"To reset your password,"}]

// ... more token patches ...

event: patch
data: [{"op":"replace","path":"/status","value":"done"}]

event: done
data: {}
```

#### Chat handler implementation sketch

```typescript
// routes/chat.ts
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { chatService } from '../services/chat.service.js'

export const chatRouter = new Hono()

chatRouter.post('/:publicId', async (c) => {
  const { publicId } = c.req.param()
  const body = await c.req.json()

  return streamSSE(c, async (stream) => {
    const sendPatch = async (ops: object[]) => {
      await stream.writeSSE({
        event: 'patch',
        data: JSON.stringify(ops),
      })
    }

    try {
      await chatService.run({ publicId, body, sendPatch })
    } catch (err) {
      await sendPatch([{ op: 'replace', path: '/status', value: 'error' }])
    } finally {
      await stream.writeSSE({ event: 'done', data: '{}' })
      stream.close()
    }
  })
})
```

---

## Service layer pattern

Each service module exports a plain object of async functions.  
No classes. No decorators.

```typescript
// services/agent.service.ts
import { createServerClient } from '@repo/db'

export const agentService = {
  async listForUser(userId: string) {
    const db = createServerClient()
    const { data, error } = await db
      .from('agents')
      .select('*, pages(count)')
      .eq('owner_id', userId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data
  },

  async create(userId: string, input: CreateAgentInput) {
    const db = createServerClient()
    const publicId = generatePublicId(input.name)
    const secretKey = crypto.randomUUID()
    const { data, error } = await db
      .from('agents')
      .insert({ ...input, owner_id: userId, public_id: publicId, secret_key: secretKey })
      .select()
      .single()
    if (error) throw error
    return data
  },
  // ... update, delete, getById
}
```

---

## Error handling

All route handlers use a consistent error envelope:

```typescript
// Helper used in every route
function apiError(c: Context, status: number, message: string) {
  return c.json({ error: message }, status)
}
```

Global Hono error handler in `app.ts`:
```typescript
app.onError((err, c) => {
  console.error(err)
  return c.json({ error: 'Internal server error' }, 500)
})

app.notFound((c) => c.json({ error: 'Not found' }, 404))
```

---

## CORS policy

| Origin | Allowed |
|--------|---------|
| Dashboard (`localhost:3000`, production domain) | Full API |
| Widget embed (any origin) | Only `/v1/chat/*` |

Implement per-router CORS in Phase 2. For MVP, the global CORS config is fine.

---

## Scalability notes

- **Stateless**: No in-process session state — everything is in Supabase.
- **Horizontal scale**: Run multiple Bun instances behind a load balancer; SSE connections are ephemeral.
- **Rate limiting**: Add `hono/rate-limiter` per `public_id` in Phase 2.
- **Edge deployment**: Hono is edge-compatible (Cloudflare Workers, Deno Deploy). Switch runtime with zero route changes.
