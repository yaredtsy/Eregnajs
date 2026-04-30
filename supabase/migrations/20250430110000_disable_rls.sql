-- Turn off RLS for local/dev while API uses service client without per-request JWT on PostgREST.
-- Safe if RLS was never enabled; no-op for policies when RLS is already off.

alter table public.profiles disable row level security;
alter table public.agents disable row level security;
alter table public.pages disable row level security;
alter table public.elements disable row level security;
alter table public.conversations disable row level security;
alter table public.messages disable row level security;
