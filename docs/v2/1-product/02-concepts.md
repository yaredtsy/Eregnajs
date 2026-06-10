# 1.2 — Concepts (the vocabulary)

> Every noun the rest of the docs use, defined once. If two docs disagree with this file,
> this file wins.

---

## Agent

A customer-owned configuration: name, model, persona overlay, **public id** (embed key),
**secret key** (server-to-server, future), allowed origins. One customer can own many agents
(e.g. one per product).

## Knowledgebase

Everything the agent is allowed to know about the customer's site. Five sources, two origins:

```
Knowledgebase
├── from the DASHBOARD (persistent, customer-curated)
│   ├── Site facts          free-text knowledge: "Pro plan includes API access", FAQs
│   ├── Pages               url pattern + title + description ("/billing — manage plans")
│   └── Components          per page: key, label, description, SELECTOR QUERY, notes
└── from the HOST SCRIPT (runtime, optional — the "quick fix" channel)
    ├── hostState           live page state: { user: { plan: "pro" }, cartCount: 3 }
    ├── hostTools           callable capabilities (JS function or declared API call)
    └── hostKnowledge       extra facts injected at runtime, same shape as site facts
```

The script-side entries are optional by design: a customer can ship value with dashboard data
alone, then *enrich* from the page where the dashboard is too static.

## Component & selector query

A **component** is a thing on a page the agent can point at: "the export button", "the invoices
table". Its **selector query** is how the widget finds it in the DOM — an ordered list of
strategies: `domId` → `css` → `text` (visible-text match). The LLM never sees selectors; it sees
the component's **key** (a stable semantic slug like `billing.export-button`). The mapping
key → selector query travels in the **element manifest** (`2-system/02-contracts.md` §4).

> Naming note: the existing DB table is `elements`. v2 says **component** in product language and
> keeps `elements` as the table name — renaming tables buys nothing now.

## Tool

A capability the **host page** exposes that the agent may invoke during a walkthrough. Two kinds:

| Kind | Declared as | Executed by |
|---|---|---|
| `fn` | a JS function the page registers (`run(args)`) | widget, in-page |
| `api` | a declarative HTTP descriptor (method, url template, body template) | widget, via `fetch` from the visitor's browser |

Tools exist so the agent can *operate* complex components (open a dialog, switch a tab, prefill a
form) instead of merely pointing at them. The server only ever sees `{name, description, parameters}` —
never the function, never the credentials.

## Walkthrough

The agent's answer, as a playable artifact:

- **Plan** — goal + ordered **chapters** (title, description, target component key).
- **Steps** — per chapter: actions (`scroll-to`, `highlight`, `wait`, `wait-for-click`,
  `call-tool`) + a narrated popover.
- **Thoughts** — short structured reasoning summaries streamed during generation, rendered in the
  player's thinking ticker (not raw chain-of-thought).

## Run

One execution: question in, walkthrough out, every frame recorded. A run is replayable
(history mode) and inspectable (which prompts, which outputs, what failed).

## Play modes

| Mode | Source | Pacing |
|---|---|---|
| **live** | the stream, as frames arrive | network-paced; visitor can pause |
| **history** | a completed run document | offset-paced (typewriter clock); seekable |

"Play on demand" = receiving live frames but **buffering**: the visitor lets the run finish, then
plays it as history. Same document, third consumption pattern, zero new wire format.

## Playground

A dashboard page that is itself a fake host site — deliberately awkward components (dialogs,
erroring forms, slow APIs, vanishing elements) plus panels to inject state/tools/knowledge and run
any single piece of the pipeline in isolation. Defined in `5-playground/`.

## Widget vs. engine vs. player

- **Widget**: everything inside the shadow DOM (chat popup, player, input bar).
- **Engine**: the part that touches the *host* DOM — resolves selector queries, scrolls,
  highlights, executes tools.
- **Player**: the part that decides *when* steps advance (live/history/buffered) and renders the
  timeline, popovers, ticker.
