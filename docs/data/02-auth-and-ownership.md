# data/02 — Auth & Ownership

We keep Supabase Auth (Google OAuth + email/password) and drop Supabase RLS in favor of API-side ownership checks. This doc explains the boundary and why.

---

## Why drop RLS

RLS is great when your DB client carries the user's JWT (i.e. `supabase-js` from the browser, talking to PostgREST). It stops working cleanly when:

1. The API uses a single Supabase JS client with the **service-role key** — there's no per-request user identity bound to `auth.uid()`. The shipped API (`packages/db/src/client.ts → createServerClient()`) does exactly this.
2. Background jobs (embedding generation, the future streamer) need to write rows that aren't tied to a logged-in user (the visitor isn't a Supabase user).

Workarounds exist (`set local request.jwt.claim.sub = ...` per transaction) but they add a class of bugs that's expensive in a small team. **Trade-off accepted:** we lose defense-in-depth at the DB layer; we gain a single, testable ownership boundary in the service layer.

RLS was originally enabled (`supabase/migrations/20250430100008_rls.sql`) and then explicitly disabled in `20250430110000_disable_rls.sql`. The policy SQL is preserved in the earlier migration if we want to re-enable it later.

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

## Visitor-facing endpoints (planned)

`POST /v1/walkthroughs/run` will be called from the widget on the customer's site once it's built. The visitor is not a Supabase user. The trust boundary here will be the **agent's `public_id`** in the request body.

> **As shipped: nothing is visitor-mounted yet.** `POST /v1/sessions` (used by the widget on boot) currently sits *behind* `authMiddleware` and accepts `agent_id` (uuid), not `public_id`. That works during dev because the page that loads the widget already has a logged-in dashboard session, but it's not the real visitor model. Plan: move sessions creation under a separate `/v1/widget/*` mount that accepts `public_id` + origin and skips `authMiddleware`. Sessions list/get/touch stay where they are (dashboard endpoints).

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

## Ownership checks (as shipped)

There is no separate `apps/api/src/lib/ownership.ts`. Each service module owns its own ownership logic:

```ts
// apps/api/src/services/agent.service.ts (shipped)
async getByIdForUser(userId: string, id: string) {
  const { data } = await db
    .from('agents').select('*')
    .eq('id', id).eq('owner_id', userId).maybeSingle()
  return data
}

async assertOwnedByUser(userId: string, agentId: string): Promise<boolean> {
  return (await this.getByIdForUser(userId, agentId)) !== null
}
```

`pageService.getByIdForUser` resolves the chain `page → agent → owner` by chaining two reads (`pages.maybeSingle()` then `agentService.assertOwnedByUser(userId, page.agent_id)`). `elementService.getByIdForUser` does the same one level deeper (`element → page → agent → owner`).

Routes return `404 Not found` on ownership mismatch (not `403`) so probing IDs can't enumerate ownership.

Every mutating service call begins with an ownership check. Every list query is filtered with `.eq('owner_id', userId)` or scoped behind `assertOwnedByUser`. There is no path where a user could enumerate another user's data.

> **Future shape.** Once the chain gets deeper (e.g. walkthrough_steps owned via walkthroughs → session_messages → walkthrough_sessions → agents → users), a single `assertOwnership(userId, table, id)` helper becomes worth extracting. Today the depth maxes out at 3 and the inline approach is readable.

---

## Auth middleware (shipped)

```ts
// apps/api/src/middleware/auth.ts
import type { MiddlewareHandler } from 'hono'
import { createServerClient } from '@repo/db/client'
import { jsonError } from '../lib/http.js'

declare module 'hono' {
  interface ContextVariableMap { userId: string }
}

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const authorization = c.req.header('Authorization')
  if (!authorization?.startsWith('Bearer ')) {
    return jsonError(c, 401, 'Unauthorized')
  }

  const token = authorization.slice(7)
  const supabase = createServerClient()

  const { data: { user }, error } = await supabase.auth.getUser(token)

  if (error || !user) {
    return jsonError(c, 401, 'Unauthorized')
  }

  c.set('userId', user.id)
  await next()
}
```

The middleware uses `createServerClient()` from `packages/db`, the same factory the service layer uses. Supabase JS is the single DB client across the API — there is no separate "Drizzle for data, Supabase for auth" split.

---

## Profiles trigger (kept from legacy)

`auth.users` insert → `public.profiles` insert is still a Postgres trigger. We don't manage `profiles` rows from app code. The trigger SQL is in the first hand-written migration.

---

## Environment variables

| Var | Where | Purpose |
|---|---|---|
| `EREGNA_SUPABASE_URL` | API | Supabase project URL. |
| `EREGNA_SUPABASE_SERVICE_ROLE_KEY` | API | **Never** in any `VITE_` var. Used by `createServerClient()` for both DB access and `auth.getUser()`. |
| `EREGNA_CORS_ORIGINS` | API | Comma-separated allowed origins; falls back to `*` when unset. |
| `EREGNA_OPENAI_API_KEY` | API (planned) | Planner + streamer LLM calls when those land. |
| `VITE_EREGNA_API_URL` | Dashboard | Dashboard → API base URL. |
| `VITE_EREGNA_SUPABASE_URL` / `_SUPABASE_ANON_KEY` | Dashboard | Browser auth client only (sessions / JWT). |
| `VITE_EREGNA_WIDGET_CDN` | Dashboard (planned) | Will be used to render the embed snippet once the IIFE build is hosted. |

---

## Things we still rely on Supabase for

- **Auth UI** in the dashboard (Google OAuth flow + email/password).
- **`auth.users` storage** and JWT signing.
- **Postgres hosting** itself (pgvector, ltree, connection pooler).

Things we no longer rely on Supabase for:

- RLS policies (dropped — see the disable migration referenced above).
- `match_elements` RPC (kept in SQL for Phase 2, unused in MVP).

Things the docs originally said we'd drop Supabase for, but didn't:

- **DB client in API service code.** We're still on `@supabase/supabase-js` via `createServerClient()`. Drizzle was on the roadmap; we picked the lower-overhead path. The trust-boundary reasoning above still holds — service-role key + ownership-in-service-layer is the actual model.
