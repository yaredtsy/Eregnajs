create table public.conversations (
  id             uuid primary key default gen_random_uuid(),
  agent_id       uuid not null references public.agents (id) on delete cascade,

  visitor_id     text,
  visitor_meta   jsonb,

  page_url       text,
  page_title     text,

  created_at     timestamptz not null default now(),
  last_active_at timestamptz not null default now()
);

create index conversations_agent_idx on public.conversations (agent_id);

create table public.messages (
  id                 uuid primary key default gen_random_uuid(),
  conversation_id    uuid not null references public.conversations (id) on delete cascade,

  role               text not null check (role in ('user', 'assistant', 'system')),
  content            text not null,

  retrieved_elements uuid[],
  model              text,
  token_usage        jsonb,
  latency_ms         int,

  created_at         timestamptz not null default now()
);

create index messages_conversation_idx on public.messages (conversation_id);
