# dashboard/01 — Registration Flow

What the customer does, in order, the first time they use Eregna. Every screen named here lives under `apps/eregna/src/routes/dashboard/`.

---

## End-to-end flow

```
sign in
   │
   ▼
[1] /dashboard                 list of agents (empty on first login)
   │  click "New Agent"
   ▼
[2] /dashboard/new             create-agent wizard
   │  name + website_url + (optional) model + system_prompt
   │  on submit → POST /v1/agents → returns { id, public_id }
   ▼
[3] /dashboard/:agentId/knowledge        register first page
   │  enter title + URL pattern + (optional) description
   │  on submit → POST /v1/pages → returns { id, path }
   ▼
[4] /dashboard/:agentId/knowledge/:pageId   element tree editor  ← the main UX
   │  add elements hierarchically (label, selector, description, register_intent)
   │  see 02-element-tree-editor.md
   ▼
[5] /dashboard/:agentId        overview page
   │  copy the <script> snippet → paste it on the registered page
   ▼
[6] visitor flow              widget mounts, walkthroughs work
```

For MVP we ship steps 1, 2, 3, 4, 5. Step 3 is collapsed to "register your first page" — multi-page support is Phase 2.

---

## [1] Agent list — `/dashboard`

Same as the legacy dashboard. Loads `GET /v1/agents`, renders a grid of `AgentCard`. Empty state CTA → `/dashboard/new`.

The card surfaces what matters for the walkthrough product:

```
┌─────────────────────────────┐
│ Acme Docs Agent             │
│ acme.com                    │
│ 1 page · 12 elements        │   ← counts come from the agent list endpoint join
│ ● Live   (toggle is-active) │
└─────────────────────────────┘
```

---

## [2] Create-agent wizard — `/dashboard/new`

Single screen, no multi-step. Fields:

| Field | Required | Notes |
|---|---|---|
| `name` | yes | 2–80 chars |
| `website_url` | yes | Must be a valid URL. We store the origin and treat any path within it as in-scope. |
| `description` | no | Internal note. Not sent to the LLM. |
| `model` | no | Defaults to `gpt-4o-mini`. Select from supported list. |
| `system_prompt` | no | Customer-defined overlay on top of the default prompt. |

On submit:
1. `POST /v1/agents` — API generates `public_id` (URL-safe slug + 6 random chars) and a `secret_key` (never exposed to the dashboard).
2. Redirect to `/dashboard/:agentId/knowledge`.

---

## [3] Page registration — `/dashboard/:agentId/knowledge`

MVP UX: empty state → "Add your first page". Form fields:

| Field | Required | Notes |
|---|---|---|
| `title` | yes | Human label. Used in the planner's page-selection prompt. |
| `url_pattern` | yes | Exact URL or glob. For MVP we suggest the exact URL (`https://acme.com/pricing`). |
| `description` | no | Plain-text purpose of the page. The planner reads this. |

On submit:
1. `POST /v1/pages` — API computes the `ltree` path from `parent_id` (null for the first page → path `root`).
2. Redirect to `/dashboard/:agentId/knowledge/:pageId` (the element tree editor).

**Why URL pattern, not "current tab"?** The dashboard runs on `eregna.dev`, not the customer's site. We can't introspect their page from here. The selector picker in step 4 handles that via the embed snippet's dev mode (see 02-element-tree-editor.md).

---

## [4] Element tree editor

This is the screen the customer will spend the most time in. Detailed in `02-element-tree-editor.md`.

---

## [5] Overview / embed snippet — `/dashboard/:agentId`

```
┌─────────────────────────────────────────────────────────┐
│  Acme Docs Agent                          [Settings]    │
├─────────────────────────────────────────────────────────┤
│  Embed snippet                                          │
│  ─────────────                                          │
│  <script                                                │
│    src="https://cdn.eregna.dev/embed.iife.js"           │
│    data-agent-id="acme-abc123"                          │
│    async defer                                          │
│  ></script>                              [Copy]         │
│                                                         │
│  Drop this once on your site, anywhere in <body>.       │
│  The widget activates on the URL patterns you've        │
│  registered.                                            │
│                                                         │
│  ● 1 page registered                                    │
│  ● 12 elements                                          │
│  ● Status: Active                                       │
└─────────────────────────────────────────────────────────┘
```

The snippet template lives in a single source-of-truth helper:

```ts
// apps/eregna/src/lib/embed.ts
export function buildEmbedSnippet(publicId: string): string {
  const cdn = import.meta.env.VITE_EREGNA_WIDGET_CDN
  return `<script
  src="${cdn}/embed.iife.js"
  data-agent-id="${publicId}"
  async defer
></script>`
}
```

The same function is reused on the marketing page so docs and the dashboard cannot drift.

---

## Authoring rules surfaced in the UI

- **One agent = one origin.** Trying to register a page with a `url_pattern` outside the agent's `website_url` origin is rejected with a clear error.
- **Slugified labels.** Page and element labels are slugified to derive their `ltree` path. The dashboard shows the slugified form so customers see what will be used.
- **No bulk import in MVP.** A CSV/JSON import lives in Phase 2. MVP ships only the manual editor.
