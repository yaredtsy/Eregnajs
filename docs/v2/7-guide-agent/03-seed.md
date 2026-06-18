# 7.3 — Seed script

> One script creates the guide agent + page + components + site facts. Safe to run many times.

---

## File location (planned)

```
packages/db/src/seed-guide-agent.ts    # logic
packages/db/src/seed-guide-cli.ts      # `bun run` entry (or flag on existing seed-cli)
```

Follow the same env pattern as `packages/db/src/seed.ts` (`EREGNA_SUPABASE_URL`, secret key).

---

## Who owns the agent?

**Option A (chosen): platform user, not your login**

- Seed creates (or reuses) a dedicated auth user: `guide@eregna.dev`
- The guide agent's `owner_id` is that user
- Any logged-in dev can call the public run endpoint with `public_id` — ownership only matters for dashboard CRUD

**Why:** your personal account already has test agents; the guide agent should be stable and shared across machines.

---

## Idempotency rules

| Check | If exists |
|---|---|
| Agent with `public_id = eregna-guide-dev` | Skip agent insert; use that row |
| Page titled `Dashboard` for that agent | Skip page insert |
| Element with same `key` on that page | Skip that element |
| Site fact with same `title` | Skip that fact |

Print a short log: `created` / `skipped` per row.

---

## What the script inserts

```
1. Auth user     guide@eregna.dev  (password from env or random, printed once)
2. Agent         Eregna Guide        public_id: eregna-guide-dev
3. Page          Dashboard           url_pattern: /dashboard
4. Elements      6 rows              keys from 01-components.md
5. Site facts    2 rows              from 02-prompts.md
```

---

## Env vars

| Var | Required | Example |
|---|---|---|
| `EREGNA_SUPABASE_URL` | yes | `http://127.0.0.1:54321` |
| `EREGNA_SUPABASE_SECRET_KEY` | yes | service role key |
| `EREGNA_GUIDE_PUBLIC_ID` | no | default `eregna-guide-dev` |
| `EREGNA_GUIDE_ALLOWED_ORIGINS` | no | default `http://localhost:3000` |

**Dashboard app** (after seed):

| Var | Required | Example |
|---|---|---|
| `VITE_EREGNA_GUIDE_AGENT_ID` | yes for live widget | `eregna-guide-dev` |
| `VITE_EREGNA_API_URL` | yes | `http://localhost:4000` |

---

## How to run (after implementation)

```bash
# 1. Supabase up, migrations applied (uses apps/api/.env)
bun run --cwd packages/db seed:guide

# 2. Copy public id into apps/eregna/.env
#    VITE_EREGNA_GUIDE_AGENT_ID=eregna-guide-dev

# 3. Start API + dashboard, log in, open /dashboard
```

Add to root `package.json` or `packages/db/package.json`:

```json
"seed:guide": "bun run src/seed-guide-cli.ts"
```

---

## Allowed origins

The guide agent must list every origin you test from:

```sql
allowed_origins = ARRAY['http://localhost:3000']
```

Without this, `POST /public/agent/run` returns 403 and the widget stays on the sample conversation or shows an error.

---

## Not in the seed script

- No sample walkthrough stored in Postgres (runs live every time)
- No tools registered (dashboard page has none)
- No per-user copy when someone signs up
- No production `eregna.dev` origin until you opt in
