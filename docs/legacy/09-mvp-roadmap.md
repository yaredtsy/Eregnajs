# 09 — MVP Roadmap

This document tracks what needs to be built for the Phase 1 MVP, in execution order.  
Each task links to the relevant design doc.

---

## Phase 1 goal

A working end-to-end flow:

> A user signs up → creates an agent → builds a page/element knowledge tree  
> → copies the embed snippet → pastes it on their site → a visitor opens the chat bubble  
> → asks a question → gets a streamed, knowledge-base-aware answer.

---

## Work streams

```
Stream A: Infrastructure     → Supabase + API server skeleton
Stream B: Auth               → Login page + JWT verification
Stream C: Dashboard UI       → Agent CRUD + knowledge tree editor
Stream D: Widget             → Chat bubble + SSE consumer
Stream E: Chat pipeline      → Embedding + RAG + LLM streaming
```

Streams A and B must be done first. C, D, E can proceed in parallel after that.

---

## Task list

### Stream A — Infrastructure

- [ ] **A1** Create `apps/api/` package with Bun + Hono skeleton
  - `src/index.ts`, `src/app.ts`, `package.json`, `tsconfig.json`
  - Health route `GET /health`
  - Global CORS + logger middleware
  - Ref: `04-api-layer.md`

- [ ] **A2** Create `packages/db/` package
  - `src/client.ts` — `createBrowserClient()` / `createServerClient()`
  - Ref: `03-supabase-setup.md`

- [ ] **A3** Write and run migration `0001_extensions.sql`
  - Enable `uuid-ossp`, `ltree`, `vector`

- [ ] **A4** Write and run migrations `0002` → `0008`
  - All tables + triggers + RLS + `match_elements` RPC
  - Ref: `02-database-models.md`, `03-supabase-setup.md`

- [ ] **A5** Generate TypeScript types from Supabase
  - `supabase gen types typescript --local > packages/db/src/types.ts`

- [ ] **A6** Wire `apps/api` to Supabase via `packages/db`
  - Auth middleware (`src/middleware/auth.ts`)
  - Ref: `04-api-layer.md`, `07-auth.md`

- [ ] **A7** Add `api` to `turbo.json` dev pipeline

---

### Stream B — Auth

- [ ] **B1** Enable Google OAuth in Supabase dashboard + Google Cloud Console
  - Ref: `07-auth.md`

- [ ] **B2** Enable Email + Password in Supabase Auth settings

- [ ] **B3** Update `login.tsx` — add email/password form below Google button
  - Sign-up and sign-in tabs
  - Password reset link

- [ ] **B4** Verify `auth.callback.tsx` handles both OAuth redirect and email confirmation

- [ ] **B5** Add `AuthProvider` to `__root.tsx`, inject `auth` into router context

- [ ] **B6** Add `beforeLoad` guard to all `/dashboard/*` routes
  - Ref: `06-dashboard-ui.md`, `07-auth.md`

---

### Stream C — Dashboard UI

- [ ] **C1** Build `AppShell` — Header + Sidebar + `<Outlet />`

- [ ] **C2** Agent list page (`/dashboard`)
  - `useAgents` hook → `GET /v1/agents`
  - `AgentCard` component

- [ ] **C3** API routes for agents
  - `agentService` (list, create, getById, update, delete)
  - Routes: `GET`, `POST /v1/agents` + `GET`, `PATCH`, `DELETE /v1/agents/:id`
  - Ref: `04-api-layer.md`

- [ ] **C4** Create agent wizard (`/dashboard/new`)
  - Two-step form with Zod validation
  - On success → redirect to `/dashboard/:agentId/knowledge`

- [ ] **C5** Agent overview page (`/dashboard/:agentId`)
  - Embed code snippet with copy button

- [ ] **C6** Page tree view (`/dashboard/:agentId/knowledge`)
  - `GET /v1/pages?agentId=:id` → `buildTree()` utility → `PageTree` component
  - Add / rename / delete pages
  - Ref: `06-dashboard-ui.md`

- [ ] **C7** API routes for pages
  - `pageService` (list, create, update, delete)
  - `path` computation from `parent_id` + title slugification
  - Ref: `04-api-layer.md`

- [ ] **C8** Page detail + element tree (`/dashboard/:agentId/knowledge/:pageId`)
  - `GET /v1/elements?pageId=:id` → `buildTree()` → `ElementTree`
  - `ElementForm` — label, dom_id, css_selector, description, notes
  - Ref: `06-dashboard-ui.md`

- [ ] **C9** API routes for elements
  - `elementService` (list, create, update, delete)
  - Trigger embedding on create/update description
  - Ref: `04-api-layer.md`, `08-agent-chat.md`

- [ ] **C10** Agent settings page (`/dashboard/:agentId/settings`)
  - Edit name, description, website_url, model, system_prompt
  - Deactivate / delete agent

---

### Stream D — Widget

- [ ] **D1** Update `packages/widget` to accept `agentId` prop

- [ ] **D2** Implement `embed-auto.ts` — reads `data-agent-id`, calls `initWidget({ agentId })`

- [ ] **D3** Build `useChat` hook with SSE fetch + JSON-Patch state
  - Ref: `05-widget-embed.md`

- [ ] **D4** Build `ChatPanel` — full conversation UI
  - `MessageList` + `Message` + `InputBar`

- [ ] **D5** Add `fast-json-patch` dependency to `packages/widget`

- [ ] **D6** Configure Vite to emit both ESM lib and IIFE bundle

- [ ] **D7** Smoke-test the widget standalone in `packages/widget/index.html`

---

### Stream E — Chat pipeline

- [ ] **E1** Add `openai` SDK to `apps/api`

- [ ] **E2** Implement `chatService.run()` — full RAG pipeline
  - Embed query → `match_elements` RPC → build prompt → stream completions
  - Ref: `08-agent-chat.md`

- [ ] **E3** Implement `POST /v1/chat/:publicId` SSE route
  - `streamSSE` from Hono, JSON-Patch event protocol
  - Ref: `04-api-layer.md`, `08-agent-chat.md`

- [ ] **E4** Integrate embedding generation in `elementService`
  - Fire-and-forget on create / description update

- [ ] **E5** Seed dev data with real descriptions → verify `match_elements` returns results

- [ ] **E6** End-to-end test: widget on localhost → asks question → gets streamed answer

---

## Acceptance criteria (Phase 1 done)

| # | Criterion |
|---|-----------|
| 1 | User can sign up with Google or email/password |
| 2 | User can create, edit, and delete agents |
| 3 | User can build a page tree (add/rename/delete pages) |
| 4 | User can add elements to a page with descriptions |
| 5 | Embed snippet is shown and copyable |
| 6 | Widget loads on any page via script tag + `data-agent-id` |
| 7 | Widget chat streams a contextual response using the knowledge base |
| 8 | Conversations and messages are persisted to the DB |
| 9 | All dashboard data is strictly user-scoped (RLS verified) |
| 10 | API runs on Bun, starts with `bun run dev`, no build step required |

---

## Out of scope for Phase 1

| Feature | Target phase |
|---------|-------------|
| LangGraph multi-node agent | Phase 2 |
| Driver.js overlay / element highlighting | Phase 2 |
| Analytics dashboard (message counts, top queries) | Phase 2 |
| Anthropic / Gemini model support | Phase 2 |
| Custom widget theming via `data-theme` | Phase 2 |
| Magic link / SSO auth | Phase 2 |
| Usage limits / billing | Phase 3 |
| Multi-user teams / workspaces | Phase 3 |
| CDN delivery of widget bundle | Phase 3 |
| Self-hosted option | Phase 3 |

---

## Tech debt to track from Phase 1

| Item | Notes |
|------|-------|
| IVFFlat index requires training | Only create it after ≥ 1000 rows; use `HNSW` for smaller sets |
| `/messages/0/content` path in JSON-Patch | Fragile — use stable message ID path in Phase 2 |
| No rate limiting on `/v1/chat/*` | Add per-`public_id` limit in Phase 2 |
| Embedding generation is synchronous in request | Move to a queue / background job in Phase 2 |
| No retry on failed embedding calls | Add retry with exponential backoff |

---

## Development workflow

```bash
# 1. Start Supabase locally
supabase start

# 2. Run migrations + local seed (or `db push --local` to apply pending only)
supabase db reset

# 3. Generate types
supabase gen types typescript --local > packages/db/src/types.ts

# 4. Start everything in parallel (Turborepo)
pnpm dev
# → apps/api on :4000
# → apps/eregna on :3000
# → packages/widget dev server on :5173

# 5. Seed dev data
bun run --cwd packages/db seed
```
