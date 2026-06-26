# 11.0 — Overview

> One page. Phase 1 in one picture, the single hard thing, and what we
> deliberately don't ship yet.

---

## The before/after picture

```
       BEFORE (today)                    AFTER PHASE 1
       ─────────────                     ─────────────

   visitor question                  visitor question
        │                                  │
        ▼                                  ▼
   chat agent                         chat agent  (createAgent loop)
        │                                  │
        │ (plain prose only)               ▼
        │                          decides: prose, or call a tool?
        ▼                                  │
   stream text  ─► widget         ┌────────┼──────────────────────┐
                                  ▼        ▼                      ▼
                              prose     host tool      start_walkthrough(goal)
                                        (client/                  │
                                         server)                  ▼
                                                          runPlanner(model, ctx, goal)
                                                                  │
                                                ┌─────────────────┼─────────────────┐
                                                ▼                 ▼                 ▼
                                         patcher writes      ToolMessage:    middleware projects
                                         WalkthroughPart     { walkthroughId, plan as SystemMessage
                                         (chapters,           chapterCount,  on the next model turn
                                          reasoning,           status }
                                          thought)
                                                                  │
                                                                  ▼
                                                          model loops once more →
                                                          closing prose summary
                                                                  │
                                                                  ▼
                                                            widget renders:
                                                            • checklist (chapters)
                                                            • ▶ Reasoning (disclosure)
                                                            • thought ticker
```

The loop *terminates* the moment the chapters are written and the model
emits a no-tool-call closing turn. There's no playback in phase 1 — the
checklist sits there, the visitor reads it, that's the surface.

---

## What's new (in four sentences)

- The chat agent's `tools` array gains **one** built-in server tool,
  `start_walkthrough`, whose body runs the existing `runPlanner`.
- The planner schema gains a **CoT prefix** (`understanding`,
  `knowledgeAnchors`, `componentMapping`) the model fills *before*
  committing to chapters, plus per-chapter `intent` and `expectedSteps`
  hints the stepper will read in phase 2.
- `WalkthroughPart` gains a structured `reasoning` field that the widget
  renders as an expandable disclosure on the walkthrough card.
- A `wrapModelCall` middleware (`walkthroughContextMiddleware`) reads
  conversation state on every model call and prepends a SystemMessage
  projecting the active plan — so the closing turn and every follow-up
  turn see the same fresh view.

---

## The single hard thing

A `WalkthroughPart` is written *during* a tool call. The closing turn
that follows must see it. The naive approach — stuff the plan into the
ToolMessage — works once but rots: re-plans leave stale plans in
history, multi-walkthrough sessions blow the context budget, and the
"view" the model reads can drift from the structured truth the widget
renders.

The fix is to make the view a **projection of state**, not a copy:

```
   conversation state (one truth)
          │
          ▼
   most-recent WalkthroughPart  ──┬──► widget render (chapters + ▶ reasoning)
                                  │
                                  └──► middleware render (markdown
                                       SystemMessage, fresh each model call)
```

**Selection rule:** middleware scans `conversation.messages` newest →
oldest, projects the first `walkthrough` part found, and stops. Older
walkthroughs in history are not projected — they survive for the model
only as the minimal ToolMessage ack from their original
`start_walkthrough` call (`{ walkthroughId, chapterCount, status }`).
If the visitor references an older tour, chat rules tell the model to
offer a re-plan instead of pretending to recall the chapters.

The middleware runs before every model call, so:

- After the tool returns → middleware injects → model's closing turn is
  grounded in the just-written plan.
- Visitor asks a follow-up → middleware injects again → model can quote
  chapter titles, refuse "edit chapter 3" (no edit tool yet), or offer
  to re-plan.
- Re-plan in the same turn → patcher replaces the part on the current
  message → "most recent" still picks the new one.
- Re-plan in a later turn → new tour lands on a newer message →
  middleware switches projection automatically.

Chapter 04 covers the middleware code + the selection rule; chapter 05
covers the widget.

---

## Host-extensible? Not yet.

`start_walkthrough` is **server-defined**, not a host tool. The host
page can't override it, and host tools (client or server) coexist with
it in the same `tools[]` array — phase 1 just adds one to the list.

This keeps the trust boundary simple: the orchestrator chooses to call
the planner; the host page never declares it.

---

## What the widget shows (high level)

| Surface | Today | After phase 1 |
|---|---|---|
| Chat thread | text bubbles (+ tool-call cards from `9/`) | + WalkthroughCard with chapter checklist |
| WalkthroughCard | play button + goal + chapter count | + chapter list (pending only) + ▶ Reasoning disclosure + live thought line |
| Player | n/a | n/a (phase 2) |
| Debug toggle | from `9/` | unchanged |

The card grows. The player stays dark.

---

## What we're explicitly *not* solving here

- **Chapter playback.** No stepper, no narrator, no engine drive.
  Clicking a chapter does nothing in phase 1 (or, optionally, scrolls
  to the target element — see chapter 05).
- **Plan editing.** "Change chapter 3" is a re-plan, not an edit. Phase
  N+ can add `revise_walkthrough(diff)`.
- **Concurrent walkthroughs in one assistant message.** One plan per
  turn; calling `start_walkthrough` twice in one turn replaces.
- **Cross-turn walkthrough threading.** Each assistant turn is
  independent; if the visitor opens a second walkthrough, it lives in
  its own assistant message.

---

## How to read the rest

Read in order:

1. `01-phases.md` — the three-phase split; what's stub
2. `02-plan-shape.md` — Plan + Chapter + Reasoning schemas
3. `03-prompt-and-rules-split.md` — rules split + planner prompt
4. `04-orchestrator-wiring.md` — tool body + middleware projection
5. `05-planner-ui.md` — WalkthroughCard expansion + disclosure
6. `06-rollout.md` — M1..M4 milestones

Skip to chapter 04 if you only care about the orchestrator changes.
