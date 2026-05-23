# 02 — Database Models

All tables live in the `public` schema inside Supabase (Postgres 15+).  
Extensions required: `uuid-ossp`, `ltree`, `vector` (pgvector).

---

## Entity relationship overview

```
profiles          (1) ──< (∞) agents
                                │
                         (1) ──< (∞) pages       (ltree path)
                                        │
                                 (1) ──< (∞) elements   (ltree path, recursive)
                                                │
                                         embeddings  (vector column, inline)
```

---

## Table definitions

### `profiles`

Mirrors `auth.users`. Created automatically via a trigger on user sign-up.  
Stores display preferences and plan info.

```sql
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text,
  avatar_url  text,
  plan        text not null default 'free',   -- 'free' | 'pro' | 'enterprise'
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
```

**Trigger** — kept in sync with `auth.users`:
```sql
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

**RLS**
```sql
alter table public.profiles enable row level security;

create policy "users can read their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);
```

---

### `agents`

An agent is the top-level embeddable entity.  
Each agent has a `public_id` (safe to expose in the embed script) and a `secret_key` (never exposed client-side).

```sql
create table public.agents (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles(id) on delete cascade,

  -- identity
  name          text not null,
  description   text,
  website_url   text not null,              -- e.g. "https://acme.com"

  -- embed
  public_id     text not null unique,       -- short random slug, safe for <script>
  secret_key    text not null,              -- used server-side to sign tokens

  -- config
  model         text not null default 'gpt-4o-mini',
  system_prompt text,
  is_active     boolean not null default true,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index agents_owner_idx on public.agents(owner_id);
create unique index agents_public_id_idx on public.agents(public_id);
```

**RLS**
```sql
alter table public.agents enable row level security;

create policy "owners can do anything with their agents"
  on public.agents for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- Public read for the embed layer (only active, by public_id, via service role)
-- Embed API calls use service-role key — no RLS bypass needed here for anon users.
```

---

### `pages`

A page represents a URL (or URL pattern) within the agent's website.  
Pages are organized as a **tree** using `ltree` paths.

```sql
create extension if not exists ltree;

create table public.pages (
  id            uuid primary key default gen_random_uuid(),
  agent_id      uuid not null references public.agents(id) on delete cascade,

  -- hierarchy
  path          ltree not null,              -- e.g. 'root.docs.api.auth'
  parent_id     uuid references public.pages(id) on delete cascade,

  -- content
  title         text not null,
  url_pattern   text,                        -- exact URL or glob, e.g. '/docs/api/*'
  description   text,

  -- ordering within siblings
  sort_order    int not null default 0,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (agent_id, path)
);

create index pages_agent_idx   on public.pages(agent_id);
create index pages_parent_idx  on public.pages(parent_id);
create index pages_path_idx    on public.pages using gist(path);   -- ltree GiST
```

**ltree path conventions**

| Level | Example path | Represents |
|-------|-------------|-----------|
| Root | `root` | Website root `/` |
| Section | `root.docs` | `/docs` section |
| Page | `root.docs.api` | `/docs/api` page |
| Sub-page | `root.docs.api.auth` | `/docs/api/auth` page |

Path labels must match `[A-Za-z0-9_]+`. Slugify titles before storing.

**Useful ltree queries**
```sql
-- All descendants of 'root.docs'
select * from pages where path <@ 'root.docs';

-- Direct children only
select * from pages where path ~ 'root.docs.*{1}';

-- Depth of a node
select nlevel(path) - 1 as depth from pages where id = $1;
```

**RLS**
```sql
alter table public.pages enable row level security;

create policy "pages: owner access via agent"
  on public.pages for all
  using (
    exists (
      select 1 from public.agents
      where agents.id = pages.agent_id
        and agents.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.agents
      where agents.id = pages.agent_id
        and agents.owner_id = auth.uid()
    )
  );
```

---

### `elements`

An element is a DOM element on a page, identified by a CSS selector or explicit `dom_id`.  
Elements are **recursive** (a navbar can contain a left-nav, right-nav, etc.) using the same `ltree` pattern.

```sql
create table public.elements (
  id            uuid primary key default gen_random_uuid(),
  page_id       uuid not null references public.pages(id) on delete cascade,

  -- hierarchy
  path          ltree not null,              -- relative to page, e.g. 'navbar.left_nav'
  parent_id     uuid references public.elements(id) on delete cascade,

  -- identity / targeting
  label         text not null,              -- human name, e.g. "Left Navbar"
  dom_id        text,                       -- #my-id  (preferred)
  css_selector  text,                       -- fallback selector
  xpath         text,                       -- last-resort

  -- knowledge-base content
  description   text,                       -- plain-text doc for this element
  notes         text,                       -- internal notes (not shown to visitors)

  -- embedding (pgvector)
  embedding     vector(1536),               -- OpenAI text-embedding-3-small output

  sort_order    int not null default 0,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (page_id, path)
);

create index elements_page_idx   on public.elements(page_id);
create index elements_parent_idx on public.elements(parent_id);
create index elements_path_idx   on public.elements using gist(path);

-- pgvector IVFFlat index for fast ANN search (build after first ~1000 rows)
create index elements_embedding_idx
  on public.elements
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);
```

**RLS**
```sql
alter table public.elements enable row level security;

create policy "elements: owner access via page → agent"
  on public.elements for all
  using (
    exists (
      select 1
      from public.pages p
      join public.agents a on a.id = p.agent_id
      where p.id = elements.page_id
        and a.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.pages p
      join public.agents a on a.id = p.agent_id
      where p.id = elements.page_id
        and a.owner_id = auth.uid()
    )
  );
```

---

### `conversations`

Stores chat sessions initiated from the widget.  
No auth is required from the visitor — the agent's `public_id` is the entry point.

```sql
create table public.conversations (
  id            uuid primary key default gen_random_uuid(),
  agent_id      uuid not null references public.agents(id) on delete cascade,

  -- optional: link to a logged-in user of the host site (passed by embed)
  visitor_id    text,                        -- opaque string from host site
  visitor_meta  jsonb,                       -- e.g. { "email": "..." }

  -- context snapshot at session start
  page_url      text,                        -- URL visitor was on when they opened chat
  page_title    text,

  created_at    timestamptz not null default now(),
  last_active_at timestamptz not null default now()
);

create index conversations_agent_idx on public.conversations(agent_id);
```

**RLS** — conversations are written by the API (service-role). Dashboard owners can read their own.
```sql
alter table public.conversations enable row level security;

create policy "owners can read conversations for their agents"
  on public.conversations for select
  using (
    exists (
      select 1 from public.agents
      where agents.id = conversations.agent_id
        and agents.owner_id = auth.uid()
    )
  );
-- Inserts come from service-role (API), bypassing RLS.
```

---

### `messages`

Individual turns in a conversation.

```sql
create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,

  role            text not null check (role in ('user', 'assistant', 'system')),
  content         text not null,

  -- metadata
  retrieved_elements  uuid[],              -- element IDs used as context
  model               text,               -- which model produced this turn
  token_usage         jsonb,              -- { prompt_tokens, completion_tokens }
  latency_ms          int,

  created_at      timestamptz not null default now()
);

create index messages_conversation_idx on public.messages(conversation_id);
```

**RLS** — same pattern as `conversations`.
```sql
alter table public.messages enable row level security;

create policy "owners can read messages via conversations"
  on public.messages for select
  using (
    exists (
      select 1
      from public.conversations c
      join public.agents a on a.id = c.agent_id
      where c.id = messages.conversation_id
        and a.owner_id = auth.uid()
    )
  );
```

---

## Shared helper functions

### `updated_at` trigger (applied to all tables)

```sql
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Apply to each table:
create trigger set_updated_at before update on public.profiles
  for each row execute procedure public.set_updated_at();
-- ... repeat for agents, pages, elements
```

### `match_elements` — vector similarity search RPC

Called by the API during RAG retrieval.

```sql
create or replace function public.match_elements(
  query_embedding   vector(1536),
  agent_id_filter   uuid,
  match_count       int default 5,
  match_threshold   float default 0.75
)
returns table (
  id              uuid,
  page_id         uuid,
  label           text,
  description     text,
  css_selector    text,
  dom_id          text,
  similarity      float
)
language sql stable as $$
  select
    e.id,
    e.page_id,
    e.label,
    e.description,
    e.css_selector,
    e.dom_id,
    1 - (e.embedding <=> query_embedding) as similarity
  from public.elements e
  join public.pages p on p.id = e.page_id
  where p.agent_id = agent_id_filter
    and e.embedding is not null
    and 1 - (e.embedding <=> query_embedding) > match_threshold
  order by e.embedding <=> query_embedding
  limit match_count;
$$;
```

---

## Summary of tables

| Table | Rows owned by | Key relationships |
|-------|--------------|-------------------|
| `profiles` | auth.users (1:1) | — |
| `agents` | profiles (1:∞) | `owner_id → profiles.id` |
| `pages` | agents (1:∞) | `agent_id → agents.id`, ltree hierarchy |
| `elements` | pages (1:∞) | `page_id → pages.id`, ltree hierarchy, vector |
| `conversations` | agents (1:∞) | `agent_id → agents.id` |
| `messages` | conversations (1:∞) | `conversation_id → conversations.id` |
