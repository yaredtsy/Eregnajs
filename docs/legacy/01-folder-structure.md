# 01 — Folder Structure & Naming Conventions

This document defines the canonical layout for every workspace in the monorepo.  
**Do not deviate from this structure without updating this doc.**

---

## Monorepo root

```
Eregna/
├── apps/
│   ├── eregna/        # Dashboard (TanStack Start / React 19 / Vite)
│   └── api/           # REST + SSE API  (Bun + Hono)
├── packages/
│   ├── widget/        # Embeddable chat bubble
│   ├── ui/            # Shared React component library
│   ├── db/            # Supabase client + generated types + seed helpers
│   └── ai/            # Agent core (Phase 2)
├── docs/              # All design docs (this folder)
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

---

## `apps/eregna` — Dashboard SPA

```
apps/eregna/
├── public/
│   └── favicon.svg
├── src/
│   ├── routes/
│   │   ├── __root.tsx                 # Root layout + providers
│   │   ├── index.tsx                  # Marketing / landing
│   │   ├── login.tsx                  # Auth page
│   │   ├── auth.callback.tsx          # OAuth redirect handler
│   │   ├── dashboard/
│   │   │   ├── index.tsx              # Agent list
│   │   │   ├── $agentId/
│   │   │   │   ├── index.tsx          # Agent overview
│   │   │   │   ├── knowledge/
│   │   │   │   │   ├── index.tsx      # Page tree root
│   │   │   │   │   └── $pageId.tsx    # Page detail + element tree
│   │   │   │   └── settings.tsx       # Agent settings / embed code
│   │   │   └── new.tsx                # Create agent wizard
│   │   └── api.health.ts              # Server health check
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppShell.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   └── Header.tsx
│   │   ├── agents/
│   │   │   ├── AgentCard.tsx
│   │   │   ├── AgentForm.tsx
│   │   │   └── EmbedCodeSnippet.tsx
│   │   ├── knowledge/
│   │   │   ├── PageTree.tsx           # ltree path → tree UI
│   │   │   ├── PageForm.tsx
│   │   │   ├── ElementTree.tsx        # Recursive element list
│   │   │   └── ElementForm.tsx
│   │   └── ui/                        # Re-exports from @repo/ui
│   ├── lib/
│   │   ├── supabase.ts                # Supabase browser client
│   │   ├── auth.tsx                   # useAuth hook + AuthProvider
│   │   ├── api.ts                     # Typed fetch wrappers → API layer
│   │   └── utils.ts
│   ├── hooks/
│   │   ├── useAgents.ts
│   │   ├── usePages.ts
│   │   └── useElements.ts
│   ├── stores/                        # TanStack Store slices
│   │   └── agent.store.ts
│   ├── styles.css
│   ├── router.tsx
│   └── vite-env.d.ts
├── vite.config.ts
├── tsconfig.json
└── package.json
```

### Naming rules — Dashboard

| Entity | Convention | Example |
|--------|-----------|---------|
| Route files | `lowercase.tsx` | `dashboard.tsx` |
| Component files | `PascalCase.tsx` | `AgentCard.tsx` |
| Hook files | `camelCase.ts` | `useAgents.ts` |
| Store files | `camelCase.store.ts` | `agent.store.ts` |
| Util files | `camelCase.ts` | `utils.ts` |

---

## `apps/api` — API server

```
apps/api/
├── src/
│   ├── index.ts                   # Bun entry — creates Hono app + starts server
│   ├── app.ts                     # Hono app factory (testable without starting)
│   ├── middleware/
│   │   ├── auth.ts                # JWT verification via Supabase Admin
│   │   ├── cors.ts
│   │   └── logger.ts
│   ├── routes/
│   │   ├── index.ts               # Route registration
│   │   ├── agents.ts              # /v1/agents
│   │   ├── pages.ts               # /v1/pages
│   │   ├── elements.ts            # /v1/elements
│   │   └── chat.ts                # /v1/chat/:agentId  (SSE)
│   ├── services/
│   │   ├── agent.service.ts       # Business logic for agents
│   │   ├── page.service.ts
│   │   ├── element.service.ts
│   │   └── chat.service.ts        # RAG retrieval + LLM call
│   ├── db/
│   │   └── client.ts              # Supabase service-role client (server only)
│   └── types/
│       └── index.ts               # Shared DTOs / Zod schemas
├── package.json
└── tsconfig.json
```

### Naming rules — API

| Layer | Convention | Responsibility |
|-------|-----------|----------------|
| `routes/` | HTTP shape only — parse, validate, delegate | No SQL |
| `services/` | Business logic | Calls DB, calls AI |
| `middleware/` | Cross-cutting concerns | Auth, CORS, logging |
| `db/client.ts` | Single Supabase instance | Imported everywhere in API |

---

## `packages/widget` — Embeddable widget

```
packages/widget/
├── src/
│   ├── embed.tsx          # initWidget() — Shadow DOM bootstrap
│   ├── Widget.tsx         # Root React component
│   ├── Chat.tsx           # Conversation UI
│   ├── MessageList.tsx    # Message rendering
│   ├── InputBar.tsx       # User input + send
│   ├── hooks/
│   │   └── useChat.ts     # SSE consumer + JSON-Patch applier
│   ├── widget.css         # All styles (injected into Shadow DOM)
│   └── index.ts           # Public exports: initWidget, EregnaWidget
├── vite.config.ts         # Builds both ESM lib + standalone IIFE bundle
└── package.json
```

The widget is **framework-agnostic at the embed layer** — it mounts React inside a Shadow DOM so host-page styles never bleed in.

---

## `packages/db` — Database layer

```
packages/db/
├── src/
│   ├── client.ts              # createClient() factory — browser & server variants
│   ├── types.ts               # Hand-maintained or generated Database types
│   └── seed.ts                # Development seed (Auth API + DB rows)
└── package.json
```

SQL migrations and `seed.sql` for local Supabase live under **`supabase/`** at the repo root (see `03-supabase-setup.md`).

---

## `packages/ai` — Agent core (Phase 2)

```
packages/ai/
├── src/
│   ├── graph.ts               # LangGraph StateGraph definition
│   ├── nodes/
│   │   ├── retrieve.ts        # pgvector similarity search node
│   │   ├── generate.ts        # LLM generation node
│   │   └── route.ts           # Intent router node
│   ├── tools/
│   │   └── lookupElement.ts   # Tool: find DOM element by description
│   └── prompts/
│       ├── system.ts
│       └── retrieval.ts
└── package.json
```

---

## General rules

1. **Barrel files** (`index.ts`) only at package boundaries — not inside `src/`.
2. **No circular imports** between packages — dependency order: `db` → `ai` → `api` → `widget` / `eregna`.
3. **Environment variables** — prefixed `EREGNA_` server-side, `VITE_EREGNA_` client-side.
4. **All API paths** versioned under `/v1/` from day one.
5. **Types flow from `packages/db`** — never define DB row shapes in application code.
