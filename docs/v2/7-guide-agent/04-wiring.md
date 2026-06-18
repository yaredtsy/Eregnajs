# 7.4 — Widget wiring

> How the dashboard stops using the hard-coded sample and calls the guide agent instead.

---

## Today

```ts
// apps/eregna/src/routes/dashboard/route.tsx
initWidget()  // no agent id → SAMPLE_CONVERSATION inside Widget.tsx
```

Playground already does it right:

```ts
initWidget({ agentPublicId: agent.public_id, apiBase })
```

---

## After (guide agent)

### `/dashboard` layout

```ts
const guideId = import.meta.env.VITE_EREGNA_GUIDE_AGENT_ID
const apiBase = import.meta.env.VITE_EREGNA_API_URL

if (guideId) {
  initWidget({ agentPublicId: guideId, apiBase })
} else {
  initWidget() // fallback: static sample while env unset
}
```

Skip on playground routes (unchanged — playground uses the customer's agent).

### `/dashboard/$agentId` embed tab (optional second surface)

Show the same `public_id` in a **dev-only** callout:

> Testing: this tab can mount the guide widget with `eregna-guide-dev` to verify embed + stream on a sub-page.

Or mount a second widget only when `VITE_EREGNA_GUIDE_AGENT_ID` is set and a query flag `?guide=1` is present — keeps the embed tab clean by default.

**Pick one when implementing.** Default recommendation: **only `/dashboard` list page** for v1.

---

## Visitor flow on ask

```
User types in widget input
        │
        ▼
window.eregna.ask(query)
        │
        ▼
POST /public/agent/run
  { publicId, pageUrl: location.href, query }
        │
        ▼
hello frame → patch frames → end frame
        │
        ▼
store applies patches → live engine plays steps
        │
        ▼
spotlight + popover + timeline animate on real DOM
```

`pageUrl` must match `/dashboard` so the server loads the seeded page and six components.

---

## Fallback behaviour

| Condition | Widget behaviour |
|---|---|
| `VITE_EREGNA_GUIDE_AGENT_ID` unset | Static sample (current) |
| API down / 403 / 429 | Show error in chat; do not silently fall back to sample |
| Component missing in DOM | Red segment + notice (engine recovery path) |

---

## Files touched (implementation checklist)

| File | Change |
|---|---|
| `apps/eregna/src/routes/dashboard/route.tsx` | pass `agentPublicId` when env set |
| `apps/eregna/.env.example` | document `VITE_EREGNA_GUIDE_AGENT_ID` |
| `packages/widget/src/Widget.tsx` | when `agentPublicId` provided, do not default to `SAMPLE_CONVERSATION` |
| `packages/db/src/seed-guide-agent.ts` | new |
| `docs/v2/6-roadmap/01-build-order.md` | add one line under Phase 5 or new Phase 5.5 |

---

## What we are testing together

One page open, one question, you should see **all at once**:

1. Thinking ticker text during plan
2. Chapter segments filling on the timeline
3. Spotlight moving between registered components
4. Popover typewriter text
5. Stream still arriving while animation plays (live mode)

That is the point of this agent — not onboarding real users yet.
