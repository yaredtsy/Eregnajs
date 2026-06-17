-- Knowledge model v2 (docs/v2/4-client/04): semantic keys + ordered selector
-- queries per component, plus agent-wide free-text "site facts".

alter table public.elements add column if not exists key text;
alter table public.elements add column if not exists selectors jsonb not null default '[]'::jsonb;

-- Backfill keys from dom_id (the previous LLM symbol), falling back to a short id.
update public.elements
set key = coalesce(nullif(dom_id, ''), left(id::text, 8))
where key is null;

-- Keys are the LLM's symbols: unique per page. Dedupe collisions before the index.
with d as (
  select id, row_number() over (partition by page_id, key order by created_at) as rn
  from public.elements
)
update public.elements e
set key = e.key || '-' || d.rn
from d
where d.id = e.id and d.rn > 1;

alter table public.elements alter column key set not null;
create unique index if not exists elements_page_key_idx on public.elements (page_id, key);

-- Backfill ordered selector queries from the legacy addressing columns.
update public.elements
set selectors =
  (case when nullif(dom_id, '') is not null
        then jsonb_build_array(jsonb_build_object('kind', 'dom-id', 'value', dom_id))
        else '[]'::jsonb end)
  ||
  (case when nullif(css_selector, '') is not null
        then jsonb_build_array(jsonb_build_object('kind', 'css', 'value', css_selector))
        else '[]'::jsonb end)
where selectors = '[]'::jsonb;

-- Agent-wide knowledge entries.
create table if not exists public.site_facts (
  id          uuid primary key default gen_random_uuid(),
  agent_id    uuid not null references public.agents (id) on delete cascade,
  title       text not null,
  content     text not null,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists site_facts_agent_idx on public.site_facts (agent_id, sort_order);
