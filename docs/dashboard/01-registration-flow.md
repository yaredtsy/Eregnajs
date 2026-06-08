# dashboard/01 — Registration Flow

What the customer does, in order, the first time they use Eregna. Every screen named here lives under `apps/eregna/src/routes/dashboard/`.

> **What changed from the original design.** The doc originally described a 5-step wizard with separate routes (`/dashboard/new`, `/dashboard/:agentId`, `/dashboard/:agentId/knowledge`, `/dashboard/:agentId/knowledge/:pageId`). The shipped UX is **two routes plus a tabbed agent layout**: agent list on `/dashboard`, and everything-about-one-agent under `/dashboard/$agentId` with **Embed / Settings / Knowledge** tabs. "Add" forms are modals on the same page, not their own routes.

---

## End-to-end flow

```
sign in
   │
   ▼
[1] /dashboard                            agent list (empty on first login)
   │  click "New agent"  ──── opens "New agent" inline form (toggle on the same page)
   │  on submit → POST /v1/agents → returns { id, public_id, secret_key }
   ▼
[2] /dashboard/$agentId                   Embed tab (default)
   │  ─ shows the <script> snippet, public_id, secret_key, sessions table
   │
   │  ─ side-link → Settings tab        → /dashboard/$agentId/settings
   │  ─ side-link → Knowledge tab       → /dashboard/$agentId/knowledge
   ▼
[3] /dashboard/$agentId/knowledge         page tree
   │  click "+ Add page"                 → opens modal (Modal.tsx)
   │  on submit → POST /v1/pages → tree refreshes
   │
   │  hover any page row → three action buttons:
   │    + (add element)  → opens AddElementModal — quick add without leaving the tree
   │    pencil           → /dashboard/$agentId/knowledge/$pageId  (per-page editor)
   │    trash            → confirm + DELETE /v1/pages/:id
   ▼
[4] /dashboard/$agentId/knowledge/$pageId  page editor (only when needed)
   │  ─ per-page metadata (title, url_pattern, description, sort_order)
   │  ─ inline list of elements with editable fields
   │  ─ "New element" inline form at the bottom (parent dropdown to nest)
```

Steps 1–3 cover the day-zero registration loop. Step 4 is the deep-dive screen for editing a specific page; in practice customers only land here when they need richer per-element fields (description, notes) that the quick-add modal doesn't surface.

---

## [1] Agent list — `/dashboard`

`apps/eregna/src/routes/dashboard/index.tsx`. Loads `GET /v1/agents`, renders a grid of `AgentCard`. The "New agent" button toggles `AgentForm` (a non-modal inline section, scoped behind `id="new-agent-form-section"` so the sample walkthrough can highlight it).

`AgentCard` surfaces the bits that matter for the walkthrough product:

```
┌─────────────────────────────┐
│ Acme Docs Agent             │
│ acme.com                    │
│ 📖 4 pages   🔢 acme-abc123 │   ← page count from list endpoint, public_id prefix
│ "Marketing site"            │
└─────────────────────────────┘
```

Empty state shows a "No agents yet — click 'New agent'" panel and three skeleton cards while loading.

---

## [2] Agent layout — `/dashboard/$agentId`

`apps/eregna/src/routes/dashboard/$agentId/route.tsx` is the layout that wraps every per-agent tab. It renders:

- A small breadcrumb: `Agents / <agent.name>`.
- The agent title + an Active / Inactive pill driven by `agent.is_active`.
- A tab bar with three tabs:

| Tab | Route file | Purpose |
|---|---|---|
| **Embed** | `$agentId/index.tsx` | The default landing — snippet, credentials, sessions list, quick-link sidebar. |
| **Settings** | `$agentId.settings.tsx` | Name, description, model, system prompt, active toggle, save. |
| **Knowledge** | `$agentId.knowledge.index.tsx` + `$agentId.knowledge.$pageId.tsx` | Page tree + per-page editor. |

The layout uses `useRouterState` to detect the active tab from `location.pathname`. The `<Outlet />` renders whichever tab's component is matched. TanStack's flat-route syntax (`$agentId.settings.tsx`, `$agentId.knowledge.index.tsx`) keeps the file tree flat while still being children of the layout.

---

## Embed tab — `/dashboard/$agentId`

`apps/eregna/src/routes/dashboard/$agentId/index.tsx`. Two columns:

**Left column:**

```
┌─────────────────────────────────────────────────────────┐
│ Embed snippet                                           │
│ Paste this inside your site's <body>.                   │
│ ┌───────────────────────────────────────────────────┐   │
│ │ <script                                           │   │
│ │   src="https://cdn.eregna.dev/embed.iife.js"      │   │
│ │   data-agent-id="acme-abc123"                     │   │
│ │   defer                                           │   │
│ │ ></script>                                        │   │
│ └───────────────────────────────────────────────────┘   │
│                                                         │
│ Recent sessions                                         │
│ ┌────────────┬─────────────────┬────────────────┐       │
│ │ Session    │ Page URL        │ Started        │       │
│ │ 7b3c4f1a…  │ acme.com/pricing│ 2026-05-23 17:01│      │
│ └────────────┴─────────────────┴────────────────┘       │
└─────────────────────────────────────────────────────────┘
```

The embed snippet template lives inline at the top of the route file (`embedSnippet(publicId)`) — fine while there's one consumer. If marketing pages need the same string, hoist it to a shared helper.

**Right column (sidebar):**

- `CopyField` for `public_id` (plain) and `secret_key` (masked) — a small "Never expose the secret key in client-side code" hint sits below.
- Agent's `website_url`.
- A "Configure" panel with quick links to the Settings and Knowledge tabs.

---

## Settings tab — `/dashboard/$agentId/settings`

`apps/eregna/src/routes/dashboard/$agentId.settings.tsx`. Left column:

- **Basic info** card — name (2..80), description (≤ 500), model (`gpt-4o-mini`, `gpt-4o`, `claude-3-5-haiku`).
- **System prompt** card — large textarea (up to 2000 chars), live "~tokens" estimate via `Math.ceil(text.length / 4)`.

Right column (sidebar):

- Agent endpoint toggle (`is_active`). Visually a switch; disables the widget without deleting anything.
- **Save changes** button — disabled until a field is dirty. PATCH `/v1/agents/:id` only the fields that actually changed isn't currently implemented; the route accepts the full payload on every save.

Save state is local to the component (no toasts) — surfaces `Saved at HH:MM:SS` or a destructive-toned error message inline.

---

## Knowledge tab — `/dashboard/$agentId/knowledge`

`apps/eregna/src/routes/dashboard/$agentId.knowledge.index.tsx`. One panel:

```
┌── Page tree ───────────────────────── + Add page ───┐
│  🌐 Marketing site            /                     │
│      📄 Pricing               /pricing              │
│      📂 Docs                  /docs/*               │
│          📄 Getting started   /docs/getting-started │
│          📄 API reference     /docs/api             │
└──────────────────────────────────────────────────────┘
```

The tree is rendered by `components/pages/PageTreeView.tsx`. Conventions:

- Icon by depth/children: `Globe` for root pages, `Folder` for branches, `FileText` for leaves.
- Click the row's title → navigates to the per-page editor (`/knowledge/$pageId`).
- Hover the row → reveals three icon buttons on the right:
  - **`+`** (Plus) — opens `AddElementModal`. Lets the user attach a new element to *this page* without entering the editor.
  - **pencil** (Pencil) — same target as clicking the title; explicit "edit page" affordance.
  - **trash** (Trash2) — confirms, then `DELETE /v1/pages/:id`.

### "Add page" modal

The "+ Add page" button in the section header opens `components/ui/Modal.tsx` with three fields (title, url_pattern, parent page). On save → `POST /v1/pages` → tree refreshes and the modal closes. Errors render inline above the form.

### "Add element" modal

`components/elements/AddElementModal.tsx`. Fields:

| Field | Required | Notes |
|---|---|---|
| Label | yes | Slugified into the element's `ltree` path. |
| DOM id | one of | Mono font input; preferred selector. |
| CSS selector | one of | Mono font input; fallback. |
| Description | no | Plain text. |

Service-level validation: at least one of `dom_id` / `css_selector` must be present. The modal mirrors that with a client-side check before POST.

Why this lives as a modal: customers were skipping the per-page editor because reaching it required clicking into a page and scrolling past metadata fields. The quick-add closes that gap.

---

## Page editor — `/dashboard/$agentId/knowledge/$pageId`

`apps/eregna/src/routes/dashboard/$agentId.knowledge.$pageId.tsx`. This is the deeper editor; the tree quick-add covers the common case.

Header: a small "← Back to Knowledge" link (not the breadcrumb component used elsewhere — the tabbed layout already shows the agent name, so this is just a one-liner).

Body, two sections:

1. **Page** — title, url_pattern, description, sort_order. Save button is dirty-gated.
2. **Elements** — one `ElementBlock` per element with all editable fields (label, DOM id, CSS selector, description, notes, sort order). A `NewElementForm` at the bottom adds new elements with an optional `parent_id` dropdown so deep nesting is possible from here.

`ElementBlock` shows a `Has embedding` badge derived from the API's `has_embedding` boolean — the indicator dot mentioned in the legacy doc, kept around for the Phase-2 embedding work even though we don't compute embeddings yet.

---

## What's not built yet

- **Selector picker.** The original design called for a dev-mode picker on the customer's site (`?eregna-pick=…`) that posts a `{ dom_id, css_selector, label_guess }` payload back to the dashboard. Not implemented — selectors are typed by hand. Worth picking up once a real customer hits selector confusion.
- **Drag-to-reparent in the tree.** The tree is read-only for structure. To move a page or element between parents you have to delete and recreate. `PATCH /v1/pages/:id` doesn't accept `parent_id` either.
- **Sort_order editing in the UI.** The column exists; nothing on the page surface lets you reorder. Manual sort_order numbers can be edited in the page editor's `Sort order` field.
- **`register_intent` field.** Not in the schema (see `data/01-drizzle-schema.md`); the form has no entry for it.

---

## Authoring rules surfaced in the UI

- **Slugified labels.** `apps/api/src/lib/ltree.ts → slugifyLtreeSegment` is what computes the `ltree` segment from a label. The dashboard does **not** show the slugified form before save — customers see only the human label. Collisions get a random suffix appended server-side, which keeps the UX simple at the cost of opaque path names.
- **One-of selector.** Element create/edit requires `dom_id || css_selector`. The error message is `"Provide dom_id or css_selector"` — surfaced in the modal and the inline NewElementForm.
- **No bulk import.** A CSV/JSON import is still Phase-2 work.
