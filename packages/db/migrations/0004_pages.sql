create table public.pages (
  id            uuid primary key default gen_random_uuid(),
  agent_id      uuid not null references public.agents (id) on delete cascade,

  path          ltree not null,
  parent_id     uuid references public.pages (id) on delete cascade,

  title         text not null,
  url_pattern   text,
  description   text,

  sort_order    int not null default 0,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (agent_id, path)
);

create index pages_agent_idx on public.pages (agent_id);
create index pages_parent_idx on public.pages (parent_id);
create index pages_path_idx on public.pages using gist (path);
