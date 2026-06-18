# 7.1 — Page and components

> The knowledgebase rows the seed script will insert. **Approve the text** — the LLM reads
> `description` when planning and `notes` when stepping.

---

## Page row

| Field | Value |
|---|---|
| `title` | `Dashboard` |
| `url_pattern` | `/dashboard` |
| `description` | Agents list in the Eregna app. Users create agents, open cards, and copy embed snippets from each agent's page. |
| `sort_order` | `0` |

**Why this url_pattern:** the widget sends `pageUrl` on each run (e.g. `http://localhost:3000/dashboard`). The server picks the page whose pattern matches.

---

## Component rows

Each row goes in `elements` for that page.

### `dashboard.hero`

| Field | Value |
|---|---|
| `label` | Dashboard hero |
| `dom_id` | `agents-page-hero` |
| `selectors` | `[{ "kind": "dom-id", "value": "agents-page-hero" }]` |
| `description` | Top of the agents page: "Dashboard" label, "Agents" heading, and short subtitle about managing embedded agents. |
| `notes` | Always visible after login. Good opening step to orient the user. |

**DOM today:** `apps/eregna/src/routes/dashboard/index.tsx` — wrapper `id="agents-page-hero"`.

---

### `dashboard.agents-grid`

| Field | Value |
|---|---|
| `label` | Agents grid |
| `dom_id` | `agents-grid` |
| `selectors` | `[{ "kind": "dom-id", "value": "agents-grid" }]` |
| `description` | Area showing agent cards in a grid, or an empty state ("No agents yet") when the user has none. |
| `notes` | Clicking a card opens that agent's embed and settings tabs. |

**DOM today:** `<section id="agents-grid">` in the same file.

---

### `dashboard.new-agent-btn`

| Field | Value |
|---|---|
| `label` | New agent button |
| `dom_id` | `new-agent-btn` |
| `selectors` | `[{ "kind": "dom-id", "value": "new-agent-btn" }]` |
| `description` | Primary button labeled "+ New agent" (or "Cancel" while the form is open). Toggles the create form below the hero. |
| `notes` | User must click this before the name and URL fields are visible. Plan a step that highlights this before the form fields. |

**DOM today:** `<button id="new-agent-btn">`.

---

### `dashboard.agent-name`

| Field | Value |
|---|---|
| `label` | Agent name field |
| `dom_id` | `agent-name-field` |
| `selectors` | `[{ "kind": "dom-id", "value": "agent-name-field" }]` |
| `description` | Text input for the agent display name (placeholder "Acme Docs Agent"). Required, 2–80 characters. |
| `notes` | Wrapper `div` around the label + input. Only visible when the create form is open. |

**DOM today:** `AgentForm.tsx` — `<div id="agent-name-field">` wrapping the name input.

---

### `dashboard.agent-url`

| Field | Value |
|---|---|
| `label` | Agent website URL field |
| `dom_id` | `agent-url-field` |
| `selectors` | `[{ "kind": "dom-id", "value": "agent-url-field" }]` |
| `description` | URL input for the customer's website where the widget will be embedded (placeholder `https://example.com`). Required. |
| `notes` | Same visibility rule as the name field — form must be open. |

**DOM today:** `AgentForm.tsx` — `<div id="agent-url-field">`.

---

### `dashboard.create-form`

| Field | Value |
|---|---|
| `label` | Create agent form |
| `dom_id` | `new-agent-form-section` |
| `selectors` | `[{ "kind": "dom-id", "value": "new-agent-form-section" }]` |
| `description` | Card containing the full "New agent" form and the "Create agent" submit button. |
| `notes` | Use for the final step: highlight the submit button area. Optional fields (description, model, prompt) are inside but not registered — tell the user they can skip them. |

**DOM today:** wrapper around `AgentForm` in `dashboard/index.tsx` when `showForm` is true.

---

## Mapping: old sample → new keys

The static sample used manifest ids like `agents-page-hero`. The seeded agent uses **semantic keys**
(the LLM sees keys, not DOM ids):

| Old sample manifest id | New `elements.key` |
|---|---|
| `agents-page-hero` | `dashboard.hero` |
| `agents-grid` | `dashboard.agents-grid` |
| `new-agent-btn` | `dashboard.new-agent-btn` |
| `agent-name-field` | `dashboard.agent-name` |
| `agent-url-field` | `dashboard.agent-url` |
| `new-agent-form-section` | `dashboard.create-form` |

After seed + live runs, delete or freeze `sample-conversation.ts` for dashboard routes only.
