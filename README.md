# Eregna

Monorepo for the Eregna product: a **TanStack Start** dashboard (`apps/eregna`), a **Bun + Hono** API (`apps/api`), shared **UI** and **DB** packages, and **Supabase** for auth and Postgres.

## Prerequisites

- **Node** 18+ and **pnpm** 9 (`packageManager` is pinned in `package.json`)
- **Bun** for the API ([install Bun](https://bun.sh/))
- **Docker Desktop** if you use **local** Supabase (`supabase start` from the repo root)

## Quick start

Install dependencies from the repository root:

```sh
pnpm install
```

### Environment variables

| App | File | Purpose |
|-----|------|--------|
| Dashboard | `apps/eregna/.env` | Supabase **publishable** URL + key for the browser; optional `VITE_EREGNA_API_URL` |
| API | `apps/api/.env` | Supabase **URL** + **secret** key (server only; never expose to the client) |

Copy the examples and fill in real values:

```sh
cp apps/eregna/.env.example apps/eregna/.env
cp apps/api/.env.example apps/api/.env
```

**Dashboard (`apps/eregna/.env`)**

- `VITE_EREGNA_SUPABASE_URL` / `VITE_EREGNA_SUPABASE_PUBLISHABLE_KEY` — project URL and publishable key (`sb_publishable_...` from the Supabase dashboard). Legacy `VITE_*_ANON_KEY` names still work.
- `VITE_EREGNA_API_URL` — base URL of the API (default `http://localhost:4000` if omitted).

**API (`apps/api/.env`)**

- `EREGNA_SUPABASE_URL` — same Supabase URL as the dashboard (e.g. `http://127.0.0.1:54321` when running Supabase locally).
- `EREGNA_SUPABASE_SECRET_KEY` — secret key (`sb_secret_...` from the dashboard, or `service_role` when local). Legacy `EREGNA_SUPABASE_SERVICE_ROLE_KEY` still works.
- `EREGNA_CORS_ORIGINS` — comma-separated origins allowed to call the API (include `http://localhost:3000` for local UI).

In Supabase, enable **Email** (and optionally **Google**) under Authentication → Providers, and add redirect URLs such as `http://localhost:3000/auth/callback`.

### Run the dashboard and API

From the repo root:

```sh
# Dashboard only (http://localhost:3000)
pnpm dev:dashboard

# API only (http://localhost:4000)
pnpm dev:api

# Both in parallel (recommended for full stack)
pnpm dev:app
```

Health check: `curl http://localhost:4000/health`

### Supabase locally

With Docker running:

```sh
supabase start
```

Apply schema with `supabase db reset` (migrations + `supabase/seed.sql`) or `supabase db push --local` for pending migrations only, then point both `.env` files at the local URL and keys from `supabase status`.

## Workspace layout

| Path | Description |
|------|-------------|
| `apps/eregna` | Customer dashboard (login, signup, agents list + create) |
| `apps/api` | REST-style JSON API under `/v1` with JWT auth |
| `packages/db` | Supabase client helpers and generated types |
| `packages/ui` | Shared styles and components |
| `supabase/` | Supabase CLI: `config.toml`, `migrations/`, `seed.sql` |
| `docs/` | Architecture and product notes |

## Scripts (root)

| Script | Description |
|--------|-------------|
| `pnpm dev` | Turbo `dev` for all packages that define it |
| `pnpm dev:dashboard` | Vite dev server for `eregna` |
| `pnpm dev:api` | Hot Bun server for `api` |
| `pnpm dev:app` | Dashboard + API together |
| `pnpm build` | Production builds via Turbo |
| `pnpm lint` / `pnpm check-types` | Lint and TypeScript checks |

## Security notes

- Never put the **secret** key in any `VITE_*` variable or ship it to the browser.
- The dashboard uses only the **publishable** key; the API verifies `Authorization: Bearer <access_token>` using the secret client.

## Further reading

See `docs/04-api-layer.md`, `docs/06-dashboard-ui.md`, and `docs/07-auth.md` for deeper design notes.
