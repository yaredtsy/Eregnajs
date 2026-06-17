# Flow 04 — Replay Drift (regenerate or stop)

> A stored walkthrough replays on a page that has changed — components renamed, removed,
> or the visitor's state no longer matches (the recording selected a row that doesn't
> exist anymore). The replay must not gaslight the visitor by pointing at the wrong
> things. When the recording and reality disagree *enough*, the player stops pretending
> and asks: **"Generate a fresh walkthrough, or stop?"**

---

## 1. The flowchart

```
visitor hits ▶ on an old walkthrough (history mode)
            │
            ▼
   PRE-FLIGHT (before first step plays):
   resolve every manifest key referenced by chapter 1
   through the run's STORED manifest
            │
   ┌────────┴──────────┐
   │ all resolve?      │
   └──┬─────────────┬──┘
  yes │             │ no — the page has drifted
      ▼             ▼
   play         ┌──────────────────────────────────────┐
      │         │            DRIFT DIALOG               │
      │         │  "This page has changed since this    │
      │         │   guide was recorded."                │
      │         │                                       │
      │         │  [⟳ Generate a fresh walkthrough]     │
      │         │  [✕ Stop]                             │
      │         └──────┬──────────────────┬─────────────┘
      │       regenerate│                  │stop
      │                ▼                  ▼
      │     eregna.ask(run's original   close player;
      │     query) → brand-new LIVE     card stays in
      │     run on today's page         chat history
      ▼
   DURING playback, per step:
      │
      ├─ single component missing ──► not-found path (notice +
      │                               red slice + auto-continue)
      │
      └─ ESCALATION RULE: 2nd chapter with a failed
         resolve in one replay ──► stop playback, show
         the drift dialog (the page isn't "a bit off",
         it's a different page)
```

## 2. Why this design

- **Pre-flight on chapter 1 only.** Resolving the *whole* run's keys up front punishes
  long pages (and elements legitimately appear later — tabs, dialogs). Chapter 1 failing
  is the cheap, high-signal canary: if the recording can't even start, ask immediately
  instead of playing three broken steps first.
- **Stored manifest, not live KB.** Replays resolve through the manifest *frozen in the
  run* — replays must reflect what was recorded. (Selector fixes in the dashboard improve
  *new* runs; an old recording on a renamed page is drift by definition, and the dialog —
  not a silent selector swap — is the honest response.)
- **Regenerate = plain `ask()`.** No special "regenerate" pipeline: the stored run carries
  its original query; regeneration is a normal live run on today's page. One entry point,
  zero new server surface.
- **Escalation is a counter, not a heuristic.** One miss = the not-found path already
  covers it. A second *chapter-level* miss flips the interpretation from "one component
  moved" to "this guide is stale" — and quietly red-stripping five segments would be worse
  than asking.

## 3. State drift (beyond missing components)

Components can exist yet be *wrong*: the recording highlights row 3, today the table is
empty. MVP cannot detect semantic drift (it has no expectations recorded). The honest
phasing:

| Drift type | Detected by | Phase |
|---|---|---|
| component missing | manifest resolve fails | 3 |
| component hidden (tab/dialog state) | resolve ladder exhausts (`isUsable`) | 3 |
| semantic/state drift (empty table, changed copy) | recorded `expect{}` on gated steps (Flow 03) re-checked on replay | 5+, only if real recordings show the need |

## 4. Condition table

| # | Condition | Expected behavior | Phase |
|---|-----------|-------------------|-------|
| R-D1 | replay on unchanged page | plays exactly as recorded | works now |
| R-D2 | chapter-1 target removed (vanishing banner replayed late) | pre-flight fails → drift dialog before any step | 3 |
| R-D3 | dialog → Regenerate | new live run with original query; old card remains in history | 3 |
| R-D4 | dialog → Stop | player closes; chat intact; no error noise | 3 |
| R-D5 | one mid-replay miss | notice + red slice + continue (no dialog) | 3 |
| R-D6 | second chapter-level miss mid-replay | playback pauses → drift dialog | 3 |
| R-D7 | replay containing tool steps | tools never re-execute (Flow 03 A-C10); recorded result cards display | 3 |
| R-D8 | regenerate while another run is streaming | `ask()` aborts the in-flight run first (existing semantics) | 3 |

## 5. What this teaches

Recordings are **claims about a past page**. The replay player's job is not to make old
claims true — it's to *notice* when they no longer are and hand the decision to the human
with a one-question dialog. This mirrors the memory-staleness rule everywhere in agent
engineering: stored context must be re-validated against current reality before acting on
it, and the cheapest validation point (chapter-1 pre-flight) buys most of the value.
