# 4.2 — The Walkthrough Player

> The face of the product. Same stream as any thinking-agent chat — the difference is entirely in
> rendering: **steps that guide, not transcript that scrolls.** This file specs the detached bar,
> the chapter timeline, the thinking ticker, plans, and playback modes.

---

## 1. The two widget modes

| Mode | Looks like | When |
|---|---|---|
| **Docked** | bubble FAB → chat popup (existing `ChatPopup`) | browsing, asking, reading answers |
| **Detached** | popup collapses; floating **player bar** bottom-center; page is the stage | a walkthrough is playing |

Transition: when a walkthrough part starts streaming, the widget auto-detaches (animate the popup
shrinking into the bar). Closing the bar re-docks and the walkthrough remains in chat history as a
playable card.

## 2. The detached player bar — anatomy

```
                       ┌───────────────────────────────┐
                       │  ✦ Opening the billing page…  │   ← thinking ticker (one line,
                       │  ✦ Found the export button     │     newest at bottom, older lines
                       └──────────── fades ↑ ──────────┘     scroll up & fade out)

   ┌─────────────────────────────────────────────────────────────────┐
   │ ▶ ❚❚   ━━━━━━━━┫██████━━━━━│━━━━━━━━│━━━━━━   2/4   ⛶  ✕      │   ← controls + timeline
   │        Ask a follow-up…                              [Send]     │   ← input row
   └─────────────────────────────────────────────────────────────────┘
```

- Pill-shaped, floating, shadow-elevated; max-width ~640px; safe-area aware; draggable later (not MVP).
- Top edge hosts the **ticker**; the bar itself has two rows: controls+timeline, then input.
- The input is always available — asking mid-walkthrough aborts the current run (confirm if
  playing) and starts a new one. Detached ≠ locked in.

## 3. The chapter timeline (YouTube-style)

One track, one **segment per chapter**, separated by 2px gaps:

- **Width**: proportional to the chapter's step count; while streaming (counts unknown), equal
  widths that re-proportion as steps arrive (animate width with CSS transitions — it reads as
  "the plan is growing").
- **Fill**: played portion filled (step granularity, eased); current position is a dot.
- **Hover**: segment scales up (4px → 8px tall, like YouTube), tooltip above shows
  `chapter title — description` and step count. Hovering elsewhere shows nothing.
- **Color**: default accent; `chapter.status === "failed"` → red; chapter containing any
  `skipped` step → red-tinted portion for those steps.
- **Click**: history/buffered mode → seek to chapter start. Live mode → segments are inert
  (forward-only, v1 open-question #8 stays locked), with a subtle "live" pulse on the streaming edge.

## 4. The thinking ticker & plan panel

Renders `thoughts[*].label` (`2-system/02` §3) as they stream:

- One line at a time above the bar; new thought pushes the previous up; ≥3 lines old fade to 0.
- During `status:"planning"` the ticker is the *only* feedback — it must feel alive (subtle ✦
  shimmer while between thoughts).
- **Tap/click the ticker → plan panel**: a card expanding from the bar listing chapters as a
  checklist (done ✓ / active ▸ / pending ○ / failed ⚠), each with its description; thoughts
  grouped under their chapter, `detail` expandable. This is the same data the dashboard replay
  shows — one renderer, reused.
- Anti-goal: never render raw model deltas in the ticker — labels are atomic; only `detail`
  string-appends.

## 5. Playback modes (the user-facing three)

| Mode | What the visitor experiences | Mechanism |
|---|---|---|
| **Stream (default)** | steps play as they arrive | live engine: event-driven advancement |
| **Play on demand** | "Preparing your walkthrough… ▶ Ready" — watch when ready | frames buffer into the store; when `end` arrives, play as history (typewriter pacing) |
| **Replay** | re-watch any finished run from chat history | history mode over the stored document |

The toggle appears as soon as planning starts ("▶ Watch live" / "≡ Wait for the full guide").
`defaultPlayback` embed config sets the default. Implementation note: *both* paths fill the same
store from the same frames — the only difference is whether the engine consumes eagerly or after
`end`. No second pipeline.

## 6. Step presentation on the stage

- Spotlight overlay + popover anchored to the resolved component (existing `WalkthroughOverlay`),
  popover body typewriters (history) or renders appended chunks (live).
- Before highlight: `scrollIntoView({block:"center", behavior:"smooth"})`, await settle
  (scrollend or 600ms timeout) — the "scroll to screen" requirement (`4-client/03` handles the
  not-found path).
- Popover shows `chapter k/n · step i` breadcrumb and Next/Back (history) or Next-when-ready (live).
- `wait-for-click` steps pulse the target and show "Click the highlighted button to continue"
  with a "Skip" escape (timeout from the action, default 30s → auto-skip + thought).

## 7. Component inventory (build list)

| Component | New/Existing | Notes |
|---|---|---|
| `PlayerBar` | rewrite | two-row layout, ticker mount point |
| `ChapterTimeline` | new | segments, hover-grow, tooltips, red states, seek |
| `ThinkingTicker` | new | thought queue, fade/scroll animation |
| `PlanPanel` | new | chapter checklist + thoughts; reused by dashboard replay |
| `WalkthroughOverlay` / `Popover` | keep | + live/history body ternary (v1 §4.3) + breadcrumb |
| `ChatPopup` | keep | walkthrough parts render as playable cards |
| `useLiveEngine` / `usePlayer` | keep | + buffered mode (consume-after-end) |

Design tone: the host site is the protagonist — the widget is matte, near-monochrome, one accent
color (customer-themable later), system font stack, no hard brand presence. Playground
(`5-playground/`) is where every state of every component above gets exercised.
