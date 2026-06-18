# API (Bun + Hono)

Local HTTP API for authenticated CRUD (`/v1/agents`, `/v1/pages`, `/v1/elements`). Uses the Supabase **secret** key server-side only.

## Prerequisites

- [Bun](https://bun.sh/) installed
- A Supabase project (or local `supabase start`) with DB migrations applied
- Env vars (see `.env.example` in this folder)

## Install (from monorepo root)

```sh
pnpm install
```

## Run

```sh
# from repo root (hot reload — updates routes without restarting the process)
pnpm dev:api

# or from apps/api
pnpm dev

# full process restart on every save (if --hot misbehaves)
pnpm dev:watch
```

`dev` uses `bun --hot`: save any file under `src/` (or a workspace import like `@repo/db`) and the fetch handler reloads. You should see `API listening on…` log again in the terminal.

Default URL: `http://localhost:4000` — `GET /health` should return `{ ok: true }`.

## Env

Copy `.env.example` to `.env` and set `EREGNA_SUPABASE_URL` and `EREGNA_SUPABASE_SECRET_KEY`. Optional: `PORT`, `EREGNA_CORS_ORIGINS` (comma-separated; include `http://localhost:3000` for the dashboard).

See the root [README.md](../../README.md) for how these line up with the dashboard’s `VITE_*` variables.
