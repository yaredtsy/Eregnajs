# agent/06 — Context Strategy

What goes into the LLM prompts and why. MVP keeps this dumb: **full element tree of the chosen page**. Phase 2 introduces retrieval. This doc spells out the progression so we don't over-engineer Phase 1.

---

## MVP: full page snapshot

After the planner picks a page, the streamer is given the **entire registered element tree** of that page, formatted as a depth-indented list. Every element row contributes:

```
- {slug} (id: {elementId}) "{label}" — {description}
    register_intent: ["...", "..."]
    selectors: dom_id=#x css=".y" xpath=//z   ← only sent if MULTIPLE are present;
                                                otherwise hidden (LLM doesn't need it)
```

The selectors are **not** typically shown to the LLM because they're brittle to verbalize. The agent references elements by `elementId`; the adapter resolves selectors at runtime. Selectors are included only when the LLM needs to disambiguate visually-similar elements (we let the planner decide — Phase 2 polish).

### Sizing assumption

Phase 1 customers: ≤ 50 elements per page. Average description: ~25 tokens. Tree: ~1.5k tokens. Add the system prompt (~500), the query (~30), the plan (~50) and we're under 3k tokens input per streamer call. Cheap.

If a customer crosses 100 elements on a single page, the prompt starts to bloat and quality drops. That's the trigger for Phase 2.

---

## Phase 2: retrieval

When element count grows past the comfortable cap:

1. Embedding generated for each element's `description + label + register_intent[*]` (concatenated).
2. On planner output (with `pickedPageId`), the streamer embeds the **query** and runs `match_elements` filtered to `pickedPageId`, top-K=20.
3. The element tree sent to the streamer is **pruned** to: top-K matches + their ancestors (so the hierarchy isn't broken) + a one-line "...N more siblings" hint at truncation points.
4. The planner itself doesn't need retrieval — page selection runs over page descriptions, which are short.

The `vector(1536)` column already exists. The `match_elements` RPC is preserved from the legacy schema (unused in MVP). Phase 2 wires it up.

---

## What we deliberately don't include in the prompt

| Item | Why excluded |
|---|---|
| Selectors (`dom_id`, `css_selector`, `xpath`) | Adapter resolves them. Including them encourages the LLM to invent selectors when registered ones fail — exactly the wrong behavior. |
| HTML snippets from the live page | We don't crawl. The dashboard is the source of truth. |
| Previous walkthrough sessions for the same visitor | Privacy + scope. The visitor is anonymous in MVP. |
| The agent's `secret_key` | Obviously. |
| User-provided `system_prompt` overrides | **Included**, prepended to our system prompt with a clear separator. We trust the agent owner; we don't sanitize their voice. |

---

## System prompt structure

```
[Eregna system header]
You are Eregna, an embedded walkthrough guide on the website "{agent.name}".
Your output is structured (tool calls). Do not produce free-form text outside the tool.

[Customer overlay]
{agent.system_prompt or ""}

[Behavior]
- Always reference elements by elementId.
- Use highlight + popover for explanation; wait-for-click only when the user needs to act.
- Keep popover bodies short — 1 to 3 sentences.
- Never invent functionality the page doesn't have.

[Context]
Page: "{page.title}" ({page.url_pattern})
Page description: {page.description}

Elements:
{tree dump}
```

The customer overlay is sandwiched between our header and our behavior rules so customers can adjust tone but not subvert the format contract.

---

## What the planner sees vs. the streamer

| | Planner | Streamer |
|---|---|---|
| All pages (titles + descriptions) | yes | no |
| All pages' element labels (one line each) | yes | no |
| Picked page's full element tree | no | **yes** |
| Picked page's element selectors | no | no (adapter handles) |
| Plan outline | n/a | yes |
| Visitor query | yes | yes |
| Current pageUrl | yes | yes (informational) |
| Chat history from branches | no | yes (when branching) |

The split keeps each call focused. The planner doesn't need full element specs; the streamer doesn't need other pages.

---

## Branching context

On a branch (visitor paused and asked a follow-up), the streamer additionally receives:

```
[Branch context]
The visitor has already seen these steps:
1. (step_01) "Find the Pro card"
2. (step_02) "Highlight Subscribe button"
At step 2, the visitor asked: "{branch query}"
Generate steps that answer the follow-up. End by either returning to the original plan, or closing.
```

This is the only place "chat history" enters the prompt. We don't accumulate a long conversation log — each branch only sees the played steps + the immediate question. Keeps token cost predictable.

---

## Future tooling we're leaving room for

- **Tool: `fetch_element_details(elementId)`** — if the LLM needs more info than the tree line provides, it can ask. (Phase 3.)
- **Tool: `confirm_with_visitor(question)`** — agent surfaces a clarifying question to the user as a popover with options. (Phase 2.)
- **Tool: `lookup_external_doc(url)`** — fetch a page from the customer's site mid-walkthrough. Heavy. (Phase 3+.)

None of these are MVP. The schema in `engine/01-action-schema.md` doesn't include them. Adding them later is additive — old walkthroughs keep working.
