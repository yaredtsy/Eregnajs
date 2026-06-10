# 4.4 — Knowledge Capture (dashboard side)

> How a customer builds the knowledgebase the agent depends on. The dashboard CRUD exists
> (agents, pages, elements); v2 reframes it around **components with selector queries** and
> **site facts**, and adds the feedback loop from failed runs.

---

## 1. The capture model

```
Agent
├── Site facts            (NEW)  title + content, agent-wide
└── Pages                 url_pattern + title + description
    └── Components        key + label + description + notes + selector queries (ordered)
```

Schema deltas from as-built:

| Change | Detail |
|---|---|
| `elements.key` (new) | semantic slug, unique per page, e.g. `billing.export-button`; auto-suggested from label (`slugify`), editable once, **stable forever** (it's the LLM's symbol — renaming breaks replays and prompts) |
| `elements.selectors` (new, jsonb) | ordered `SelectorQuery[]` (`2-system/02` §4); migrate existing `dom_id`/`css_selector`/`xpath` columns into it, then drop them |
| `site_facts` (new table) | `agent_id, title, content, sort_order` |
| `agents.allowed_origins` (new) | `text[]` for the public surface (`3-server/06` §2) |
| `elements.embedding` | keep column, still unused until retrieval phase — but stop creating the IVFFlat index until then (review 0.3 §9) |

## 2. What makes a *good* component entry (this is customer-facing doc material)

- **Label**: what a visitor would call it — "Export button", not "btn-exp-2".
- **Description**: what it *does* and *when it matters* — this is what the planner reasons over.
  One or two sentences. Empty description = invisible to good planning.
- **Notes**: stepper-only details — "disabled until a row is selected", "opens a modal, takes ~1s".
  Notes are the difference between a walkthrough that works and one that highlights a dead button.
- **Selectors**: most stable first. `dom-id` if the site has them; otherwise a tight `css`;
  `text` as the resilient fallback.

The dashboard form should *say* this inline (placeholder/hint text) — the knowledgebase is a
prompt the customer writes without knowing it.

## 3. Editor UX (MVP-pragmatic)

Keep the existing tree editor; add:
- per-component **selector list editor** (strategy dropdown + value + drag-order),
- a **"Test on my site"** copy-button: copies a snippet
  `eregna.__debugResolve("billing.export-button")` the customer pastes in their site's console —
  the embedded widget exposes this debug hook and flashes the resolved element. Cheap; replaces a
  visual picker for MVP.
- key immutability warning on edit.

A point-and-click visual capturer (click an element on your site → selectors auto-derived) is the
obvious Phase-later feature; the manifest shape already supports whatever it produces.

## 4. The feedback loop (closing the circle)

Run telemetry (`3-server/06` §4: `skipped_steps`, skip reasons) feeds a dashboard view:

```
Knowledge health
⚠ billing.export-button — failed to resolve in 4 runs this week   [edit selectors]
⚠ tool `openDialog` — args invalid twice                          [view runs]
✦ 3 questions had no matching page (top: "how do I delete my account?")
```

This turns failures into a worklist. It's also the honest measure of knowledgebase quality —
better than any lint. MVP version is a simple aggregation over run records; build it as soon as
real runs exist, before any fancier analytics.

## 5. Where script-injected knowledge fits

`addKnowledge`/`setState`/`registerTool` (`4-client/01`) deliberately mirror dashboard concepts
(facts / context / capabilities) so a customer's mental model is: **dashboard = durable,
script = situational.** The dashboard shows script-injected entries observed in recent runs
(read-only, tagged `from page`) so the two halves are visible in one place.
