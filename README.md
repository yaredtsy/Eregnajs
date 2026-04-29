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
| Dashboard | `apps/eregna/.env` | Supabase **anon** URL + key for the browser; optional `VITE_EREGNA_API_URL` |
| API | `apps/api/.env` | Supabase **URL** + **service role** key (server only; never expose to the client) |

Copy the examples and fill in real values:

```sh
cp apps/eregna/.env.example apps/eregna/.env
cp apps/api/.env.example apps/api/.env
```

**Dashboard (`apps/eregna/.env`)**

- `VITE_EREGNA_SUPABASE_URL` / `VITE_EREGNA_SUPABASE_ANON_KEY` — project URL and anon key (or the legacy `VITE_SUPABASE_*` names; both are supported in code).
- `VITE_EREGNA_API_URL` — base URL of the API (default `http://localhost:4000` if omitted).

**API (`apps/api/.env`)**

- `EREGNA_SUPABASE_URL` — same Supabase URL as the dashboard (e.g. `http://127.0.0.1:54321` when running Supabase locally).
- `EREGNA_SUPABASE_SERVICE_ROLE_KEY` — service role key (from Supabase dashboard or `supabase status` when local).
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

Apply migrations from `packages/db/migrations` as you normally would for this project, then point both `.env` files at the local URL and keys from `supabase status`.

## Workspace layout

| Path | Description |
|------|-------------|
| `apps/eregna` | Customer dashboard (login, signup, agents list + create) |
| `apps/api` | REST-style JSON API under `/v1` with JWT auth |
| `packages/db` | Supabase client helpers and generated types |
| `packages/ui` | Shared styles and components |
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

- Never put the **service role** key in any `VITE_*` variable or ship it to the browser.
- The dashboard uses only the **anon** key; the API verifies `Authorization: Bearer <access_token>` using the service client.

## Further reading

See `docs/04-api-layer.md`, `docs/06-dashboard-ui.md`, and `docs/07-auth.md` for deeper design notes.
