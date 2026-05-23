# 03 — Supabase Setup

This document covers how to bootstrap the Supabase project from scratch,  
run migrations in order, configure extensions, and set up environment variables.

---

## Prerequisites

| Tool | Version |
|------|---------|
| Supabase CLI | ≥ 1.200 |
| Docker Desktop | ≥ 4.x (for local dev) |
| Node / Bun | Node 18+ / Bun 1.1+ |

Install the CLI:
```bash
brew install supabase/tap/supabase
```

---

## Local development bootstrap

```bash
# From repo root
supabase init          # creates supabase/ config dir (first time only)
supabase start         # pulls & starts local Postgres + Auth + Storage + Studio
```

After `supabase start` you'll see:

```
API URL:      http://127.0.0.1:54321
DB URL:       postgresql://postgres:postgres@127.0.0.1:54322/postgres
Studio URL:   http://127.0.0.1:54323
anon key:     eyJ...
service_role: eyJ...
```

Store these in `apps/api/.env` and `apps/eregna/.env` (see Environment Variables below).

---

## Migration files

Schema migrations live in **`supabase/migrations/`** (Supabase CLI default).  
Filenames are timestamp-prefixed so ordering is stable in git.

```bash
# Fresh local database: run all migrations + supabase/seed.sql
supabase db reset

# Apply only migrations not yet recorded (keeps data)
supabase db push --local
```

Optional one-off:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -f supabase/migrations/20250430100001_extensions.sql
```

### Migration order

| File | Purpose |
|------|---------|
| `20250430100001_extensions.sql` | Enable `uuid-ossp`, `ltree`, `vector` |
| `20250430100002_profiles.sql` | `profiles` table + auth trigger |
| `20250430100003_agents.sql` | `agents` table |
| `20250430100004_pages.sql` | `pages` table + ltree indexes |
| `20250430100005_elements.sql` | `elements` table + vector column + IVFFlat index |
| `20250430100006_conversations.sql` | `conversations` + `messages` tables |
| `20250430100007_functions.sql` | `match_elements()`, `set_updated_at()` |
| `20250430100008_rls.sql` | All RLS policies (kept separate for clarity) |

**Dev sample rows** (Acme agent + pages/elements when a profile already exists) live in **`supabase/seed.sql`**. That file runs after migrations on `supabase db reset` only; it is not part of `supabase db push` to hosted projects unless you rely on the same seed remotely.

---

## `0001_extensions.sql`

```sql
create extension if not exists "uuid-ossp";
create extension if not exists ltree;
create extension if not exists vector;
```

> **Note**: `vector` requires pgvector to be enabled in your Supabase project.  
> In the Supabase dashboard → Database → Extensions → search "vector" → Enable.

---

## `packages/db` package structure

```
packages/db/
├── src/
│   ├── client.ts          # createBrowserClient / createServerClient factory
│   ├── types.ts           # Database type (generated or hand-maintained)
│   └── seed.ts            # Helpers to insert dev seed data (Auth + DB)
└── package.json
```

SQL schema lives next to the Supabase CLI config:

```
supabase/
├── migrations/            # versioned schema (see table above)
├── seed.sql                 # optional local sample data after db reset
└── config.toml
```

### `src/client.ts`

```typescript
import { createClient } from '@supabase/supabase-js'
import type { Database } from './types.js'

// Browser client (uses anon key — RLS enforced)
export function createBrowserClient() {
  return createClient<Database>(
    process.env.VITE_EREGNA_SUPABASE_URL!,
    process.env.VITE_EREGNA_SUPABASE_ANON_KEY!,
  )
}

// Server / API client (uses service-role key — RLS bypassed)
export function createServerClient() {
  return createClient<Database>(
    process.env.EREGNA_SUPABASE_URL!,
    process.env.EREGNA_SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}
```

---

## Generating TypeScript types

After running migrations, regenerate the types:

```bash
supabase gen types typescript \
  --local \
  --schema public \
  > packages/db/src/types.ts
```

Add this to `turbo.json` as a task so it runs after migrations:

```json
{
  "tasks": {
    "db:types": {
      "cache": false,
      "outputs": ["packages/db/src/types.ts"]
    }
  }
}
```

---

## Environment variables

### `apps/api/.env`

```dotenv
# Supabase (server-side — never expose to browser)
EREGNA_SUPABASE_URL=http://127.0.0.1:54321
EREGNA_SUPABASE_SERVICE_ROLE_KEY=eyJ...

# OpenAI (for embeddings + chat completions)
OPENAI_API_KEY=sk-...

# Server
PORT=4000
EREGNA_CORS_ORIGINS=http://localhost:3000
```

### `apps/eregna/.env`

```dotenv
# Supabase (browser-safe — anon key only)
VITE_EREGNA_SUPABASE_URL=http://127.0.0.1:54321
VITE_EREGNA_SUPABASE_ANON_KEY=eyJ...

# API
VITE_EREGNA_API_URL=http://localhost:4000
```

> **Security rule**: `EREGNA_SUPABASE_SERVICE_ROLE_KEY` and `OPENAI_API_KEY`  
> must **never** appear in any file prefixed `VITE_` — Vite bundles those into the client.

---

## Supabase Auth configuration

In the Supabase dashboard (or `supabase/config.toml` for local):

```toml
[auth]
site_url = "http://localhost:3000"
additional_redirect_urls = ["http://localhost:3000/auth/callback"]

[auth.external.google]
enabled = true
client_id = "env(GOOGLE_CLIENT_ID)"
secret = "env(GOOGLE_CLIENT_SECRET)"
```

Enable **email + password** in the dashboard:  
Authentication → Providers → Email → Enable → "Confirm email" (optional for MVP).

---

## Seeding development data

After `supabase db reset`, **`supabase/seed.sql`** inserts sample pages/elements **if** a `profiles` row already exists (e.g. after you sign up in Studio). It skips when there is no profile or the user already has an agent.

For a full dev bootstrap (Auth user + password + DB rows), use the package script:

```bash
bun run --cwd packages/db seed
```

`packages/db/src/seed.ts` creates:
- 1 test user (`test@eregna.dev` / `password123`)
- 1 agent (`"Acme Docs Agent"`)
- A small page tree (`root → root.docs → root.docs.api`)
- 3 elements per page with dummy descriptions

---

## Supabase Storage (future)

Not used in Phase 1. Reserved for:
- Agent avatar images
- Uploaded knowledge-base attachments

Bucket name: `eregna-assets` (private, owner-scoped).

---

## Production checklist

- [ ] Enable pgvector extension in Supabase dashboard
- [ ] Enable ltree (usually pre-installed in Supabase Postgres)
- [ ] Set `site_url` and `redirect_urls` to production domain
- [ ] Rotate `service_role_key` — never commit to git
- [ ] Set up `pg_cron` or Supabase Edge Function for embedding backfill job
- [ ] Enable Supabase Point-in-Time Recovery for production DB
