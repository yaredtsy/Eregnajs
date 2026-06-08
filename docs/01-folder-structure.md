# 01 — Folder Structure

Updated for the walkthrough-first product. The shipped layout is what the dashboard, API, and widget actually look like as of 2026-05; the "deferred" sections describe pieces that the original design called for but haven't been built yet.

---

## Monorepo root

```
Eregna/
├── apps/
│   ├── eregna/             # Dashboard SPA (TanStack Router / React 19 / Vite)
│   └── api/                # Bun + Hono — REST CRUD over Supabase
├── packages/
│   ├── db/                 # Supabase JS client + generated Database types
│   ├── widget/             # Embeddable widget — shadow DOM player + spotlight overlay
│   └── ui/                 # Shared design-system primitives + lucide re-exports
├── docs/                   # This folder
│   └── legacy/             # Previous chat-only docs, kept for reference
├── supabase/               # Supabase CLI config + hand-written SQL migrations
└── turbo.json
```

### What's not here yet (deferred from original design)

- **`packages/walkthrough-core`** — the original plan called for a shared package that owned every wire type (Plan, Step, Action, stream events) so the dashboard / API / widget couldn't drift. It hasn't been split out; for now the walkthrough types live in `packages/widget/src/types/conversation.ts` and the widget plays a static sample, not a streamed plan. Promote it to a real package as soon as a second consumer (the API streamer) needs the same shapes.
- **Drizzle ORM** — `packages/db` is a generated-types package over the Supabase JS client, not a Drizzle schema. The design rationale for picking Drizzle is preserved in `data/01-drizzle-schema.md` under "Why Drizzle was on the roadmap"; the shipped path is Supabase types + hand-written SQL in `supabase/migrations/`.
- **`apps/api/src/routes/walkthroughs.ts`** — the SSE streamer. Sessions persistence exists (`/v1/sessions`); the planner + streamer that fill them with messages and steps do not.

---

## `apps/eregna` — Dashboard SPA

```
apps/eregna/src/
├── routes/
│   ├── __root.tsx
│   ├── index.tsx                              # marketing / landing
│   ├── login.tsx                              # auth page
│   ├── auth.callback.tsx                      # OAuth redirect
│   ├── api.health.ts                          # health check
│   └── dashboard/
│       ├── index.tsx                          # agent list + inline "New agent" modal toggle
│       ├── $agentId/
│       │   ├── route.tsx                      # layout: agent header + tab bar (Embed / Settings / Knowledge)
│       │   └── index.tsx                      # Embed tab — snippet, credentials, sessions list
│       ├── $agentId.settings.tsx              # Settings tab — name, model, prompt, active toggle
│       ├── $agentId.knowledge.index.tsx       # Knowledge tab — page tree + modal-based add
│       ├── $agentId.knowledge.$pageId.tsx     # Page editor — per-page detail + elements
│       └── $agentId.sitemap.tsx               # legacy redirect → /knowledge
├── components/
│   ├── AppChrome.tsx                          # top-level chrome (sidebar + outlet)
│   ├── Header.tsx
│   ├── Footer.tsx
│   ├── ThemeToggle.tsx
│   ├── agents/
│   │   ├── AgentCard.tsx
│   │   └── AgentForm.tsx
│   ├── dashboard/
│   │   ├── DashboardSidebar.tsx
│   │   ├── DashboardBreadcrumbs.tsx
│   │   └── CopyField.tsx
│   ├── pages/
│   │   └── PageTreeView.tsx                   # hierarchical page tree with hover actions
│   ├── elements/
│   │   └── AddElementModal.tsx                # "+ element" popup invokable from the tree
│   └── ui/
│       └── Modal.tsx                          # portal-based dialog primitive
├── lib/
│   ├── supabase.ts                            # browser auth client (sessions/JWT only)
│   ├── auth.tsx                               # AuthProvider + useAuth
│   ├── api.ts                                 # typed fetch wrapper → apps/api
│   ├── api-types.ts                           # client-side request/response shapes
│   └── utils.ts
└── hooks/
    ├── useAgents.ts
    ├── usePages.ts
    ├── useElements.ts
    └── useSessions.ts
```

The dashboard **never** talks to the database directly. All persistence flows through `apps/api`. Supabase is used in the dashboard only for Auth (sessions + JWT). This keeps a single place for ownership checks and lets us swap auth providers later.

> **Routing convention.** Files like `$agentId.settings.tsx` and `$agentId.knowledge.index.tsx` use TanStack Router's flat-route dot syntax and resolve as children of `$agentId/route.tsx`. The agent layout (tab bar + breadcrumb) wraps every tab via `<Outlet />`.

> **"Add" forms are modals.** The agent list, "Add page", and "Add element" forms all open through `components/ui/Modal.tsx` rather than inline expanding sections — important enough to call out because the docs in `dashboard/` predate this and described inline forms.

---

## `apps/api` — Hono server

```
apps/api/src/
├── index.ts                               # Bun entry — boots Hono
├── app.ts                                 # app factory (testable without listen)
├── middleware/
│   └── auth.ts                            # verify Supabase JWT, set userId on context
├── routes/
│   ├── agents.ts                          # /v1/agents (CRUD)
│   ├── pages.ts                           # /v1/pages (CRUD)
│   ├── elements.ts                        # /v1/elements (CRUD)
│   └── sessions.ts                        # /v1/sessions (visitor session CRUD + heartbeat)
├── services/
│   ├── agent.service.ts                   # also generates public_id + secret_key on create
│   ├── page.service.ts                    # ltree path computation
│   ├── element.service.ts                 # ltree path computation; strips embedding on read
│   └── session.service.ts                 # walkthrough_sessions list/create/get/touch
└── lib/
    ├── http.ts                            # jsonError helper
    └── ltree.ts                           # slugifyLtreeSegment, generatePublicId
```

CRUD-only today. The two LLM stages — **planner** and **streamer** — are still on the roadmap and would land as `routes/walkthroughs.ts` plus `services/{planner,streamer,walkthrough}.service.ts`. See `agent/02-pipeline.md` for the intended split.

There is no `apps/api/src/services/schemas/` directory — Zod request bodies live inline in the route files, since there's currently no second consumer that needs them.

### CORS

`apps/api/src/app.ts` reads `EREGNA_CORS_ORIGINS` (comma-separated) and falls back to `*` when unset. JWT verification happens via `supabase.auth.getUser(token)` in `middleware/auth.ts`; there is no service-role-key check (RLS is disabled in dev, so the anon key works).

---

## `packages/db` — Supabase types

```
packages/db/
├── src/
│   ├── client.ts                          # createBrowserClient / createServerClient factories
│   ├── types.ts                           # Database type (generated-style) — Tables<>, TablesInsert<>, TablesUpdate<>
│   ├── seed.ts
│   └── seed-cli.ts
├── package.json                           # exports: "@repo/db/client", "@repo/db/types"
└── (no migrations folder — SQL lives in /supabase/migrations)
```

The shipped layer is intentionally lightweight: one file of generated types, one client factory file. Any consumer (api, dashboard, widget) imports `Tables<'agents'>` etc. directly. Hand-edit `types.ts` when you add a table — there is no auto-generator wired up.

### Migrations

```
supabase/migrations/
├── 20250430100001_extensions.sql          # pgcrypto, ltree
├── 20250430100002_profiles.sql
├── 20250430100003_agents.sql
├── 20250430100004_pages.sql
├── 20250430100005_elements.sql
├── 20250430100006_conversations.sql       # legacy chat tables, kept around
├── 20250430100007_functions.sql
├── 20250430100008_rls.sql
├── 20250430110000_disable_rls.sql         # RLS turned off for MVP
└── 20250523000001_walkthroughs.sql        # walkthrough_sessions, session_messages,
                                           # message_text_parts, walkthroughs, walkthrough_steps
```

RLS was authored, then disabled in a follow-up migration. The trust model is now "API enforces ownership in the service layer." See `data/02-auth-and-ownership.md`.

---

## `packages/widget` — Embeddable player

```
packages/widget/src/
├── embed.tsx                              # initWidget() — shadow DOM bootstrap
├── dev-main.ts                            # dev entry (hot reload, not shipped)
├── Widget.tsx                             # WidgetProvider + WidgetInner
├── widget.css                             # CSS injected into the shadow root
├── components/
│   ├── BubbleFAB.tsx                      # bottom-right chat bubble
│   ├── ChatPopup/
│   │   ├── index.tsx                      # chat popup container
│   │   ├── MessageList.tsx
│   │   └── WalkthroughCard.tsx
│   ├── PlayerBar/
│   │   ├── index.tsx                      # transport + composer + speed select
│   │   └── Scrubber.tsx
│   └── WalkthroughOverlay/
│       ├── index.tsx                      # portal'd to document.body
│       ├── Spotlight.tsx                  # SVG mask cutout around target element
│       └── Popover.tsx                    # typewriter popover anchored to target
├── store/
│   └── widget-context.tsx                 # useReducer + Context (no Zustand)
├── hooks/
│   ├── usePlayer.ts                       # requestAnimationFrame tick loop
│   └── useElementRect.ts                  # tracks target getBoundingClientRect each frame
├── types/
│   └── conversation.ts                    # Message/Part/Walkthrough/Step types + timing constants
└── data/
    └── sample-conversation.ts             # static conversation used by the player today
```

The widget has **two DOM surfaces**:

1. **Shadow DOM mount** — `<div id="eregna-host">` on the host body, with an open shadow root. The chat popup, player bar, and FAB live here; `widget.css` is injected into the root for CSS isolation.
2. **Body-level overlay portal** — `WalkthroughOverlay` uses `createPortal(…, document.body)` to paint the spotlight + popover on the host body. It is *not* a separate `<div data-eregna-overlay>` container — the portal target is `document.body` directly, and overlay styles ship in `widget.css` under the same shadow root. Plain CSS for the overlay elements (no shadow isolation needed) lives alongside; class names are `eregna-*` prefixed.

See `widget/01-embed-and-bootstrap.md` for the boot sequence and `widget/02-overlay-and-isolation.md` for the isolation rules.

### Why no `packages/walkthrough-core` yet

The conversation/walkthrough types live in `packages/widget/src/types/conversation.ts`. The widget is currently the only consumer (it plays `data/sample-conversation.ts`). When the API streamer arrives and needs to emit the same `Step` shape, lift this file into `packages/walkthrough-core/src/types/conversation.ts` and have both widget + api import from there — that's the trigger to actually create the package, not before.

---

## Naming rules (project-wide)

| Entity | Convention | Example |
|---|---|---|
| Route files | TanStack-flat / `lowercase` | `$agentId.knowledge.index.tsx` |
| Layout routes | `route.tsx` inside the folder | `dashboard/$agentId/route.tsx` |
| Component files | `PascalCase.tsx` | `PageTreeView.tsx` |
| Hook files | `camelCase.ts`, prefix `use` | `useSessions.ts` |
| Supabase tables | `snake_case` | `walkthrough_sessions` |
| Service modules | `camelCase.service.ts` | `session.service.ts` |
| Public IDs | URL-safe slug + 6 random chars | `acme-abc123` |

### Import direction (intended)

```
db  →  widget / api  →  eregna
```

No back-edges. Not enforced by tooling yet — relying on code review. The would-be `walkthrough-core` package sits between `db` and `widget / api` when it lands.
