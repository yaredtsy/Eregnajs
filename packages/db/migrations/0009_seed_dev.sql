-- Development seed: not for production. Run after at least one user exists (profiles row).
-- Auth users are created via Supabase Auth or `pnpm run seed` in @repo/db (Admin API).

do $$
declare
  v_owner uuid;
  v_agent uuid;
  v_page_root uuid;
  v_page_docs uuid;
  v_page_api uuid;
begin
  select id into v_owner from public.profiles order by created_at limit 1;
  if v_owner is null then
    raise notice '0009_seed_dev: skip — no profiles yet';
    return;
  end if;

  if exists (select 1 from public.agents where owner_id = v_owner) then
    raise notice '0009_seed_dev: skip — owner already has an agent';
    return;
  end if;

  insert into public.agents (
    owner_id, name, description, website_url, public_id, secret_key
  )
  values (
    v_owner,
    'Acme Docs Agent',
    'Sample agent for local development',
    'https://acme.com',
    'dev_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
    replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
  )
  returning id into v_agent;

  insert into public.pages (agent_id, path, title, url_pattern, sort_order)
  values (v_agent, 'root'::ltree, 'Home', '/', 0)
  returning id into v_page_root;

  insert into public.pages (agent_id, path, parent_id, title, url_pattern, sort_order)
  values (v_agent, 'root.docs'::ltree, v_page_root, 'Docs', '/docs', 1)
  returning id into v_page_docs;

  insert into public.pages (agent_id, path, parent_id, title, url_pattern, sort_order)
  values (v_agent, 'root.docs.api'::ltree, v_page_docs, 'API', '/docs/api', 2)
  returning id into v_page_api;

  insert into public.elements (page_id, path, label, description, sort_order)
  values
    (v_page_root, 'hero'::ltree, 'Hero', 'Main hero section', 0),
    (v_page_root, 'footer'::ltree, 'Footer', 'Site footer', 1),
    (v_page_root, 'cta'::ltree, 'CTA', 'Call to action', 2);

  insert into public.elements (page_id, path, label, description, sort_order)
  values
    (v_page_docs, 'sidebar'::ltree, 'Sidebar', 'Documentation sidebar', 0),
    (v_page_docs, 'content'::ltree, 'Content', 'Main doc body', 1),
    (v_page_docs, 'toc'::ltree, 'TOC', 'Table of contents', 2);

  insert into public.elements (page_id, path, label, description, sort_order)
  values
    (v_page_api, 'endpoints'::ltree, 'Endpoints', 'API endpoint list', 0),
    (v_page_api, 'auth_block'::ltree, 'Auth', 'Authentication section', 1),
    (v_page_api, 'examples'::ltree, 'Examples', 'Code examples', 2);
end $$;
