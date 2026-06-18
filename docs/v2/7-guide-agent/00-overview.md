# 7.0 — Guide agent (overview)

> A **dev-only** agent that knows the `/dashboard` page. You use it to test the **full loop**:
> ask a question → server streams a walkthrough → widget plays spotlight + popover + timeline.
>
> **Not for production visitors.** This is for you while building. Approve this doc set, then we
> implement.

---

## What problem this solves

Today the widget on `/dashboard` plays a **hard-coded** sample conversation
(`packages/widget/src/data/sample-conversation.ts`). That is good for UI work. It does **not**
test:

- loading context from Postgres
- the planner / stepper / narrator pipeline
- NDJSON patches arriving live
- the engine resolving real component keys from the manifest

The guide agent replaces the sample with a **real run** against a **seeded** knowledgebase.

## What we register (small on purpose)

One **page**: the agents list (`/dashboard`).

Six **components** — only the create-agent flow:

| # | Key | What it is on screen |
|---|---|---|
| 1 | `dashboard.hero` | Page title block ("Agents") |
| 2 | `dashboard.agents-grid` | Grid of agent cards (or empty state) |
| 3 | `dashboard.new-agent-btn` | "+ New agent" button |
| 4 | `dashboard.agent-name` | Name field in the form |
| 5 | `dashboard.agent-url` | Website URL field in the form |
| 6 | `dashboard.create-form` | The whole form section (submit lives here) |

We **do not** register description, model, or system-prompt fields yet. Keep the KB tiny.

## Where the widget uses this agent

| Route | Uses guide agent? | Why |
|---|---|---|
| `/dashboard` | **Yes** | Main test surface — stream + animation together |
| `/dashboard/$agentId` (embed tab) | **Yes** | Same agent id in the embed snippet for a second test surface |
| `/` (marketing home) | No | Stays static or no widget for now |
| `/dashboard/$agentId/playground` | No | Uses the **customer's** agent, not the guide |
| Component gallery | No | Static fixtures only |

## What you approve in this folder

Read in order:

| File | You check |
|---|---|
| [01-components.md](./01-components.md) | Keys, DOM ids, selectors, descriptions, notes |
| [02-prompts.md](./02-prompts.md) | Agent name, system prompt, site facts, example questions |
| [03-seed.md](./03-seed.md) | Seed script behaviour, env vars, idempotency |
| [04-wiring.md](./04-wiring.md) | How dashboard mounts the widget with the guide `public_id` |
| [05-how-to-test.md](./05-how-to-test.md) | Queries to try, what "good" looks like |

## Depends on (must work first)

1. **Public run endpoint** — `POST /public/agent/run` with origin check (`3-server/06`).
2. **Widget wired to API** — `initWidget({ agentPublicId, apiBase })` (playground already does this).
3. **Knowledge v2 columns** — `elements.key`, `elements.selectors` (migration already landed).

## Out of scope (for now)

- Seeding per new user automatically
- Homepage marketing site
- Tools / hostState on dashboard
- Replacing the component gallery fixtures
- Production CDN embed for eregna.dev
