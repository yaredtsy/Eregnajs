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
                  │   POST /v1/walkthroughs/run   (SSE — planned, not shipped)
┌─────────────────▼─────────────────┐    ┌──────────────────────────────┐
│  apps/api  (Bun + Hono)           │───▶│  LLM (OpenAI / Anthropic)    │
│  - CRUD: agents/pages/elements    │    └──────────────────────────────┘
│  - sessions (widget heartbeat)    │
│  - planner + streamer: PLANNED    │
└──────────────┬────────────────────┘
               │  Supabase JS client (RLS off — ownership in service layer)
┌──────────────▼──────────────────────────────────────────────────┐
│  Postgres (Supabase-hosted)                                      │
│  - agents, pages, elements                                       │
│  - walkthrough_sessions, session_messages, message_text_parts,   │
│    walkthroughs, walkthrough_steps                               │
└──────────────────────────────────────────────────────────────────┘
```

---

## What's new vs. the legacy product

| Concept | Legacy (chat-only) | New (walkthrough) |
|---|---|---|
| Output | Markdown chat reply | **Stream of `Step` objects** (actions + popover) |
| Visitor sees | Bubble with text | **Highlighted DOM + typewriter popover**, video-like |
| Element registration | Description + embedding | Same fields, hierarchical via `ltree` (no `register_intent` yet — deferred until the planner exists) |
| Retrieval | pgvector RAG over elements | MVP: planned to feed full element tree to LLM — pgvector deferred (`embedding` column is `text`, never written) |
| Persistence | conversations + messages | **walkthrough_sessions → session_messages → (message_text_parts | walkthroughs → walkthrough_steps)** |
| ORM | Supabase JS client + SQL | **Supabase JS client + generated `Database` types** in `packages/db`. (Drizzle was on the original roadmap; not adopted yet.) |
| Auth/RLS | Supabase Auth + RLS on every table | Supabase Auth (JWT) at API edge, **ownership in service layer**, RLS authored then disabled |
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

| Folder | Status | Read it when… |
|---|---|---|
| `dashboard/` | **shipped** — describes the running UX | Building dashboard screens or thinking about how customers register elements |
| `data/` | **shipped** — schema + auth model match reality | Touching the DB schema or auth boundary |
| `api/` | **partly shipped** — CRUD routes real; streaming protocol is a spec | Adding a new endpoint or thinking about the SSE wire format |
| `widget/` | **shipped** — boot, shadow DOM, overlay portal as built | Working on how the widget mounts and isolates from the host |
| `engine/` | **design spec** — engine not yet built | Anything in the future `packages/walkthrough-core` or the DOM driver |
| `player/` | **partly shipped** — Bar/Popup/store built; branch/scrub-to-live not | Conversation/message shape, player UI, pause-to-ask |
| `agent/` | **design spec** — no LLM call yet | Prompt design, page selection, planner/streamer split |
| `reliability/` | **design spec** — failure-mode checklist for the engine work | Edge cases: missing nodes, late streams, retries |

---

## Non-goals (calling these out so we don't drift)

- Eregna does **not** ship Driver.js. The engine is our own — Driver.js was the inspiration; we need streaming, seek, and branch which it doesn't support.
- Eregna does **not** record real user sessions. The walkthrough is **generated**, not replayed from telemetry.
- Eregna does **not** auto-click for the visitor in MVP. We point; the visitor clicks. This keeps the trust model simple and the schema permission-free.
