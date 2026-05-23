# data/01 — Drizzle Schema

All persistence is Drizzle ORM against the Supabase-hosted Postgres. Schema files live in `packages/db/src/schema/`, one file per table. Migrations are generated with `drizzle-kit` into `packages/db/migrations/` and applied with the Supabase CLI (or `drizzle-kit push` in dev).

Extensions required: `pgcrypto` (for `gen_random_uuid()`), `ltree`, `vector` (pgvector — installed now for Phase 2 even though MVP doesn't query it).

---

## Entity overview

```
profiles  (mirrors auth.users)
   │
   └──< agents
          ├──< pages                    (ltree hierarchy, one site = one agent)
          │      └──< elements          (ltree hierarchy within a page)
          │
          └──< walkthrough_sessions     (one per visitor query)
                 └──< walkthrough_steps (every Step the streamer emitted)
```

Conversations and messages from the legacy schema are gone — replaced by `walkthrough_sessions` which subsume them. A "chat-only" reply is just a session with zero steps and a popover-only narration.

---

## `agents`

```ts
// packages/db/src/schema/agents.ts
import { pgTable, uuid, text, boolean, timestamp } from 'drizzle-orm/pg-core'
import { profiles } from './profiles'

export const agents = pgTable('agents', {
  id:           uuid('id').primaryKey().defaultRandom(),
  ownerId:      uuid('owner_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),

  name:         text('name').notNull(),
  description:  text('description'),
  websiteUrl:   text('website_url').notNull(),       // origin we lock pages to

  publicId:     text('public_id').notNull().unique(), // safe in <script>
  secretKey:    text('secret_key').notNull(),         // server-side only

  model:        text('model').notNull().default('gpt-4o-mini'),
  systemPrompt: text('system_prompt'),
  isActive:     boolean('is_active').notNull().default(true),

  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
```

Indexes: `(owner_id)`, unique `(public_id)`.

`secret_key` is **never** returned to the dashboard client. The agent service strips it on read.

---

## `pages`

```ts
// packages/db/src/schema/pages.ts
import { pgTable, uuid, text, integer, timestamp, unique, customType } from 'drizzle-orm/pg-core'
import { agents } from './agents'

// ltree isn't built-in; use a custom type
const ltree = customType<{ data: string; driverData: string }>({
  dataType: () => 'ltree',
})

export const pages = pgTable('pages', {
  id:          uuid('id').primaryKey().defaultRandom(),
  agentId:     uuid('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),

  path:        ltree('path').notNull(),
  parentId:    uuid('parent_id').references((): any => pages.id, { onDelete: 'cascade' }),

  title:       text('title').notNull(),
  urlPattern:  text('url_pattern'),
  description: text('description'),

  sortOrder:   integer('sort_order').notNull().default(0),

  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqAgentPath: unique('pages_agent_path_uq').on(t.agentId, t.path),
}))
```

GiST index on `path` is added via a raw-SQL migration step — Drizzle doesn't model GiST yet:

```sql
create index pages_path_idx on pages using gist(path);
```

---

## `elements`

```ts
// packages/db/src/schema/elements.ts
import { pgTable, uuid, text, integer, timestamp, unique, customType } from 'drizzle-orm/pg-core'
import { pages } from './pages'

const ltree   = customType<{ data: string }>({ dataType: () => 'ltree' })
const vector  = customType<{ data: number[]; driverData: string }>({
  dataType: () => 'vector(1536)',
  toDriver: (v) => `[${v.join(',')}]`,
})
const textArr = customType<{ data: string[] }>({ dataType: () => 'text[]' })

export const elements = pgTable('elements', {
  id:             uuid('id').primaryKey().defaultRandom(),
  pageId:         uuid('page_id').notNull().references(() => pages.id, { onDelete: 'cascade' }),

  path:           ltree('path').notNull(),
  parentId:       uuid('parent_id').references((): any => elements.id, { onDelete: 'cascade' }),

  label:          text('label').notNull(),
  domId:          text('dom_id'),
  cssSelector:    text('css_selector'),
  xpath:          text('xpath'),

  description:    text('description').notNull(),
  registerIntent: textArr('register_intent').default([]),
  notes:          text('notes'),

  embedding:      vector('embedding'),     // null in MVP, populated in Phase 2

  sortOrder:      integer('sort_order').notNull().default(0),

  createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:      timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqPagePath: unique('elements_page_path_uq').on(t.pageId, t.path),
}))
```

Constraint enforced in the element service, not the DB: at least one of `domId`, `cssSelector`, `xpath` must be non-null.

Index for Phase 2 (added now, queried later):

```sql
create index elements_path_idx on elements using gist(path);
-- pgvector index deferred until we have ≥ 1000 rows
```

---

## `walkthrough_sessions`

One row per visitor query. The session captures everything needed to replay the walkthrough later (Phase 2 viewer).

```ts
// packages/db/src/schema/walkthroughSessions.ts
import { pgTable, uuid, text, jsonb, timestamp } from 'drizzle-orm/pg-core'
import { agents } from './agents'
import { pages } from './pages'

export const walkthroughSessions = pgTable('walkthrough_sessions', {
  id:           uuid('id').primaryKey().defaultRandom(),
  agentId:      uuid('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),

  visitorId:    text('visitor_id'),                   // opaque, optional
  visitorMeta:  jsonb('visitor_meta'),

  // The query that started it all
  query:        text('query').notNull(),
  pageUrl:      text('page_url').notNull(),

  // Planner output
  pickedPageId: uuid('picked_page_id').references(() => pages.id),
  planOutline:  jsonb('plan_outline'),               // short titles, pre-streaming

  // Outcomes
  status:       text('status').notNull().default('streaming'),
                                                     // 'streaming'|'complete'|'aborted'|'error'
  errorMessage: text('error_message'),

  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt:  timestamp('completed_at', { withTimezone: true }),
})
```

---

## `walkthrough_steps`

One row per `Step` emitted by the streamer. Inserts happen as the SSE stream fires, so a crashed stream leaves a partial trail we can debug.

```ts
// packages/db/src/schema/walkthroughSteps.ts
import { pgTable, uuid, integer, jsonb, timestamp } from 'drizzle-orm/pg-core'
import { walkthroughSessions } from './walkthroughSessions'

export const walkthroughSteps = pgTable('walkthrough_steps', {
  id:         uuid('id').primaryKey().defaultRandom(),
  sessionId:  uuid('session_id').notNull().references(() => walkthroughSessions.id, { onDelete: 'cascade' }),

  // Position in the original stream (not the playback order — playback can branch)
  streamIndex: integer('stream_index').notNull(),

  step:       jsonb('step').notNull(),               // the full Step object as emitted
  emittedAt:  timestamp('emitted_at', { withTimezone: true }).notNull().defaultNow(),
})
```

`step` is the raw payload (see `engine/01-action-schema.md`). Storing JSON instead of normalizing means we can change the action schema in Phase 2 without rewriting historical rows.

---

## `profiles`

Trimmed from the legacy doc. Mirrors `auth.users` via a trigger; no change for the new product.

```ts
// packages/db/src/schema/profiles.ts
import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core'

export const profiles = pgTable('profiles', {
  id:         uuid('id').primaryKey(),               // = auth.users.id
  email:      text('email').notNull(),
  fullName:   text('full_name'),
  avatarUrl:  text('avatar_url'),
  plan:       text('plan').notNull().default('free'),
  createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:  timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
```

The `auth.users → public.profiles` trigger is unchanged from the legacy doc and lives as a hand-written SQL migration since Drizzle doesn't manage triggers.

---

## Drizzle client

```ts
// packages/db/src/client.ts
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

export function createDbClient(connectionString: string) {
  const client = postgres(connectionString, { prepare: false })   // pgbouncer-safe
  return drizzle(client, { schema })
}

export type Db = ReturnType<typeof createDbClient>
export * as schema from './schema'
```

`apps/api` instantiates one client at boot. The dashboard never imports this — see `data/02-auth-and-ownership.md`.

---

## Migrations

```bash
# Generate from schema diffs
pnpm --filter db drizzle-kit generate

# Apply against local Supabase Postgres
pnpm --filter db drizzle-kit push

# In CI / staging / prod
pnpm --filter db drizzle-kit migrate
```

Hand-written SQL (triggers, GiST indexes, pgvector index) lives alongside generated migrations and is applied in the same `drizzle-kit migrate` run via the `journal.json` ordering.

---

## What's gone vs. the legacy schema

- `conversations` and `messages` are replaced by `walkthrough_sessions` + `walkthrough_steps`. A pure-chat session is just one with no `picked_page_id` and a single popover step.
- `match_elements` RPC is unused in MVP. We keep the SQL for Phase 2 but the API doesn't call it.
- RLS policies are dropped. See `data/02-auth-and-ownership.md` for why and what replaces them.
