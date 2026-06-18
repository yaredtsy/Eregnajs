# 7.2 — Agent prompts and facts

> Text the server puts in context. Edit here before we seed. Short sentences beat long ones.

---

## Agent row (Postgres `agents`)

| Field | Value |
|---|---|
| `name` | `Eregna Guide` |
| `description` | Dev helper that walks you through the Eregna dashboard. Not shown to end visitors on customer sites. |
| `website_url` | `http://localhost:3000` |
| `public_id` | `eregna-guide-dev` (fixed — see [03-seed.md](./03-seed.md)) |
| `model` | `gpt-4o-mini` |
| `is_active` | `true` |
| `allowed_origins` | `["http://localhost:3000"]` |

Change `website_url` / `allowed_origins` when you test on another host (e.g. staging).

---

## System prompt (`agents.system_prompt`)

This is the **customer overlay** merged into the planner (and other subagents as today).

```
You are helping someone use the Eregna dashboard for the first time.

Rules:
- Answer only about this dashboard: creating agents, finding the agents list, opening an agent card.
- Prefer short walkthroughs (3–5 chapters) over long lectures.
- If they already have agents in the grid, mention they can click a card instead of creating another.
- Do not invent features that are not on the page (no billing, no team invites).
- Optional form fields (description, model, system prompt) exist but you may skip them — name and website URL are enough to create an agent.
```

**Approve or trim.** If this is too long, cut the last bullet.

---

## Site facts (`site_facts` table)

Optional rows, agent-wide. Start with two:

### Fact 1 — What Eregna is (one sentence)

| `title` | `What is Eregna` |
|---|---|
| `content` | Eregna is an embeddable walkthrough widget: visitors ask questions on a customer's site and the agent highlights real page elements step by step. |
| `sort_order` | `0` |

### Fact 2 — What happens after create

| `title` | `After you create an agent` |
|---|---|
| `content` | A new card appears in the agents grid. Click it to get the embed script, settings, and knowledge base tabs. |
| `sort_order` | `1` |

Add more facts only when a test query fails for lack of context.

---

## Example visitor questions (for you to test)

Use these in the widget on `/dashboard`:

| Query | Expected plan shape |
|---|---|
| `How do I create my first agent?` | hero → grid or new-agent-btn → name → url → submit (3–5 chapters) |
| `Where are my agents?` | hero → agents-grid; short, no form steps |
| `What do I put in the website URL field?` | highlight `dashboard.agent-url`; explain it's the site where they'll paste the script |
| `What is Eregna?` | mostly text answer; maybe hero step only |

---

## What the subagents see (reminder)

| Subagent | Gets from KB |
|---|---|
| **Planner** | Page catalog (title + description), site facts, component **labels + descriptions** on the matched page |
| **Stepper** | Focused chapter + component **notes** + keys (not CSS selectors) |
| **Narrator** | Step intent + popover title hint — writes visitor-facing sentences |

Selectors never go to the LLM. They travel in the **manifest** patch after `enrich`.

---

## Tone for popover bodies (guide agent)

- Second person: "Click…", "Type…"
- One idea per step
- Max ~2 short sentences in the popover body
- Chapter titles ≤ 6 words (planner rule already enforces this)

Example popover body for the new-agent button step:

> Click **New agent** to open the form. You'll add a name and your site's URL next.
