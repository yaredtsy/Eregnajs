# 7.5 — How to test

> Manual script after seed + wiring land. No playground needed.

---

## Setup

1. `bun run --cwd packages/db seed:guide`
2. `apps/eregna/.env` has `VITE_EREGNA_GUIDE_AGENT_ID=eregna-guide-dev`
3. API on `:4000`, dashboard on `:3000`, logged in
4. Open `http://localhost:3000/dashboard`

---

## Smoke test A — stream works

1. Open widget (FAB or bar).
2. Ask: **How do I create my first agent?**
3. Watch within ~5–10 seconds:

| Signal | Pass? |
|---|---|
| Thinking ticker shows plan-phase labels | ☐ |
| Timeline gets 3+ chapter segments | ☐ |
| First spotlight lands on hero or grid | ☐ |
| Popover text appears (not empty) | ☐ |
| Run ends with complete status (no stuck "...") | ☐ |

---

## Smoke test B — animation matches stream

1. Same query, do not pause.
2. Steps should advance as patches arrive (live mode).

| Signal | Pass? |
|---|---|
| Spotlight moves before the full plan is done | ☐ |
| Popover updates per step | ☐ |
| "New agent" step appears **after** grid step (sensible order) | ☐ |
| Clicking New agent yourself mid-run does not crash the engine | ☐ |

---

## Smoke test C — form visibility

1. Ask the create-agent question **before** opening the form.

| Signal | Pass? |
|---|---|
| Plan includes a step on `dashboard.new-agent-btn` | ☐ |
| Name/url steps may fail or skip if form closed — note behaviour | ☐ |

2. Click **New agent**, ask again.

| Signal | Pass? |
|---|---|
| Name and URL fields get highlighted | ☐ |
| Final step targets `dashboard.create-form` / submit | ☐ |

If (1) fails often, add to component **notes**: "Stepper should tell user to open the form first."

---

## Smoke test D — debug endpoints (optional)

With owner JWT (your login won't own the guide agent — use service role or add a debug route):

- `POST /v1/agent/debug/plan` with the guide `public_id` + query
- Confirm `pickedPageId` is the Dashboard page
- Confirm planner sees six components in the catalog

If debug is owner-only, temporarily log context in API dev mode — or log in as `guide@eregna.dev`.

---

## Smoke test E — wrong page

1. Open `/dashboard/$agentId/settings`
2. Ask the same question

| Signal | Pass? |
|---|---|
| Widget on settings tab: still guide agent or disabled? (decide in 04-wiring) | ☐ |
| If run starts, planner may pick Dashboard page anyway (url mismatch) — note result | ☐ |

v1 keeps guide widget **only** on `/dashboard` list to avoid confusion.

---

## When something fails

| Symptom | Likely cause |
|---|---|
| 403 on run | `allowed_origins` missing `http://localhost:3000` |
| Empty plan / apology chapter | Page url_pattern does not match `pageUrl` |
| Red segments on name field | Form not open; DOM id not found |
| Static sample still plays | `VITE_EREGNA_GUIDE_AGENT_ID` unset or widget not updated |
| No patches | Public run route not mounted; check network tab |

---

## Done means

- [ ] Seed script idempotent
- [ ] Six components in DB match live DOM ids
- [ ] `/dashboard` uses live stream, not `sample-conversation.ts`
- [ ] Smoke tests A + B pass on your machine
- [ ] You approved copy in `02-prompts.md` and `01-components.md`

Then we can extend (embed tab, more components, production origin).
