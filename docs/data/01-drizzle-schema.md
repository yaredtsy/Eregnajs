# data/01 — Database Schema

> **Naming note.** This file is still called `01-drizzle-schema.md` for path stability with prior links — but the shipped layer is **not** Drizzle. See "Why not Drizzle (yet)" below for what changed.

All persistence is the Supabase-hosted Postgres. Migrations are hand-written SQL files in `supabase/migrations/` and applied via the Supabase CLI. The TypeScript types consumed by the API and dashboard live in `packages/db/src/types.ts` and are written in the generated-style `Database` shape (`Tables<>`, `TablesInsert<>`, `TablesUpdate<>`).

Extensions required: `pgcrypto` (for `gen_random_uuid()`), `ltree`. (`vector` / pgvector is **not** currently enabled — embedding generation deferred to Phase 2.)

---

## Why not Drizzle (yet)

The original design called for Drizzle ORM + `drizzle-zod` so that table schemas and Zod request validators were derived from one source. The shipped path is simpler:

- **Schema** lives in plain SQL files under `supabase/migrations/`.
- **Types** are hand-maintained in `packages/db/src/types.ts` in the same shape Supabase's CLI generator emits (`Database['public']['Tables']['agents']['Row']`).
- **Runtime client** is `@supabase/supabase-js` via `createServerClient()` in `packages/db/src/client.ts`.
- **Request validators** are inline Zod schemas in each Hono route file.

This trades a bit of duplication (Zod bodies are written by hand instead of derived) for one fewer build step and zero ORM lock-in. Drizzle is still a sensible upgrade when (a) the team grows and the duplication starts to hurt, or (b) we want trigger-managed migrations. Until then, when you add a column: edit the migration SQL, then add the field to `packages/db/src/types.ts`.

---

## Entity overview

```
profiles  (mirrors auth.users)
   │
   └──< agents
          ├──< pages                       (ltree hierarchy; one site = one agent)
          │      └──< elements             (ltree hierarchy within a page)
          │
          └──< walkthrough_sessions        (one per visitor session — multiple messages)
                 └──< session_messages    (user or assistant, ordered by created_at)
                        ├──< message_text_parts        (text parts of a message)
                        └──< walkthroughs              (a walkthrough part on an assistant message)
                               └──< walkthrough_steps  (individual steps, ordered by step_index)
```

> **A session is not a single query.** A session lasts as long as the visitor's widget is open. Inside it, messages alternate user ↔ assistant. An assistant message may carry *text parts* (small narration chunks) and at most one *walkthrough part* (the actual stepped guidance). This is the same Message/Parts shape the widget renders.

The legacy `conversations` + `messages` tables from the chat-only product still exist in earlier migrations but are unused by the new code path.

---

## `agents`

```sql
-- supabase/migrations/20250430100003_agents.sql
create table public.agents (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles(id) on delete cascade,
  name          text not null,
  description   text,
  website_url   text not null,
  public_id     text not null unique,           -- safe in <script>
  secret_key    text not null,                  -- server-side only
  model         text not null default 'gpt-4o-mini',
  system_prompt text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
```

`secret_key` is generated server-side (`crypto.randomUUID()`) on insert. The agent service does **not** strip it on `getByIdForUser` because the Embed tab needs it; routes that return agent rows to the browser are gated by JWT-verified ownership.

---

## `pages`

```sql
-- supabase/migrations/20250430100004_pages.sql
create table public.pages (
  id          uuid primary key default gen_random_uuid(),
  agent_id    uuid not null references public.agents(id) on delete cascade,
  path        ltree not null,
  parent_id   uuid references public.pages(id) on delete cascade,
  title       text not null,
  url_pattern text,
  description text,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (agent_id, path)
);

create index pages_path_idx on public.pages using gist(path);
```

`path` is computed in the API (`apps/api/src/services/page.service.ts → computePagePath`) by slugifying the title and concatenating to the parent's path. The first root page on an agent gets path `root`; subsequent roots get `root_<slug>`. The `nextUniquePath` helper appends a random suffix on collision.

---

## `elements`

```sql
-- supabase/migrations/20250430100005_elements.sql (shape — fields the service uses)
create table public.elements (
  id           uuid primary key default gen_random_uuid(),
  page_id      uuid not null references public.pages(id) on delete cascade,
  path         ltree not null,
  parent_id    uuid references public.elements(id) on delete cascade,
  label        text not null,
  dom_id       text,
  css_selector text,
  description  text,
  notes        text,
  embedding    text,                              -- nullable; surfaced as has_embedding only
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (page_id, path)
);

create index elements_path_idx on public.elements using gist(path);
```

Differences from the original spec worth flagging:

- **No `xpath` column.** Resolution order is `#dom_id` first, then `css_selector`. We can add xpath as a third fallback if a customer actually needs it.
- **No `register_intent text[]` column.** The planner doesn't exist yet — when it does and we want intent boosts, this is the column to add.
- **`embedding` is currently `text`, not `vector(1536)`.** pgvector isn't enabled. The API returns a derived boolean `has_embedding` on every element so the dashboard can show an indicator dot without exposing the value.
- **Service-level constraint** (not a DB constraint): at least one of `dom_id` / `css_selector` must be non-null. Enforced by a Zod `.refine()` in `apps/api/src/routes/elements.ts`.

---

## Walkthrough storage — five tables, not two

The original design folded everything into `walkthrough_sessions` + `walkthrough_steps`, where each step was a JSON blob. The shipped schema splits the data by lifetime: a session lives across many messages; each assistant message may attach text parts and/or one walkthrough; a walkthrough owns its ordered steps.

```sql
-- supabase/migrations/20250523000001_walkthroughs.sql

-- One row per visitor session (widget open → widget closed)
create table public.walkthrough_sessions (
  id             uuid primary key default gen_random_uuid(),
  agent_id       uuid not null references public.agents (id) on delete cascade,
  visitor_id     text,
  visitor_meta   jsonb,
  page_url       text,
  created_at     timestamptz not null default now(),
  last_active_at timestamptz not null default now()
);

create index walkthrough_sessions_agent_idx on public.walkthrough_sessions (agent_id);

-- Messages inside a session (role + ordering only — content is in child tables)
create table public.session_messages (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.walkthrough_sessions (id) on delete cascade,
  role        text not null check (role in ('user', 'assistant')),
  created_at  timestamptz not null default now()
);

create index session_messages_session_idx on public.session_messages (session_id, created_at);

-- Text parts on a message (user prompt, or assistant narration between walkthroughs)
create table public.message_text_parts (
  id          uuid primary key default gen_random_uuid(),
  message_id  uuid not null references public.session_messages (id) on delete cascade,
  part_index  int not null default 0,
  text        text not null,
  created_at  timestamptz not null default now()
);

-- Walkthrough part on an assistant message (at most one per message in MVP)
create table public.walkthroughs (
  id              uuid primary key default gen_random_uuid(),
  message_id      uuid not null references public.session_messages (id) on delete cascade,
  plan_goal       text not null,
  plan_rationale  text,
  stream_status   text not null default 'open'
                    check (stream_status in ('open', 'closed', 'aborted', 'error')),
  parent_context  jsonb,                       -- WalkthroughPosition | null (where this branched from)
  created_at      timestamptz not null default now()
);

create index walkthroughs_message_idx on public.walkthroughs (message_id);

-- Individual steps streamed into a walkthrough
create table public.walkthrough_steps (
  id             uuid primary key default gen_random_uuid(),
  walkthrough_id uuid not null references public.walkthroughs (id) on delete cascade,
  step_index     int not null,
  actions        jsonb not null default '[]',  -- WalkthroughAction[]
  popover        jsonb,                        -- { title?, body, elementId? } | null
  cumulative_ms  int not null default 0,       -- timeline position derived at write time
  created_at     timestamptz not null default now(),
  unique (walkthrough_id, step_index)
);

create index walkthrough_steps_wt_idx on public.walkthrough_steps (walkthrough_id, step_index);
```

### How this maps to the widget's in-memory shape

The widget's `Conversation → Message → MessagePart` types in `packages/widget/src/types/conversation.ts` are exactly what these tables encode:

| Widget type | DB table |
|---|---|
| `Conversation` | one `walkthrough_sessions` row |
| `Message` | one `session_messages` row |
| `TextPart` (in `message.parts[]`) | one `message_text_parts` row |
| `WalkthroughPart` (in `message.parts[]`) | one `walkthroughs` row + its `walkthrough_steps[]` |
| `WalkthroughStep` | one `walkthrough_steps` row |
| `WalkthroughPart.parentContext` | `walkthroughs.parent_context` JSONB |

The split lets `pause-and-branch` mid-walkthrough be modeled cleanly: the branch is just a *new walkthrough* on a *later assistant message* with `parent_context` pointing to the position in the prior walkthrough where the user paused.

### What's not implemented yet

- **No streamer writing to these tables.** Today only `walkthrough_sessions` is written, via `POST /v1/sessions` (the widget creates a session when it opens; the API touches `last_active_at`). The four downstream tables are reserved for the upcoming planner + streamer service.
- **No `status` column on `walkthrough_sessions`.** Aborted vs completed sessions are tracked on `walkthroughs.stream_status`, not on the session row.

---

## `profiles`

Mirrors `auth.users` via a trigger; same as the legacy doc.

```sql
create table public.profiles (
  id         uuid primary key,                   -- = auth.users.id
  email      text not null,
  full_name  text,
  avatar_url text,
  plan       text not null default 'free',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

The `auth.users → public.profiles` trigger is in `supabase/migrations/20250430100007_functions.sql`.

---

## `packages/db` client

```ts
// packages/db/src/client.ts
import { createClient } from "@supabase/supabase-js"
import type { Database } from "./types.js"

export function createBrowserClient() {
  return createClient<Database>(
    process.env.VITE_EREGNA_SUPABASE_URL!,
    process.env.VITE_EREGNA_SUPABASE_ANON_KEY!,
  )
}

export function createServerClient() {
  return createClient<Database>(
    process.env.EREGNA_SUPABASE_URL!,
    process.env.EREGNA_SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}
```

`apps/api` calls `createServerClient()` on each request — Supabase's JS client is cheap to instantiate. The dashboard only imports this from the API path (never directly) so the browser bundle does not ship the service-role code path.

---

## Migrations

```bash
# Apply all new SQL files against linked project
supabase db push

# Roll back / inspect
supabase db diff
```

Drizzle Kit isn't wired in; if/when we adopt Drizzle, generated migrations would land in `packages/db/migrations/` and run *after* the hand-written ones in `supabase/migrations/`.

---

## What's gone vs. the legacy schema

- `conversations` and `messages` (chat-only tables) — still in earlier migrations, but no production code reads them.
- `match_elements` RPC — still in `20250430100007_functions.sql`, unused; will be the basis of pgvector retrieval in Phase 2.
- RLS policies were enabled then disabled (see `20250430110000_disable_rls.sql`). See `data/02-auth-and-ownership.md` for the trust model that replaces them.
