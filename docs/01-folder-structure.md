# 01 — Folder Structure

Updated for the walkthrough-first product. Anything not in this layout is either legacy or future-phase.

---

## Monorepo root

```
Eregna/
├── apps/
│   ├── eregna/             # Dashboard SPA (TanStack Start / React 19 / Vite)
│   └── api/                # Bun + Hono — REST + SSE walkthrough streamer
├── packages/
│   ├── db/                 # Drizzle schema + client + migrations
│   ├── widget/             # Embeddable widget — shadow DOM player + overlay
│   ├── walkthrough-core/   # Headless engine: types, executor, store contract
│   └── ui/                 # Shared design-system components
├── docs/                   # This folder (walkthrough-first design)
│   └── legacy/             # Previous chat-only docs, kept for reference
├── supabase/               # Supabase CLI config (auth + hosted Postgres)
└── turbo.json
```

### Why a new `packages/walkthrough-core`?

The engine, action schema, and adapter interface have **no DOM dependency at the type level** and **no React dependency**. They get consumed by `packages/widget` (which provides the DOM adapter and the React store/UI) and tested in isolation. Putting them in their own package prevents the temptation to reach into React or `document` from the engine.

`packages/ai` from the legacy plan is folded into `apps/api`. Splitting it out only makes sense once we have a second consumer.

---

## `apps/eregna` — Dashboard SPA

```
apps/eregna/src/
├── routes/
│   ├── __root.tsx
│   ├── index.tsx                          # marketing / landing
│   ├── login.tsx                          # auth page
│   ├── auth.callback.tsx                  # OAuth redirect
│   └── dashboard/
│       ├── index.tsx                      # agent list
│       ├── new.tsx                        # create-agent wizard
│       └── $agentId/
│           ├── index.tsx                  # overview + embed snippet
│           ├── settings.tsx               # name, model, system prompt
│           └── knowledge/
│               ├── index.tsx              # page list (MVP: usually one page)
│               └── $pageId.tsx            # element tree editor (the main UX)
├── components/
│   ├── layout/{AppShell,Sidebar,Header}.tsx
│   ├── agents/{AgentCard,AgentForm,EmbedSnippet}.tsx
│   ├── knowledge/
│   │   ├── ElementTree.tsx                # hierarchical tree with DOM selector + description
│   │   ├── ElementForm.tsx                # label / dom_id / css_selector / description / register_intent
│   │   └── SelectorPicker.tsx             # paste selector OR click-to-pick via temporary inspector
│   └── ui/                                # re-exports from @repo/ui
├── lib/
│   ├── supabase.ts                        # browser auth client only — never DB
│   ├── auth.tsx                           # AuthProvider + useAuth
│   ├── api.ts                             # typed fetch → apps/api
│   └── utils.ts
└── hooks/
    ├── useAgents.ts
    ├── usePages.ts
    └── useElements.ts
```

The dashboard **never** talks to the database directly. All persistence flows through `apps/api`. Supabase is used in the dashboard only for Auth (sessions + JWT). This keeps a single place for ownership checks and lets us swap auth providers later.

---

## `apps/api` — Hono server

```
apps/api/src/
├── index.ts                               # Bun entry — boots Hono
├── app.ts                                 # app factory (testable without listen)
├── middleware/
│   ├── auth.ts                            # verify Supabase JWT, set userId
│   └── cors.ts
├── routes/
│   ├── agents.ts                          # /v1/agents
│   ├── pages.ts                           # /v1/pages
│   ├── elements.ts                        # /v1/elements
│   └── walkthroughs.ts                    # /v1/walkthroughs/run  (SSE)
├── services/
│   ├── agent.service.ts
│   ├── page.service.ts
│   ├── element.service.ts                 # also generates embedding (Phase 2)
│   ├── planner.service.ts                 # LLM call #1: query → page + plan outline
│   └── streamer.service.ts                # LLM call #2: streams Step objects
└── lib/
    ├── db.ts                              # re-exports drizzle client + schema
    └── llm.ts                             # OpenAI/Anthropic client factory
```

The two LLM stages — **planner** and **streamer** — are split so the planner can run to completion (it picks a page and outlines steps) before the streamer begins emitting playable steps. See `12-agent-planning.md`.

---

## `packages/db` — Drizzle layer

```
packages/db/
├── src/
│   ├── schema/
│   │   ├── agents.ts
│   │   ├── pages.ts
│   │   ├── elements.ts
│   │   ├── walkthroughSessions.ts
│   │   └── index.ts                       # barrel: export * from each schema
│   ├── client.ts                          # drizzle({ client: postgres(url) })
│   ├── types.ts                           # Zod schemas derived from drizzle-zod
│   └── seed.ts
├── drizzle.config.ts                      # drizzle-kit config (output: ./migrations)
├── migrations/                            # generated SQL files
└── package.json
```

Conventions:
- One file per table. Relations are declared in `relations.ts` alongside the table that owns the foreign key.
- Zod input/output schemas live in `types.ts` and are **derived** from the drizzle schema via `drizzle-zod`. Hand-written Zod is forbidden — types drift otherwise.
- `client.ts` exports two factories: `createDbClient(url)` for the API (service role) and a `db` instance for scripts.

---

## `packages/walkthrough-core` — Headless engine

```
packages/walkthrough-core/src/
├── types/
│   ├── walkthrough.ts                     # Walkthrough, Step, Action union
│   ├── timeline.ts                        # StepTimeline, ActionTimeline, TimelinePosition
│   └── index.ts
├── engine/
│   ├── WalkthroughEngine.ts               # orchestrator
│   ├── StepExecutor.ts                    # per-step runner
│   ├── TimelineBuilder.ts                 # pre-computes timing for seek
│   ├── CleanupStack.ts                    # LIFO teardown
│   ├── StepQueue.ts                       # append-as-they-stream queue (NEW vs old plan)
│   └── index.ts
├── actions/
│   ├── ActionHandlerRegistry.ts
│   ├── handlers/{highlightElement,scrollTo,popover,waitForClick,waitForElement,...}.ts
│   └── index.ts
├── adapters/
│   └── HostAdapter.ts                     # interface — no DOM code lives here
└── store/
    └── WalkthroughStoreContract.ts        # the shape the engine writes into
```

This package depends on **nothing** beyond a tiny utility (e.g. `abortable-sleep`). It does not import React, Zustand, or the DOM. The widget plugs in:
- a `HostAdapter` implementation that does DOM work
- a Zustand store that satisfies `WalkthroughStoreContract`
- React components that read the store

This is exactly the boundary the old walkthrough-plan called `CanvasAdapter` — we just renamed it `HostAdapter` because we no longer target React Flow.

---

## `packages/widget` — Embeddable player

```
packages/widget/src/
├── embed.tsx                              # initWidget() — shadow DOM bootstrap
├── Widget.tsx                             # root component
├── components/
│   ├── PlayerBar.tsx                      # play/pause/seek + speed + chat input (merged)
│   ├── ChatLog.tsx                        # transcript when in "ask" mode
│   ├── PopoverLayer.tsx                   # popover with typewriter text
│   └── SpotlightOverlay.tsx               # painted on host body, outside shadow DOM
├── adapter/
│   └── DomHostAdapter.ts                  # implements HostAdapter for real DOM
├── store/
│   └── useWalkthroughStore.ts             # Zustand — satisfies WalkthroughStoreContract
├── hooks/
│   ├── useWalkthrough.ts                  # creates engine, binds adapter+store
│   ├── useStream.ts                       # SSE → StepQueue.append
│   └── useTypewriter.ts
├── styles/widget.css                      # injected into shadow root
└── overlay.css                            # injected into host document for spotlights
```

The widget has **two DOM surfaces**:

1. **Shadow DOM mount** — for the player UI (player bar, chat log, popover). CSS-isolated from the host.
2. **Overlay on host `<body>`** — for spotlight rings, scroll anchors, and element-level decorations that must align pixel-perfect with the host's elements. Shadow DOM can't paint outside itself, and host CSS can fight with `position: fixed` inside shadow. We use a regular `<div data-eregna-overlay>` on the host body with our own scoped class names; collisions are unlikely because they are namespaced.

See `05-embed-bootstrap.md` for the full DOM-isolation story.

---

## Naming rules (project-wide)

| Entity | Convention | Example |
|---|---|---|
| Route files | `lowercase.tsx` | `dashboard.tsx` |
| Component files | `PascalCase.tsx` | `ElementTree.tsx` |
| Hook files | `camelCase.ts`, prefix `use` | `useWalkthrough.ts` |
| Drizzle schema | `camelCase.ts` per table | `walkthroughSessions.ts` |
| Service modules | `camelCase.service.ts` | `planner.service.ts` |
| Public IDs | URL-safe slug + 6 random chars | `acme-abc123` |

Cross-package import direction: **`db` → `walkthrough-core` → `widget`/`api` → `eregna`**. No back-edges.
