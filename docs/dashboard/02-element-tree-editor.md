# dashboard/02 — Element Tree Editor

The customer marks up their page here. Output: a hierarchical list of `elements` rows the agent can use to plan walkthroughs.

```
/dashboard/:agentId/knowledge/:pageId
```

---

## Why "hierarchical" matters

The legacy schema modeled elements as a flat list with embeddings. That's enough for chat retrieval. For walkthroughs the agent needs **structural context** — knowing the "Subscribe" CTA lives inside the "Pricing card" inside the "Pricing section" lets the planner:

- Disambiguate identical labels in different containers.
- Walk the user **through** a container before pointing at the leaf.
- Skip parents that aren't present on the current viewport.

The hierarchy is stored as `ltree` paths on `elements` rows (see `data/01-drizzle-schema.md`). Visually it's a recursive tree.

---

## Screen layout

```
┌───────────────────────────────────────────────────────────────────────┐
│  ← Back to pages   Page: Pricing  (/pricing)                          │
├─────────────────────────────┬─────────────────────────────────────────┤
│  Element tree               │  Element detail                         │
│  ─────────────              │  ──────────────                         │
│  ▼ Pricing section          │  Label              [Subscribe button ] │
│      ▼ Pricing card "Pro"   │  DOM id             [#pro-subscribe   ] │
│          Title              │  CSS selector       [.pricing-card.pro │
│          Price              │                      button.subscribe ] │
│          ● Subscribe ←sel'd │  Description                            │
│      ▶ Pricing card "Team"  │  ┌───────────────────────────────────┐  │
│  ▶ FAQ                      │  │ Primary CTA on the Pro tier.      │  │
│  [+ root element]           │  │ Clicking starts the Stripe flow.  │  │
│                             │  └───────────────────────────────────┘  │
│                             │  What users do here (register_intent)   │
│                             │  ┌───────────────────────────────────┐  │
│                             │  │ "subscribe to Pro", "buy pro",    │  │
│                             │  │ "start trial"                     │  │
│                             │  └───────────────────────────────────┘  │
│                             │                                         │
│                             │              [Cancel]  [Save]           │
└─────────────────────────────┴─────────────────────────────────────────┘
```

---

## ElementForm fields

| Field | Required | Stored as | Notes |
|---|---|---|---|
| `label` | yes | `elements.label` | Human name. Shown in popovers. |
| `dom_id` | one of | `elements.dom_id` | Preferred. The DOM adapter tries `#dom_id` first. |
| `css_selector` | one of | `elements.css_selector` | Fallback. Encouraged to be specific enough to be unique. |
| `xpath` | optional | `elements.xpath` | Last-resort. Only used if both above fail. |
| `description` | yes | `elements.description` | What this element *is*. Goes into the LLM context. |
| `register_intent` | no | `elements.register_intent` (text[]) | Phrases users say when they want this. Boosts page selection. |
| `parent_id` | no | `elements.parent_id` | Drag-into-tree sets this. |

At least one of `dom_id` / `css_selector` / `xpath` must be provided. The form enforces this with a Zod refine.

---

## Selector picker — the only clever bit

Customers will paste selectors wrong. A picker reduces that. MVP design:

1. Dashboard shows a "Pick from page" button next to the selector inputs.
2. Clicking it opens a new tab to the customer's site with a query param: `?eregna-pick=<agentId>&page=<pageId>`.
3. The widget on that page (the same `embed.iife.js` they will install) detects `eregna-pick` mode and:
   - Renders a translucent "Picking element for Eregna" banner instead of the chat bubble.
   - On hover, paints an outline on the hovered element.
   - On click, computes `{ dom_id, css_selector, xpath, label_guess }` and `window.opener.postMessage(...)` back to the dashboard tab.
4. Dashboard receives the message, fills the form fields, and lets the customer review/edit before saving.

This requires the customer to have installed the embed snippet first — but the snippet is on the overview page (step 5 of registration), so the flow is: paste snippet → return to dashboard → pick elements.

If the snippet isn't installed yet, the picker falls back to manual paste and surfaces a "Install the snippet to use the picker" hint.

The picker logic lives in `packages/widget/src/picker/`. It re-uses the DOM adapter's selector-resolution code so what the picker captures is exactly what the engine will later resolve.

---

## Tree interactions

| Action | Behavior |
|---|---|
| Click row | Loads it into the detail panel on the right. |
| Drag row onto another row | New `parent_id` = dropped-on row. Server recomputes `ltree` path. |
| Drag row above/below a sibling | Updates `sort_order` only. |
| `+` next to a row | Creates a child with the row as `parent_id`. |
| Delete | Soft-confirm if row has children. Cascade deletes via FK. |

Optimistic UI: tree mutations update local state immediately and reconcile with the server response. Conflicts (server-side validation rejecting a slugified path collision) roll back with a toast.

---

## Validation

Done both in the form (immediate feedback) and on the API (authoritative):

- Slugified label must be unique among siblings (the `ltree` path uniqueness constraint).
- Selectors are not validated for syntactical correctness — too brittle. We let the engine surface "element not found" at runtime and link the customer back to the editor.
- `register_intent` array is capped at 10 phrases; each phrase ≤ 120 chars.

---

## Embedding generation (Phase 2 hook)

In MVP, `description` is stored as plain text and the LLM gets the whole tree. In Phase 2, on description save the API computes a pgvector embedding asynchronously (the column is already in the schema). The dashboard doesn't need to change for that — the indicator dot on each row will just light up when an embedding exists.
