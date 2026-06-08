# dashboard/02 — Element Tree Editor

The customer marks up their page here. Output: `elements` rows the agent will use to plan walkthroughs.

> **What changed from the original design.** The original spec described a single screen with a tree on the left and a detail panel on the right. The shipped UX is **two screens**: the Knowledge tab shows a *page* tree (not an element tree) with a hover-revealed "+ element" button that opens a modal, and the per-page editor lists elements inline with editable fields. Reaching for the per-page editor is optional — most elements can be created from the quick-add modal without leaving the tree.

---

## Why "hierarchical" matters

The legacy schema modeled elements as a flat list with embeddings. That's enough for chat retrieval. For walkthroughs the agent needs **structural context** — knowing the "Subscribe" CTA lives inside the "Pricing card" inside the "Pricing section" lets the planner:

- Disambiguate identical labels in different containers.
- Walk the user *through* a container before pointing at the leaf.
- Skip parents that aren't present on the current viewport.

The hierarchy is stored as `ltree` paths on `elements` rows (see `data/01-drizzle-schema.md`). The dashboard does **not** currently render an element-level tree — elements are listed flat under each page in the page editor. Building a recursive element tree visualization is on the list once a customer hits ~20 elements per page; today's lists fit on one screen.

---

## Screen 1 — Knowledge tab (page tree with quick-add)

`apps/eregna/src/routes/dashboard/$agentId.knowledge.index.tsx`.

```
┌── Page tree ─────────────────────────── + Add page ──┐
│  🌐 Marketing site                                    │
│      📄 Pricing               /pricing                │
│      📂 Docs                                          │
│          📄 Getting started   /docs/getting-started   │
│          📄 API reference     /docs/api               │
└───────────────────────────────────────────────────────┘
```

On hover any row reveals three icon buttons:

| Icon | Action |
|---|---|
| **`+`** | Open `AddElementModal` rooted at that page. |
| pencil  | Navigate to `/dashboard/$agentId/knowledge/$pageId`. |
| trash   | Confirm + `DELETE /v1/pages/:id`. |

The "+" button is the entry point for the common case — *add an element somewhere on this page* — and it doesn't require leaving the tree.

---

## AddElementModal

`apps/eregna/src/components/elements/AddElementModal.tsx`.

```
┌── Add element — Pricing ──────────────────  [×] ──┐
│  Label *  [ Subscribe button             ]        │
│                                                   │
│  DOM id        [ pro-subscribe       ]            │
│  CSS selector  [ .pricing-card.pro button ]       │
│                                                   │
│  Description                                      │
│  [ Primary CTA on the Pro tier. Clicking starts ] │
│  [ the Stripe checkout flow.                    ] │
│                                                   │
│                       [ Cancel ] [ Add element ]  │
└───────────────────────────────────────────────────┘
```

Fields:

| Field | Required | Stored as | Notes |
|---|---|---|---|
| Label | yes | `elements.label` | Human name. Shown in popovers. |
| DOM id | one of | `elements.dom_id` | Preferred. The widget tries `#dom_id` first. |
| CSS selector | one of | `elements.css_selector` | Fallback. Encourage specific enough to be unique. |
| Description | no | `elements.description` | What this element *is*. Goes into LLM context later. |

Client-side check before POST: at least one of `dom_id` / `css_selector` must be non-empty. The API enforces the same via a Zod `.refine`. Errors render inline above the buttons.

What the modal **doesn't** do:

- Pick a parent element. Created elements are always rooted at the page. To nest, use the page editor's `NewElementForm` which exposes a parent dropdown.
- Set `notes` or `sort_order`. Those live in the page editor.
- Surface `xpath` or `register_intent`. Neither is in the schema today.

The modal closes on success, on backdrop click, or on Escape. The `Modal` primitive (`components/ui/Modal.tsx`) handles all three.

---

## Screen 2 — Page editor

`apps/eregna/src/routes/dashboard/$agentId.knowledge.$pageId.tsx`. Reached from the pencil button in the tree or from clicking the page title.

Top: a one-line back link (`← Back to Knowledge`) and the page title + path. The tabbed agent layout already shows the agent name, so we don't repeat it.

Body sections:

1. **Page** — `title`, `url_pattern`, `description`, `sort_order`. Save is dirty-gated.
2. **Elements** — flat list of `ElementBlock` cards, one per element. Each card edits `label`, `dom_id`, `css_selector`, `description`, `notes`, `sort_order` and shows a "Has embedding" badge driven by the API's `has_embedding` flag.
3. **New element** form at the bottom — same fields as the modal, *plus* a `Parent element` dropdown listing every existing element on the page so you can nest from here.

### Per-element Save / Delete

Each `ElementBlock` tracks its own dirty state. Save sends a `PATCH /v1/elements/:id` with just the touched fields; Delete calls `DELETE /v1/elements/:id` after confirmation. Optimistic UI isn't wired — saves wait for the server before clearing the dirty indicator.

---

## Selector resolution (when the engine arrives)

The widget's DOM adapter (when it streams real walkthroughs) will resolve elements in this order:

1. `#${dom_id}` via `document.getElementById`.
2. `css_selector` via `document.querySelector`.
3. Fail loudly. (Phase 2: visible "selector missing" indicator on the popover, plus retry budget.)

`xpath` would slot in as #3 if/when a customer asks for it.

---

## Authoring rules surfaced in the UI

- **Slug uniqueness** is enforced server-side on the `(page_id, path)` constraint. The slug is derived from `label` via `slugifyLtreeSegment`. Collisions get a 4-char random suffix appended, so the customer never sees a "duplicate" error — but `ltree` paths can end up looking like `pricing_a7f3`. That's a tradeoff for not surfacing slugs in the UI.
- **Selectors are not validated syntactically.** We don't try to parse the CSS string. Bad selectors surface as runtime "element not found" once playback is shipped.
- **Description ≤ 8000 chars.** No live counter today.

---

## What's not built yet

- **Drag-to-reparent.** Both pages and elements are reparent-on-recreate today. `PATCH` routes don't accept `parent_id`.
- **Element tree visualization.** Elements display flat under each page. Once a page has nested elements with shared labels at different depths, a recursive view would help.
- **Selector picker (dev-mode).** Original design called for `?eregna-pick=…` mode on the customer's site that posts selector candidates back to the dashboard. Not implemented.
- **Bulk import.** No CSV/JSON ingest. Worth building when the first customer has > 50 elements to register.

---

## Embedding generation (Phase 2 hook)

The `embedding` column on `elements` exists but is stored as `text` (not `vector(1536)`) and is never written. The API surfaces a derived boolean `has_embedding` on every read so the dashboard can show an indicator dot, but today that's always `false`. When the embedding job lands, switch the column type and start populating; the UI doesn't need to change.
