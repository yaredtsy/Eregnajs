-- Walkthrough sessions (replaces/extends legacy conversations)
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

-- Messages in a session (role + timestamp; parts split across child tables)
create table public.session_messages (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.walkthrough_sessions (id) on delete cascade,
  role        text not null check (role in ('user', 'assistant')),
  created_at  timestamptz not null default now()
);

create index session_messages_session_idx on public.session_messages (session_id, created_at);

-- Text parts attached to a message (short intro text or user text)
create table public.message_text_parts (
  id          uuid primary key default gen_random_uuid(),
  message_id  uuid not null references public.session_messages (id) on delete cascade,
  part_index  int not null default 0,
  text        text not null,
  created_at  timestamptz not null default now()
);

-- Walkthrough parts attached to an assistant message
create table public.walkthroughs (
  id               uuid primary key default gen_random_uuid(),
  message_id       uuid not null references public.session_messages (id) on delete cascade,
  plan_goal        text not null,
  plan_rationale   text,
  stream_status    text not null default 'open'
                     check (stream_status in ('open', 'closed', 'aborted', 'error')),
  parent_context   jsonb,   -- WalkthroughPosition | null
  created_at       timestamptz not null default now()
);

create index walkthroughs_message_idx on public.walkthroughs (message_id);

-- Individual steps streamed into a walkthrough
create table public.walkthrough_steps (
  id              uuid primary key default gen_random_uuid(),
  walkthrough_id  uuid not null references public.walkthroughs (id) on delete cascade,
  step_index      int not null,
  actions         jsonb not null default '[]',
  popover         jsonb,
  cumulative_ms   int not null default 0,
  created_at      timestamptz not null default now(),
  unique (walkthrough_id, step_index)
);

create index walkthrough_steps_wt_idx on public.walkthrough_steps (walkthrough_id, step_index);
