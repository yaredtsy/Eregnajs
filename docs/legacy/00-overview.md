# Eregna — Project Overview

> **Eregna** is an embeddable AI-powered guide widget (think Driver.js + LLM agent).  
> Customers add a single `<script>` tag to their site; visitors get a floating chat bubble that answers questions using a structured knowledge-base the customer configures in the Eregna dashboard.

---

## What problem does it solve?

| Pain point | Eregna solution |
|---|---|
| Users don't know where things are on a page | Embeddable chat bubble with DOM-aware context |
| Onboarding docs are hard to maintain | Knowledge-base is tied to real page URLs & element IDs |
| Generic chatbots have no site-specific context | Per-agent knowledge tree: site → pages → elements |
| Developers need a simple integration | One script tag + agent `PUBLIC_ID` |

---

## High-level architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser (customer's site)                                      │
│  <script src="cdn/eregna.js" data-agent-id="abc123"></script>   │
│  └── Chat Bubble Widget (Shadow DOM, isolated CSS)              │
│       └── SSE stream → API                                      │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTPS / SSE
┌────────────────────────▼────────────────────────────────────────┐
│  API Layer  (Bun + Hono)  — apps/api                            │
│  • /v1/chat/:agentId  (SSE, JSON-Patch stream)                  │
│  • /v1/agents         (CRUD)                                    │
│  • /v1/pages          (CRUD, tree)                              │
│  • /v1/elements       (CRUD, recursive)                         │
│  • /v1/auth           (Supabase passthrough)                    │
└────────────────────────┬────────────────────────────────────────┘
                         │ Supabase JS SDK / pg driver
┌────────────────────────▼────────────────────────────────────────┐
│  Supabase (Postgres + Auth + Storage + Edge Functions)          │
│  • pgvector  — embedding search                                 │
│  • ltree     — page/element hierarchy                           │
│  • Row-Level Security on every table                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Monorepo layout

```
Eregna/
├── apps/
│   ├── eregna/          # Dashboard SPA — TanStack Start (React 19)
│   └── api/             # [NEW] Bun + Hono REST + SSE API
├── packages/
│   ├── widget/          # Embeddable chat bubble (Shadow DOM + React)
│   ├── ui/              # Shared design-system components
│   ├── db/              # [NEW] Supabase client + generated types
│   └── ai/              # [NEW] LangChain/LangGraph agent (Phase 2+)
├── docs/
│   ├── 00-overview.md           ← you are here
│   ├── 01-folder-structure.md
│   ├── 02-database-models.md
│   ├── 03-supabase-setup.md
│   ├── 04-api-layer.md
│   ├── 05-widget-embed.md
│   ├── 06-dashboard-ui.md
│   ├── 07-auth.md
│   ├── 08-agent-chat.md
│   └── 09-mvp-roadmap.md
├── supabase/            # CLI config, migrations/, seed.sql
└── turbo.json
```

---

## Document index

| # | File | Covers |
|---|------|--------|
| 01 | `01-folder-structure.md` | Full monorepo layout, naming conventions |
| 02 | `02-database-models.md` | Every Postgres table, columns, RLS, indexes |
| 03 | `03-supabase-setup.md` | Migrations, ltree, pgvector, seed data |
| 04 | `04-api-layer.md` | Hono routes, middleware, SSE protocol |
| 05 | `05-widget-embed.md` | Embed script, Shadow DOM, chat protocol |
| 06 | `06-dashboard-ui.md` | Dashboard screens, state, routing |
| 07 | `07-auth.md` | Google OAuth + email/password, RLS patterns |
| 08 | `08-agent-chat.md` | MVP agent: retrieval → LLM → SSE stream |
| 09 | `09-mvp-roadmap.md` | Phase 1 tasks, acceptance criteria |

---

## MVP scope (Phase 1)

- [ ] Auth — Google OAuth + email/password via Supabase Auth
- [ ] Dashboard — list/create/delete **Agents** (embeddable instances)
- [ ] Knowledge-base editor — Website URL → Page tree → Element tree
- [ ] Embed script — loads by `PUBLIC_ID`, renders chat bubble
- [ ] Chat — simple retrieval-augmented chat with SSE streaming
- [ ] Row-Level Security — strict per-user data isolation

Everything else (walkthrough overlays, Driver.js integration, LangGraph workflows, analytics) is Phase 2+.
