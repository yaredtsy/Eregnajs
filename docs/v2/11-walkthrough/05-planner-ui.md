# 11.5 — Planner UI

> What the visitor sees while planning runs and after the plan lands.
> Phase 1 surface: the existing `WalkthroughCard` grows. No player.
> The card is a checklist + a reasoning disclosure + a live ticker.

---

## The surface in one picture

```
   ┌──────────────────────────────────────────────────────────────┐
   │ ChatPopup thread                                             │
   │ ────────────────────────────────────────────────────────────│
   │                                                              │
   │  You: walk me through creating my first agent                │
   │                                                              │
   │  Eregna:                                                     │
   │  ┌────────────────────────────────────────────────────────┐  │
   │  │ ▶ Create your first agent                              │  │
   │  │   "Thinking through your goal…"           ← thought    │  │
   │  │                                                        │  │
   │  │   ▶ Reasoning                              ← disclosure│  │
   │  │                                                        │  │
   │  │   ☐ Pick "New agent"                       ← chapter 1 │  │
   │  │   ☐ Name your agent                        ← chapter 2 │  │
   │  │   ☐ Point to your site                     ← chapter 3 │  │
   │  │   ☐ Create the agent                       ← chapter 4 │  │
   │  └────────────────────────────────────────────────────────┘  │
   │                                                              │
   │  "I've planned a 4-chapter tour. Hit the card when ready."   │
   │                       ↑ closing message from chat agent       │
   └──────────────────────────────────────────────────────────────┘
```

The card grows during planning, then sits as a static checklist
once the closing message lands. Clicking it does nothing in phase 1
(or scrolls to the first chapter's target — see Optional below).

---

## States the card moves through

```
   stage 0  ── "Planning your tour…"        (skeleton; card placeholder
                                              with the visitor's goal as
                                              the title)
       │
       ▼  (stage 1 returns reasoning)
   stage 1  ── ▶ Reasoning is now expandable
                (title still placeholder; thought line = "Thinking
                 through your goal…")
       │
       ▼  (stage 2 returns frame)
   stage 2  ── title fills: planGoal
                thought updates: frame.thought
                rationale (optional) appears as a small subline
       │
       ▼  (stage 3 returns chapters)
   stage 3  ── chapter checkboxes appear (1..6)
                thought line clears or becomes a static "Ready to play"
                state changes to "planned"
       │
       ▼  (stage 3 fails OR all chapters dropped)
   error   ── inline message in the card body
                "I couldn't plan a full tour. [reason]. Try asking
                 with a more specific goal."
```

The patcher writes between stages drive these transitions —
chapter 02's three-call flow makes the UI come alive in three beats
instead of one freeze-frame.

---

## Component tree (phase 1)

```
   WalkthroughCard
        │
        ├── WalkthroughCardHeader
        │     ├── PlayIcon                       (dimmed in phase 1)
        │     ├── PlanGoal                       (placeholder during stage 0–1)
        │     └── ThoughtTicker                  (latest Thought.label)
        │
        ├── ReasoningDisclosure                  ◄── NEW
        │     ├── DisclosureToggle               (▶ / ▼)
        │     └── ReasoningBody
        │           ├── UnderstandingSection
        │           ├── KnowledgeAnchorsList     (titles as chips)
        │           └── ComponentMappingSection
        │
        └── ChapterChecklist                     ◄── NEW
              ├── ChapterChecklistItem (× chapters.length)
              │     ├── StatusDot                ("pending" in phase 1)
              │     ├── ChapterTitle
              │     └── ChapterMeta              (intent badge + ~N steps)
              └── ChecklistEmptyState            (during stage 0–2)
```

Most pieces are pure presentational components — no engine, no
selectors. The card reads its data from `WalkthroughPart` and renders.

---

## The reasoning disclosure (the "▶ Reasoning" thing)

Default: collapsed.

```
   ▶ Reasoning
```

Expanded:

```
   ▼ Reasoning
   ───────────────────────────────────────────────
   What you asked for
     I read your question as "how do I create my first agent end-to-end".
     You probably already know how to sign in; what's new is the
     three-field form that starts the agent.

   Anchored facts
     · Agent creation guide
     · Pricing tiers

   Why these components
     I picked the New-agent button and the create form because they're
     the only entry points; the agents grid is the post-creation
     destination, so I left it out.
   ───────────────────────────────────────────────
```

Two design notes:

1. **Collapsed by default, persistent expand state.** Once the
   visitor opens it, it stays open for that walkthrough card in
   session storage. Closing it doesn't hide the data — it's just a
   space-saving choice. Mirrors Cursor / Claude inline thought UI.
2. **Empty `knowledgeAnchors` → hide the row.** Don't render an
   empty bullet list; the row simply disappears.

---

## The live ticker

`WalkthroughPart.thoughts` is an array; the card renders the *most
recent* `Thought.label` whose `phase === "plan"` (or any phase, since
phase 1 only writes plan-phase thoughts). The ticker line:

```
   stage 0:  "Reading your goal…"             (system-emitted)
   stage 1:  "Thinking through your goal…"    (system-emitted, replaces stage 0)
   stage 2:  <frame.thought>                  (model-written)
   stage 3:  "Mapping out chapters…"          (system-emitted, replaces stage 2)
   done:     <frame.thought> (frozen)         OR  hidden
```

System-emitted phase tickers come from `runPlanner` via patcher
`addThought` calls before each stage starts. The model only writes
one ticker (in stage 2's `thought` field) — phases 1 and 3 are
deterministic.

---

## The chapter checklist

```
   ☐ Pick "New agent"
       click · 1 step
   ☐ Name your agent
       fill · 2 steps
   ☐ Point to your site
       fill · 2 steps
   ☐ Create the agent
       click · 1 step
```

- **Status dot** stays `pending` (`☐`) for the whole of phase 1.
  Phase 2 adds `active` / `done` / `failed`.
- **Intent badge** is a small label colored by intent (show / click /
  fill / compare).
- **Step hint** reads `~${expectedSteps} step(s)`. This is a *hint*
  — the stepper may emit fewer or more in phase 2.

The checklist is read-only in phase 1. Clicking a chapter does
nothing.

### Optional: scroll-to-target on chapter click

If we want a free preview of "the spotlight will land here" before
phase 2 ships, clicking a chapter can scroll the page to the element
matching `chapter.elementId` (no highlight, no popover — just
`scrollIntoView({ behavior: "smooth", block: "center" })`).

This is opt-in. Default for phase 1 is fully read-only. The toggle
lives in the playground (chapter 06 of `5-playground/`), not in
production builds.

---

## Skeleton (stage 0)

Between the visitor's question and stage 1 returning, the card
shows a skeleton:

```
   ┌────────────────────────────────────────────────────────┐
   │ ▶ Planning your tour…                                  │
   │   "Reading your goal…"                                 │
   │                                                        │
   │   ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░          │
   │   ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░          │
   │   ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░          │
   └────────────────────────────────────────────────────────┘
```

Skeleton bars represent "reasoning + chapters incoming". They
animate (subtle pulse) so the visitor knows the system is alive.

---

## Files

```
EDIT  packages/widget/src/components/ChatPopup/WalkthroughCard.tsx
        - render header + thought ticker
        - render ReasoningDisclosure when wt.reasoning present
        - render ChapterChecklist; empty state during stages 0–2

NEW   packages/widget/src/components/ChatPopup/walkthrough/
        ├── ReasoningDisclosure.tsx
        ├── ChapterChecklist.tsx
        ├── ChapterChecklistItem.tsx
        ├── ThoughtTicker.tsx
        └── WalkthroughCardSkeleton.tsx
NEW   packages/widget/src/styles/walkthrough-card.css  (or use existing
                                                         styling layer)

EDIT  packages/widget/src/types/conversation.ts
        - re-export PlanReasoning + chapter intent + expectedSteps
          from @repo/walkthrough-core
```

The existing `usePreflightPlay` hook stays unused in phase 1 (the
play button stays dimmed). Re-enabling it is phase 2's first
milestone.

---

## Cross-references

- `00-overview.md` — the surface in context
- `02-plan-shape.md` — the data shapes the card reads
- `04-orchestrator-wiring.md` — the patcher writes that drive the
  state transitions
- `packages/widget/src/components/ChatPopup/WalkthroughCard.tsx` —
  file to edit
- `packages/walkthrough-core/src/walkthrough/types.ts` —
  `WalkthroughPart.reasoning?` + chapter additions
