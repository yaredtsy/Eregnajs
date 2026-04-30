create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_updated_at_profiles
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger set_updated_at_agents
  before update on public.agents
  for each row execute function public.set_updated_at();

create trigger set_updated_at_pages
  before update on public.pages
  for each row execute function public.set_updated_at();

create trigger set_updated_at_elements
  before update on public.elements
  for each row execute function public.set_updated_at();

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
language sql
stable
as $$
  select
    e.id,
    e.page_id,
    e.label,
    e.description,
    e.css_selector,
    e.dom_id,
    (1 - (e.embedding <=> query_embedding))::float as similarity
  from public.elements e
  join public.pages p on p.id = e.page_id
  where p.agent_id = agent_id_filter
    and e.embedding is not null
    and (1 - (e.embedding <=> query_embedding)) > match_threshold
  order by e.embedding <=> query_embedding
  limit match_count;
$$;
