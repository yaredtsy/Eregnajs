# data/02 — Auth & Ownership

We keep Supabase Auth (Google OAuth + email/password) and drop Supabase RLS in favor of API-side ownership checks. This doc explains the boundary and why.

---

## Why drop RLS

RLS is great when your DB client carries the user's JWT (i.e. `supabase-js` from the browser). It stops working cleanly when:

1. You connect to Postgres with Drizzle via `postgres-js`, which uses a single shared connection string + pool — there's no per-request JWT to bind to `auth.uid()`.
2. Background jobs (embedding generation, the streamer) need to write rows that aren't tied to a logged-in user (the visitor isn't a Supabase user).

Workarounds exist (`set local request.jwt.claim.sub = ...` per transaction) but they fight Drizzle's connection model and add a class of bugs that's expensive in a small team. **Trade-off accepted:** we lose defense-in-depth at the DB layer; we gain a single, testable ownership boundary in the service layer.

---

## Where the trust boundary lives

```
Browser (dashboard)
   │  fetch with Authorization: Bearer <Supabase JWT>
   ▼
Hono `authMiddleware`  ──► supabase.auth.getUser(token)  ──► c.set('userId', user.id)
   │
   ▼
Route handler           ──► calls service with userId
   │
   ▼
Service                 ──► every query joined against ownership
                             (agent.owner_id, page.agent_id → agent.owner_id, ...)
```

`authMiddleware` is the **only** place we trust an external token. After that, every service function takes `userId` as a parameter and either:

1. Filters its query by ownership (`where(eq(agents.ownerId, userId))`), or
2. Calls `assertOwnership(...)` before mutating, which throws a `403` on mismatch.

There is no "service-role bypass" in user-facing endpoints. Service-role-style access is reserved for the **visitor-facing** routes that don't have a user JWT (the SSE stream, the picker postMessage handshake).

---

## Visitor-facing endpoints

`POST /v1/walkthroughs/run` is called from the widget on the customer's site. The visitor is not a Supabase user. The trust boundary here is the **agent's `public_id`** in the request body.

```
POST /v1/walkthroughs/run
{
  "publicId":  "acme-abc123",   // identifies the agent
  "query":     "how do I subscribe?",
  "pageUrl":   "https://acme.com/pricing",
  "visitorId": "optional-opaque-string"
}
```

The walkthrough service:

1. Loads the agent by `publicId`. If `is_active = false`, refuses.
2. Validates that the `Origin` header matches the agent's `website_url` origin. Mismatches return `403` (modulo a dev-mode allowlist for `localhost`).
3. Proceeds without any user JWT.

This is the same trust model as the legacy chat endpoint, just renamed.

---

## `assertOwnership` helper

```ts
// apps/api/src/lib/ownership.ts
import { db, schema } from './db'
import { and, eq } from 'drizzle-orm'

export async function assertAgentOwnership(userId: string, agentId: string) {
  const [row] = await db
    .select({ id: schema.agents.id })
    .from(schema.agents)
    .where(and(eq(schema.agents.id, agentId), eq(schema.agents.ownerId, userId)))
    .limit(1)
  if (!row) throw new HttpError(403, 'Forbidden')
}

export async function assertPageOwnership(userId: string, pageId: string) {
  const [row] = await db
    .select({ id: schema.pages.id })
    .from(schema.pages)
    .innerJoin(schema.agents, eq(schema.agents.id, schema.pages.agentId))
    .where(and(eq(schema.pages.id, pageId), eq(schema.agents.ownerId, userId)))
    .limit(1)
  if (!row) throw new HttpError(403, 'Forbidden')
}
```

`assertElementOwnership` follows the same pattern via the `page → agent → owner` chain.

Every mutating service call begins with one of these. Every list query is filtered by joining against the ownership chain — there is no path where a user could enumerate another user's data.

---

## Auth middleware

```ts
// apps/api/src/middleware/auth.ts
import type { MiddlewareHandler } from 'hono'
import { createClient } from '@supabase/supabase-js'

const supaAdmin = createClient(
  process.env.EREGNA_SUPABASE_URL!,
  process.env.EREGNA_SUPABASE_SERVICE_ROLE_KEY!,
)

declare module 'hono' {
  interface ContextVariableMap { userId: string }
}

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const auth = c.req.header('Authorization')
  if (!auth?.startsWith('Bearer ')) return c.json({ error: 'Unauthorized' }, 401)

  const { data, error } = await supaAdmin.auth.getUser(auth.slice(7))
  if (error || !data.user) return c.json({ error: 'Unauthorized' }, 401)

  c.set('userId', data.user.id)
  await next()
}
```

Supabase admin client is the only Supabase SDK usage in the API. Everything else is Drizzle.

---

## Profiles trigger (kept from legacy)

`auth.users` insert → `public.profiles` insert is still a Postgres trigger. We don't manage `profiles` rows from app code. The trigger SQL is in the first hand-written migration.

---

## Environment variables

| Var | Where | Purpose |
|---|---|---|
| `EREGNA_DATABASE_URL` | API | Drizzle connection string. Use the Supabase **pooler** URL with `?pgbouncer=true&connection_limit=1` for serverless; the direct URL for long-lived Bun processes. |
| `EREGNA_SUPABASE_URL` | API | Supabase project URL. Used by the admin client for JWT verification. |
| `EREGNA_SUPABASE_SERVICE_ROLE_KEY` | API | **Never** in any `VITE_` var. Used only for `auth.getUser()`. |
| `EREGNA_OPENAI_API_KEY` | API | Planner + streamer LLM calls. |
| `VITE_EREGNA_API_URL` | Dashboard | Dashboard → API base URL. |
| `VITE_EREGNA_SUPABASE_URL` / `_ANON_KEY` | Dashboard | Browser auth client only. |
| `VITE_EREGNA_WIDGET_CDN` | Dashboard | Used to render the embed snippet. |

---

## Things we still rely on Supabase for

- **Auth UI** in the dashboard (Google OAuth flow + email/password).
- **`auth.users` storage** and JWT signing.
- **Postgres hosting** itself (pgvector, ltree, connection pooler).

Things we no longer rely on Supabase for:

- RLS policies (dropped).
- Supabase client in API service code (replaced by Drizzle).
- `match_elements` RPC (kept in SQL for Phase 2, unused in MVP).
