create table public.agents (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles (id) on delete cascade,

  name          text not null,
  description   text,
  website_url   text not null,

  public_id     text not null unique,
  secret_key    text not null,

  model         text not null default 'gpt-4o-mini',
  system_prompt text,
  is_active     boolean not null default true,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index agents_owner_idx on public.agents (owner_id);
create unique index agents_public_id_idx on public.agents (public_id);
