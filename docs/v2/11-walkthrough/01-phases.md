# 11.1 — Phase split

> The walkthrough path lands in three phases — planner, stepper,
> narrator. This folder builds **only phase 1**. Stepper and narrator
> are one-line stubs here; they get their own folders later.

---

## Why phase

Each phase is independently shippable and independently testable. After
phase 1, the visitor can see a plan; nothing plays. After phase 2 they
can play it but the popovers are silent. After phase 3 it talks. Three
gates, three demos, three places to stop and breathe.

```
   phase 1  PLANNER ─── decides flow: which chapters, what each one shows
                          → visible: checklist + reasoning disclosure
                          → playable: no

   phase 2  STEPPER ─── decides mechanics: highlight, wait-for-click, click
                          → visible: live step list + spotlight
                          → playable: yes

   phase 3  NARRATOR ── decides voice: per-step popover prose
                          → visible: popover bodies stream in
                          → playable: yes, with talking
```

---

## What each phase owns

| Phase | Owns | Does NOT own |
|---|---|---|
| **1 Planner** | `Plan` shape, CoT, chapter intent + step-count hint, `start_walkthrough` tool, prompt-projection middleware | Step actions, popover bodies, engine playback |
| **2 Stepper** | `StepSpec` actions (highlight, wait-for-click, click), per-chapter stepper subagent, chapter expansion endpoint | Popover prose, engine drift |
| **3 Narrator** | Popover bodies, per-step narration, voice rules | Action decisions, plan flow |

The boundary that keeps phasing honest: the planner's `expectedSteps` is
a *hint*, not a contract. The stepper can emit fewer or more steps if
the chapter demands it. Same for `intent` — it's read as a steering
signal, not a routing key.

---

## What this folder ships (phase 1)

```
   apps/api/src/services/agent/
        │
        ├── subagents/planner/
        │     ├── schema.ts          (EDIT: + CoT + intent + expectedSteps)
        │     ├── prompt.ts          (EDIT: takes goal; no-scroll-to rule)
        │     └── run.ts             (unchanged)
        │
        ├── prompts/
        │     ├── sections/
        │     │   ├── coreRules.ts          (NEW)
        │     │   ├── walkthroughRules.ts   (NEW)
        │     │   ├── chatRules.ts          (NEW)
        │     │   └── rules.ts              (deprecated — re-export shim)
        │     └── index.ts            (EDIT: export PLANNER_SECTIONS, CHAT_SECTIONS)
        │
        ├── workflow/
        │     ├── chatAgent.ts        (EDIT: add start_walkthrough tool +
        │     │                        walkthroughContextMiddleware)
        │     └── middleware/
        │         └── walkthroughContext.ts (NEW: wrapModelCall projection)
        │
        └── tools/builtin/
              └── startWalkthrough.ts  (NEW: tool body — runs planner,
                                       writes WalkthroughPart, returns ack)

   packages/walkthrough-core/src/walkthrough/
        ├── types.ts                  (EDIT: + reasoning field on WalkthroughPart;
        │                              + intent + expectedSteps on Chapter)
        └── ...

   packages/widget/src/components/ChatPopup/
        ├── WalkthroughCard.tsx        (EDIT: expand into checklist + disclosure)
        └── (helpers for the disclosure UI)
```

Nothing playback-related changes. The engine, the player, the chapter
timeline — all dark.

---

## What phase 2 (Stepper) will need from phase 1

So phase 2 isn't blocked by phase 1's design choices, here's the contract
the planner promises the stepper:

```
   Plan → for each Chapter:
      title          (string)   — display only
      description    (string)   — display + stepper context
      elementId      (string)   — target component key
      intent         (enum)     — steering for the stepper
      expectedSteps  (1..5)     — soft hint, NOT a hard cap
```

The stepper consumes this contract and emits `WalkthroughStep[]`. Phase 1
doesn't write that shape; it only writes the chapter list with
`status: "pending"` and `stepIndex: -1`.

> The `-1` sentinel mirrors today's `planNode` behavior. The widget reads
> it as "steps not expanded yet" and renders the chapter as a checkbox.

---

## What phase 3 (Narrator) will need from phase 1

Nothing new from phase 1. The narrator reads chapters + steps + the
focused element; it doesn't care about CoT, intent, or expectedSteps.
Phase 1's changes are invisible to the narrator.

---

## One-line stubs for stepper / narrator

Until their folders exist:

- **Stepper** = the existing `subagents/stepper/run.ts` + `prompt.ts`,
  to be re-pointed at the new chapter shape in phase 2. Today the
  stepper runs through `streamChapterNode`, which is dark behind the
  chat-agent flag — keep it dark.
- **Narrator** = the existing `subagents/narrator/run.ts` + `prompt.ts`,
  invoked per step by `streamBodyNode`. Also dark. Phase 3 wakes it.

Neither one changes shape during phase 1. The only ripple is the
chapter contract: `intent` and `expectedSteps` show up in `PlanChapter`,
and the stepper will read them when phase 2 starts. Add them now;
ignore them until then.

---

## Cross-references

- `00-overview.md` — phase 1 in one diagram
- `02-plan-shape.md` — the contract this chapter promises phase 2
- `apps/api/src/services/agent/workflow/nodes/streamChapter.ts` — the
  existing stepper node (dark, untouched)
- `apps/api/src/services/agent/subagents/stepper/` — the existing
  stepper code (untouched)
