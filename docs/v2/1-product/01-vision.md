# 1.1 — Vision

> The highest-abstraction statement of the product. Everything below this file is a means to this.

---

## What it is

An **embeddable agent for websites that shows instead of tells**. A customer describes their site
once (a knowledgebase of pages, components, and how to find them), embeds one script tag, and any
visitor can ask "how do I export my invoices?" — the agent answers by *walking them through the
actual page*: scrolling, spotlighting, narrating, step by step, optionally operating components
through tools the site exposes.

## The two users

| User | Touchpoint | Cares about |
|---|---|---|
| **Customer** (site owner) | Dashboard: create agent, build knowledgebase, get embed snippet, playground, replay runs | setup effort, answer quality, control |
| **Visitor** (end user) | Widget on the customer's site: ask, watch, interact | "show me", speed, not feeling lost |

## The loop

```
 Customer                        Visitor                         Agent (server)
    │                               │                                │
    │ 1. registers pages/components │                                │
    │ 2. embeds <script data-agent-id=…>                             │
    │ 3. (optional) injects state / tools / knowledge from the page  │
    │                               │ 4. asks a question             │
    │                               │ ──────────────────────────────▶│
    │                               │      5. plans chapters, emits  │
    │                               │ ◀──────── steps as a stream ───│
    │                               │ 6. watches the guided          │
    │                               │    walkthrough play            │
    │ 7. reviews runs, fixes gaps   │                                │
    │    (dashboard or playground)  │                                │
```

Step 7 closes the loop: failed steps (component not found, tool errored) surface in the dashboard
so the knowledgebase improves where it actually failed.

## Why a walkthrough and not a chatbot

A chat answer to "where do I change billing?" is a paragraph the visitor must re-translate into
clicks. A walkthrough *is* the clicks. Technically it's the same agent loop — plan, act, narrate,
stream — but **rendered as guided steps instead of scrolled text**. That rendering difference is
the product. (It's also why the player UX in `4-client/02` gets as much design attention as the
agent itself.)

## Why this is a good learning vehicle

The product forces every hard sub-problem of agent engineering, each small enough to own:

- **Context engineering** — the agent knows *only* what the knowledgebase + host page provide;
  you control every token of every prompt.
- **Orchestration** — a deterministic graph dispatching focused LLM calls, designed to be swapped
  for fancier strategies without touching the wire.
- **Dynamic tool orchestration** — toolsets that differ per page per customer per moment, declared
  at runtime by a script you don't control.
- **Streaming UX** — one patch stream rendered two ways (chat vs. player), live or replayed.

## North-star qualities

1. **Five-minute first walkthrough** — register one page + three components, embed, ask, watch.
2. **Degrade, never die** — a missing component skips one step with a visible message, not a dead run.
3. **Inspectable** — every run answers "what did the model see, and why did it do that?"
4. **Swappable core** — the orchestrator and models can be replaced without touching widget or wire.
