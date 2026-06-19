# 8.3 — Per-role projection

> The design fix for issue B: each subagent gets a different slice of
> `AgentContext`. This chapter extends `docs/v2/3-server/01 §3` with the
> chat row that was missing.

---

## The four roles, side by side

```
                       AgentContext (one truth)
                                 │
        ┌────────────┬──────────┴──────────┬────────────┐
        ▼            ▼                     ▼            ▼
     Planner      Stepper               Narrator      Chat
   ─────────    ─────────              ─────────    ─────────
   breadth      depth                  voice        knowledge
                                                   + persona
```

Reading the dendrogram: every leaf is a *projection function* of
`AgentContext`. The truth doesn't change; the view does.

---

## Updated projection table

| Call | Sees | Does NOT see |
|---|---|---|
| **Planner** | question + page summary + component index (keys, labels, 1-line desc) + fact titles + tool names/desc + compact hostState | selectors, component notes, full fact bodies |
| **Stepper** | one chapter + focused tree (target full row, parents, siblings) + full tool specs + relevant facts | other chapters' details, full tree |
| **Narrator** | one step + chapter + target label/desc + voice rules | tools, tree, state |
| **Chat** *(new)* | persona overlay + page summary + **knowledge** (facts + hostKnowledge) + **element labels only** (no key tree) + recent history | full element tree, host tools, raw hostState JSON |

The new row is the deliverable. Everything below this paragraph follows
from it.

---

## Why "labels only" for chat

```
   planner needs:   keys + labels + descriptions
       (it produces JSON referencing keys)

   stepper needs:   keys + labels + notes + parents + siblings
       (it scopes one chapter to one subtree)

   chat needs:      labels
       (it talks about UI in human words; it doesn't address elements)
```

For chat, "Click the **New agent** button" is the answer shape — never
`element[key="dashboard.new-agent-btn"]`. So the keys are not just unused,
they're misleading: the model may include them in prose. Strip them.

A `pageElementsSummary` section renders a one-line index:

```
This page has 6 interactive elements: Page header,
Agents grid, "New agent" button, Agent name field,
Agent website URL field, Create form.
```

~150 chars vs ~8 KB. Most chat questions are answered before this line ends.

---

## Why no host tools for chat

Chat is the text-only path. It cannot emit `call-tool` actions. Listing
tools makes the model say things like *"I'll create the agent for you,"*
which it can't. Drop the section from `CHAT_SECTIONS` entirely.

```
                CHAT_SECTIONS
                      │
        ┌─────────────┼─────────────┬──────────┐
        ▼             ▼             ▼          ▼
   chatRules     customerOverlay  knowledge   pageContext
                                                  │
                                                  ▼
                                       pageElementsSummary
                                                  │
                                                  ▼
                                       hostState (optional)
```

`hostState` stays — chat questions like *"how many agents do I have?"* are
answered from `{ agentCount: 3 }`. But the trust framing must be added
(chapter 05).

---

## Section set per role (suggested)

```ts
// prompts/compose.ts
export const PLANNER_SECTIONS = [
  coreRules, walkthroughRules, customerOverlay,
  pageContext, elementsTree, knowledge, hostState, hostTools,
]
export const STEPPER_SECTIONS = [
  coreRules, walkthroughRules, customerOverlay,
  pageContext, focusedTree, hostState, hostTools,
]
export const NARRATOR_SECTIONS = [
  coreRules, narratorVoice, customerOverlay,
]
export const CHAT_SECTIONS = [
  coreRules, chatRules, customerOverlay,
  knowledge, pageContext, pageElementsSummary, hostState,
]
```

Note the **ordering** for chat: knowledge above pageContext. The model
anchors on what comes first; for chat the answer source is facts, not the
page tree.

---

## What this buys

| Metric (planner-grade vs chat-grade) | Today | After |
|---|---|---|
| element block size for chat | up to 8 KB | ~150 chars |
| host tools block size for chat | up to 4 KB | 0 |
| role-identity collisions | 1 (issue A) | 0 |
| debug endpoint honesty | reports planner shape | reports actual shape |

Token savings are nice. The real win is **no more role drift** and a
debug surface (`POST /v1/agent/debug/context`, `3-server/01 §8`) that
shows what each role *actually* saw.

---

## Dendrogram: how a chat call composes after this change

```
   buildChatMessages(ctx, q)
            │
            ▼
   composeSystemPrompt(ctx, CHAT_SECTIONS)
            │
            ├── coreRulesSection            ◄── shared
            ├── chatRulesSection            ◄── new, role-specific
            ├── customerOverlaySection      ◄── persona
            ├── knowledgeSection            ◄── promoted
            ├── pageContextSection
            ├── pageElementsSummarySection  ◄── new, labels-only
            └── hostStateSection            ◄── with trust framing
            │
   + chat-mode SystemMessage suffix (1 short block)
   + history (user / assistant turns)
   + HumanMessage("Visitor (untrusted) says: <<< {q} >>>")
```

That's the picture the rest of the chapters implement.

---

## Next

[04-rules-split.md](./04-rules-split.md) — the literal prompt text for
`coreRules`, `walkthroughRules`, `chatRules`, and `narratorVoice`.
