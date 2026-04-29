alter table public.profiles enable row level security;

create policy "users can read their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

alter table public.agents enable row level security;

create policy "owners can do anything with their agents"
  on public.agents for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

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
