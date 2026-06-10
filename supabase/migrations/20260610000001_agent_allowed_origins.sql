-- Public embed surface: per-agent origin allowlist (docs/v2/3-server/06 §2).
-- Empty array = locked in production, open in development (enforced in API).
alter table public.agents
  add column allowed_origins text[] not null default '{}';
