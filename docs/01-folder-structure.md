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

`walkthrough-core` owns **everything that crosses a wire** — HTTP request/response bodies, SSE event frames, postMessage payloads between the dashboard and the widget picker, and the JSON shapes we store in Postgres (`plan_json`, `step_json`, `parent_context_json`). It also owns the headless engine, action schema, and adapter interface — which have **no DOM dependency at the type level** and **no React dependency**.

Putting all of this in one package means there is exactly **one source of truth** for any shape consumed by more than one part of the system. The widget, dashboard, and API all import the same TypeScript types and the same Zod schemas. There is no `api-types.ts` duplicate in the dashboard, no hand-written `WalkthroughStep` in the widget, no Plan schema living next to the planner service. When the contract changes, you change it here and every consumer breaks at compile time.

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
│   ├── walkthrough.service.ts             # session/message/walkthrough/step persistence
│   ├── planner.service.ts                 # LLM call #1: query → Plan (uses PlanSchema from walkthrough-core)
│   └── streamer.service.ts                # LLM call #2: streams Step objects (uses StepSchema from walkthrough-core)
└── lib/
    ├── db.ts                              # re-exports drizzle client + schema
    └── llm.ts                             # OpenAI/Anthropic client factory
```

The two LLM stages — **planner** and **streamer** — are split so the planner can run to completion (it picks a page and outlines steps) before the streamer begins emitting playable steps. See `agent/02-pipeline.md`.

There is **no `apps/api/src/services/schemas/` directory.** All schemas (Plan, Step, Action, SelectorSpec, wire events, request bodies) live in `packages/walkthrough-core/src/schemas/` and are imported from there. This is what makes the dashboard's typed API client work without duplication and what lets the replay endpoint validate stored JSON against the same Plan schema the planner produces.

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

## `packages/walkthrough-core` — Shared contract + headless engine

```
packages/walkthrough-core/src/
├── types/                                 # pure TS, the canonical wire shapes
│   ├── plan.ts                            # Plan, PlanStep, PlanStepIntent, BranchInfo
│   ├── walkthrough.ts                     # Step, Action union, SelectorSpec, PopoverConfig, PopoverAnchor
│   ├── conversation.ts                    # Conversation, Message, MessagePart, TextPart, WalkthroughPart
│   ├── timeline.ts                        # Position, Chapter (derived only — never persisted)
│   └── index.ts                           # barrel
│
├── wire/                                  # contracts that cross process boundaries
│   ├── stream-events.ts                   # WalkthroughStreamEvent discriminated union (SSE frames)
│   ├── picker.ts                          # PickerMessage union (dashboard ↔ widget picker postMessage)
│   ├── api.ts                             # request/response envelopes for every /v1 route
│   └── index.ts
│
├── schemas/                               # Zod versions of types + wire (one place, no hand-written Zod elsewhere)
│   ├── plan.schema.ts                     # PlanSchema, migratePlan
│   ├── walkthrough.schema.ts              # StepSchema, ActionSchema, SelectorSpecSchema
│   ├── stream-events.schema.ts            # WalkthroughStreamEventSchema
│   ├── api.schema.ts                      # body validators for routes
│   └── index.ts
│
├── utils/                                 # pure helpers; safe to call from anywhere
│   ├── stepDuration.ts                    # computeStepDuration, defaultDuration
│   ├── timeline.ts                        # buildTimeline(conversation) → Timeline
│   ├── elementTree.ts                     # flat ↔ tree (used by dashboard editor AND adapter registry)
│   ├── embed.ts                           # buildEmbedSnippet(publicId) — used by dashboard + marketing
│   └── ids.ts                             # publicId, slug, ULID helpers
│
├── engine/                                # headless playback — no DOM, no React
│   ├── WalkthroughEngine.ts               # orchestrator
│   ├── StepExecutor.ts                    # per-step runner
│   ├── StepQueue.ts                       # append-as-they-stream queue
│   ├── CleanupStack.ts                    # LIFO teardown
│   ├── TimelineBuilder.ts                 # (Phase 2) pre-computes timing for seek
│   └── index.ts
│
├── actions/                               # one handler per Action union member
│   ├── ActionHandlerRegistry.ts
│   ├── handlers/{highlightElement,scrollTo,popover,waitForClick,waitForElement,...}.ts
│   └── index.ts
│
├── adapters/
│   └── HostAdapter.ts                     # interface — no DOM code lives here
│
└── store/
    └── WalkthroughStoreContract.ts        # the shape the engine writes into
```

This package depends on **nothing runtime** beyond Zod and a tiny `abortable-sleep` utility. It does not import React, Zustand, or the DOM. The widget plugs in:
- a `HostAdapter` implementation that does DOM work
- a Zustand store that satisfies `WalkthroughStoreContract`
- React components that read the store

This is exactly the boundary the old walkthrough-plan called `CanvasAdapter` — renamed `HostAdapter` because we no longer target React Flow.

### Standing it up — types first, engine later

The package is brought up in two passes:

1. **Pass 1 — contract only.** `types/`, `wire/`, `schemas/`, `utils/`. No engine. This is what unblocks the API, the dashboard, and the widget UI from inventing their own shapes. Ship this **before** any of the other work streams in `02-roadmap.md`.
2. **Pass 2 — engine.** `engine/`, `actions/`, `adapters/`, `store/`. Lands after the wire format is frozen.

### Import direction

```
db  →  walkthrough-core  →  widget / api  →  eregna
```

No back-edges. Enforced by ESLint (`eslint-plugin-boundaries`) or a CI grep. In particular:
- The dashboard (`apps/eregna`) imports types from walkthrough-core; it does **not** redeclare them in `apps/eregna/src/lib/api-types.ts`.
- The API (`apps/api`) imports Zod schemas from walkthrough-core to validate request bodies; it does **not** keep a parallel `services/schemas/` directory.
- The widget (`packages/widget`) imports types + engine from walkthrough-core; it does **not** ship its own `types/conversation.ts`.

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
