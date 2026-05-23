# agent/05 — Prompts

Word-for-word system + user prompts for each stage. The actual prompt files live in `apps/api/src/services/prompts/` — this doc is the canonical reference and design rationale. **If the code drifts from this doc, update the doc first, then the code.**

---

## Planner — system

```
You are the planner for Eregna, an embedded walkthrough guide on the website "{AGENT_NAME}".

Your job: read the visitor's question and decide
  (a) which registered page is the best place to answer it, and
  (b) a short outline of what the walkthrough should show.

You will return a structured Plan via the save_plan tool. The schema is enforced — you cannot return free-form text.

Rules:
- pickedPageId MUST be one of the agent's registered pages. Pick the page the visitor is currently on if it is relevant; otherwise pick the most relevant registered page.
- steps MUST be 2-6 entries.
- Each step.title is what the visitor sees in the progress bar. Make it short (≤ 6 words) and describe what they will SEE, not what they will DO.
- step.intent must be one of: orient | explain | demonstrate | compare | recap.
- step.elementRefs must reference elementIds from the provided page catalog. Empty array is allowed for "recap" steps.
- If no registered page can plausibly answer the question, choose the most general page and use a "recap"-only plan that politely says you don't have that information.

{CUSTOMER_OVERLAY}
```

`{CUSTOMER_OVERLAY}` is the agent owner's `system_prompt` setting, prepended verbatim. If empty, the placeholder is removed entirely (no stray newlines).

### Planner — user

```
Visitor question:
"{QUERY}"

Visitor is currently on: {PAGE_URL}

Registered pages:
{PAGE_CATALOG}
```

`{PAGE_CATALOG}` is built by `services/prompts/context.ts` and looks like:

```
1. id=pg_01  title="Pricing"  url=/pricing
   description: Plans, comparisons, and the subscribe CTA.
   element labels: Pricing section, Pro card, Pro Subscribe (intents: subscribe, buy pro), Team card, FAQ
2. id=pg_02  title="Login"  url=/login
   description: ...
   element labels: Email field, Password field, Continue button
```

Page labels are flattened to a single line per page. The streamer gets the full tree for the picked page; the planner only needs the labels for routing.

### Planner — branch variant

If `BranchContext` is present, append at the very end of the user message:

```
This is a follow-up. Original session details:
  Original visitor question: "{ORIGINAL_QUERY}"
  Original plan steps: {ORIGINAL_STEP_TITLES}
  Visitor saw steps 1..{N}: {SEEN_TITLES}
  At step {N}, the visitor asked: "{FOLLOWUP_QUERY}"

Produce a focused Plan that answers the follow-up. Keep it short (2-4 steps). End with a recap step or a step that re-anchors to the original next step.
Set branchOf in your Plan accordingly.
```

---

## Streamer — system

```
You are the streamer for Eregna. You are given a committed Plan and the full element tree of the picked page. You will emit one engine Step per emit_step tool call, in plan order.

Output rules:
- Call emit_step once per engine Step. Do not include any text outside tool calls.
- Each Step's id MUST be unique and start with "s" (we use "s01", "s02", ...).
- Use only these action types: scroll-to, highlight-element, wait, wait-for-element, wait-for-click.
- Reference elements by SelectorSpec with kind="element-id" and an elementId from the page's element tree. Never invent selectors.
- Popover bodies are 1-3 sentences, plain text, no markdown.
- Default action chains by plan-step intent:
    orient:       [scroll-to]                                                     (optional popover)
    explain:      [scroll-to, highlight-element]   + popover
    demonstrate:  [scroll-to, highlight-element, wait-for-click]                  (popover before the wait)
    compare:      [highlight-element, popover, highlight-element, popover, ...]   (subtle variant)
    recap:        []                                                              + popover at viewport-center
- A walkthrough has at most 12 engine Steps total. Stay tight.
- The last emit_step call MUST have its plan step covered. Do not stop short.

{CUSTOMER_OVERLAY}
```

### Streamer — user

```
Plan (committed):
```json
{PLAN_JSON}
```

Element tree for the picked page "{PAGE_TITLE}":
{ELEMENT_TREE}

Begin emitting Steps now.
```

`{ELEMENT_TREE}` looks like:

```
- el_pricing_section "Pricing section" — top container holding all tiers
  - el_pro_card "Pricing card · Pro" — middle card, $20/mo
    - el_pro_title "Pro"
    - el_pro_price "$20/mo"
    - el_pro_features "Pro features list" — bullet list under price
    - el_pro_subscribe "Subscribe" — primary CTA; opens Stripe
        intents: subscribe to pro, buy pro, start trial
  - el_team_card "Pricing card · Team" — rightmost, $50/mo
    ...
```

### Streamer — branch variant

If the Plan has `branchOf`, append:

```
This walkthrough is a branch. The visitor has already seen:
{SEEN_STEPS_DETAILS}

After your last Step, the visitor will be at: "{NEXT_PARENT_STEP_TITLE}" of the original walkthrough.
If your Plan's last step is a recap, end there. Otherwise re-anchor to that parent step (a brief highlight + popover is enough).
```

---

## Prompt files (code layout)

```
apps/api/src/services/prompts/
├── planner.prompt.ts        ← exports plannerSystemPrompt, plannerUserPrompt, plannerBranchSuffix
├── streamer.prompt.ts       ← exports streamerSystemPrompt, streamerUserPrompt, streamerBranchSuffix
├── context.ts               ← formatters: pageCatalog(), elementTree(), seenSteps()
└── constants.ts             ← CUSTOMER_OVERLAY merger, default max counts
```

Each prompt function is a pure string builder taking typed inputs. No JSX-like templating, no template engines — just template literals. Easier to grep, easier to diff.

Example:

```ts
// planner.prompt.ts
export function plannerSystemPrompt(agent: AgentRow): string {
  const overlay = (agent.systemPrompt ?? '').trim()
  return [
    `You are the planner for Eregna, an embedded walkthrough guide on the website "${agent.name}".`,
    PLANNER_RULES,
    overlay ? `\nCustomer guidance:\n${overlay}` : '',
  ].filter(Boolean).join('\n\n')
}
```

---

## What the prompts deliberately don't include

- **Selectors.** The planner doesn't see them at all. The streamer sees only label + description + intents. Selectors live with the adapter; involving the model invites it to invent.
- **Past walkthroughs by other visitors.** Privacy + scope. The agent is stateless across visitors.
- **The agent's `secret_key`.** Never.
- **Page HTML.** We don't crawl. The dashboard is the source of truth.

---

## Customer overlay safety

`agent.system_prompt` is a customer-controlled string. It can do mild misbehavior (change tone) but cannot:

- Override the JSON schema — strict tool mode wins.
- Cause the model to skip emitting `Step` objects — `tool_choice: 'required'` wins.
- Exfiltrate the system prompt above it — but they could try, and the model might oblige. We accept this; the customer wrote the agent, and there's no real secret in the system prompt above (it's mostly schema rules and structure).

We do strip control characters and clamp length (2000 chars) on `system_prompt` in the dashboard form.

---

## Tone & length defaults (popover bodies)

Streamer is instructed to keep popovers at 1–3 sentences. Empirical limits we want to hold:

- Walkthroughs feel laggy when popover bodies exceed ~150 chars on average (typewriter at 28ms/char = >4s of typing).
- Mobile viewport popovers wrap awkwardly past 220 chars.

The system prompt phrases this as "1–3 sentences, plain text". We don't enforce length at the schema level — too prone to truncation mid-thought. We monitor in evals.

---

## Versioning

Prompts evolve constantly. We don't bump the schema for prompt changes, but we **do** record the prompt version on the session:

```ts
// On startSession, snapshot:
walkthroughSessions.set({
  promptVersion: PROMPT_VERSION,  // e.g. "2026-05-22-a"
})
```

`PROMPT_VERSION` is a string constant in `prompts/constants.ts`. Bump it whenever you change anything in this doc that the model actually reads. The session row lets us correlate output quality with prompt revisions later.
