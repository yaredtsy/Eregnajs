create table public.elements (
  id            uuid primary key default gen_random_uuid(),
  page_id       uuid not null references public.pages (id) on delete cascade,

  path          ltree not null,
  parent_id     uuid references public.elements (id) on delete cascade,

  label         text not null,
  dom_id        text,
  css_selector  text,
  xpath         text,

  description   text,
  notes         text,

  embedding     vector(1536),

  sort_order    int not null default 0,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (page_id, path)
);

create index elements_page_idx on public.elements (page_id);
create index elements_parent_idx on public.elements (parent_id);
create index elements_path_idx on public.elements using gist (path);

create index elements_embedding_idx
  on public.elements
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);
