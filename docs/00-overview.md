# 00 — Eregna Overview

> **Eregna** is an embeddable AI guide that **plays walkthroughs on a website like a video**, not a scroll.
> Customers register their site, mark its pages and key DOM elements with descriptions, and drop a `<script>` on their page. Visitors ask a question; the agent picks the right page, **plans the walkthrough**, and **streams the steps in real time** while a player engine executes them on the host DOM — highlight, scroll, popover with typewriter narration, wait for click, advance.

The old MVP framed Eregna as a RAG chat widget. That framing is retired. Eregna is now a **streamed walkthrough player** with chat as the input surface and "pause to ask" as the interaction model.

The previous docs are preserved under `docs/legacy/` for reference. They describe the chat-only product. This folder describes the new product end-to-end.

---

## Product in one diagram

```
┌────────────────────────────── Host site (customer's website) ───────────────────────────┐
│                                                                                          │
│   <script src="cdn.eregna.dev/embed.iife.js" data-agent-id="acme-abc123"></script>      │
│                                                                                          │
│   ┌─── Shadow-DOM widget mount ────────┐    ┌─── Overlay layer (no shadow) ──────────┐  │
│   │  Player UI                          │    │  Spotlight ring around .pricing-cta    │  │
│   │  ─────────────                      │    │  ┌──────────────────────────────────┐  │  │
│   │  ▶︎ ▮▮  ─────●──── 0:12 / 0:45      │    │  │ Click "Subscribe" to continue ▮  │  │  │
│   │  [chat input ......................]│    │  └────── popover (typewriter) ──────┘  │  │
│   └────────────────────────────────────┘    └────────────────────────────────────────┘  │
│                                                                                          │
└─────────────────┬────────────────────────────────────────────────────────────────────────┘
                  │   POST /v1/walkthroughs/run   (SSE — NDJSON steps streamed)
┌─────────────────▼─────────────────┐    ┌──────────────────────────────┐
│  apps/api  (Bun + Hono)           │───▶│  LLM (OpenAI / Anthropic)    │
│  - planner: query → page → plan   │    └──────────────────────────────┘
│  - streamer: steps as NDJSON      │
│  - Drizzle queries for context    │
└──────────────┬────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│  Postgres (Supabase-hosted)              │
│  - agents, sites, pages, elements        │
│  - walkthrough_sessions, step_events     │
│  - drizzle-orm schema, no RLS in MVP     │
└──────────────────────────────────────────┘
```

---

## What's new vs. the legacy product

| Concept | Legacy (chat-only) | New (walkthrough) |
|---|---|---|
| Output | Markdown chat reply | **Stream of `Step` objects** (actions + popover) |
| Visitor sees | Bubble with text | **Highlighted DOM + typewriter popover**, video-like |
| Element registration | Description + embedding | Same fields, plus **hierarchical description tree** and `register_intent` (what users do here) |
| Retrieval | pgvector RAG over elements | MVP: **whole-page context** (full element tree) — pgvector deferred to Phase 2 |
| Persistence | conversations + messages | **walkthrough_sessions** with replayable step events |
| ORM | Supabase JS client + SQL | **Drizzle ORM**, schema in `packages/db` |
| Auth/RLS | Supabase Auth + RLS on every table | Supabase Auth (JWT) at API edge, **ownership in service layer**, no RLS |
| Widget | React chat UI in shadow DOM | Same shadow DOM mount + **overlay painted on host body** for spotlights |

---

## MVP scope (what we are building first)

The MVP is the smallest end-to-end loop that proves the vision:

1. **Register**: dashboard lets the user register a site, add a single page, define a hierarchical list of elements (label + selector + description).
2. **Embed**: dashboard shows a `<script>` snippet; pasting it on the host page boots the widget.
3. **Ask**: visitor opens the widget, types a question.
4. **Plan + stream**: the API plans a walkthrough and streams `Step` objects over SSE. The engine queues them as they arrive.
5. **Play**: the engine highlights elements, scrolls, opens popovers with typewriter narration, waits for the user to click "Next" or to click the highlighted target.
6. **Pause & chat**: at any time the user can pause; the same input that controlled "next" now sends a chat message; the agent can branch into a new mini-walkthrough.

**Out of MVP** (Phase 2+): autonomous click/fill on the host page, multi-page walkthroughs, pgvector retrieval, analytics, billing.

---

## Document layout

Docs are grouped by domain. Each folder owns one layer of the stack and reads top-to-bottom in numbered order.

```
docs/
├── 00-overview.md            ← you are here
├── 01-folder-structure.md    ← monorepo layout
├── 02-roadmap.md             ← phased delivery
├── dashboard/                ← registration UX (sites, pages, elements, embed snippet)
├── data/                     ← Drizzle schema + auth/ownership model
├── api/                      ← Hono routes + SSE streaming protocol
├── widget/                   ← embed script, shadow DOM, host-page overlay
├── engine/                   ← action schema, engine, step queue, DOM adapter
├── player/                   ← store, controls, pause+branch UX
├── agent/                    ← LLM planning pipeline + context strategy
├── reliability/              ← robust playback (missing selectors, retries, drift)
└── legacy/                   ← retired chat-only docs, for reference
```

| Folder | Files | Read it when… |
|---|---|---|
| `dashboard/` | `01-registration-flow.md`, `02-element-tree-editor.md` | Building dashboard screens or thinking about how customers register elements |
| `data/` | `01-drizzle-schema.md`, `02-auth-and-ownership.md` | Touching the DB schema or auth boundary |
| `api/` | `01-routes.md`, `02-streaming-protocol.md` | Adding a new endpoint or changing the SSE wire format |
| `widget/` | `01-embed-and-bootstrap.md`, `02-overlay-and-isolation.md` | Working on how the widget mounts and isolates from the host |
| `engine/` | `01-action-schema.md`, `02-engine-and-executor.md`, `03-step-queue.md`, `04-dom-adapter.md` | Anything in `packages/walkthrough-core` or the DOM driver |
| `player/` | `00-timeline-model.md`, `01-store-and-controls.md`, `02-pause-and-branch.md` | Conversation/message shape, player UI (Bar + Popup, bubble vs. detached), pause-to-ask |
| `agent/` | `01-planning-pipeline.md`, `02-context-strategy.md` | Prompt design, page selection, what context we send to the LLM |
| `reliability/` | `01-robust-playback.md` | Edge cases: missing nodes, late streams, retries |

---

## Non-goals (calling these out so we don't drift)

- Eregna does **not** ship Driver.js. The engine is our own — Driver.js was the inspiration; we need streaming, seek, and branch which it doesn't support.
- Eregna does **not** record real user sessions. The walkthrough is **generated**, not replayed from telemetry.
- Eregna does **not** auto-click for the visitor in MVP. We point; the visitor clicks. This keeps the trust model simple and the schema permission-free.
