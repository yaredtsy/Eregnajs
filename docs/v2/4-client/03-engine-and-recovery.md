# 4.3 — Engine & Recovery

> The engine is the only code that touches the host DOM. Its job in v2 grows: resolve selector
> queries through the manifest, execute tools safely, and **fail visibly and gracefully** —
> requirement: "if it cannot find the component, show a message and mark the segment red."

---

## 1. Resolution: key → element

Steps reference component **keys**; the run's **manifest** (`2-system/02` §4) maps each key to an
ordered `SelectorQuery[]`. The resolver:

```ts
function resolve(key: string, manifest: Manifest): Element | null {
  for (const sel of manifest[key]?.selectors ?? []) {
    const el = trySelector(sel)            // dom-id → css → text, in declared order
    if (el && isUsable(el)) return el      // usable = connected, not display:none,
  }                                        //          not zero-rect (unless scrollable-into-view)
  return null
}
```

- `text` strategy: match visible text content (normalized), optional tag filter; pick the
  *smallest* matching element (innermost wins — avoids matching `<body>`).
- Ambiguity (css/text hits >1): take the first in document order, record
  `resolution: "ambiguous"` on the step — playground surfaces this so the customer tightens the query.

## 2. The retry ladder (before declaring not-found)

Components legitimately appear late (lazy render, route settle, the dialog a *previous tool call*
just opened). One immediate failure ≠ missing:

```
attempt 1: resolve immediately
attempt 2: MutationObserver on document.body, re-resolve on mutation batches  ┐ max 3s total
attempt 3: after scroll-to of the chapter's parent target, re-resolve         ┘
→ still null: NOT FOUND path (§3)
```

3s is per-step, bounded — a stuck step must not freeze a walkthrough. Tools that are *expected* to
reveal elements (open dialog) get their reveal time from this same window: order actions as
`call-tool` → `highlight`, and the ladder absorbs the dialog's animation.

## 3. The not-found path (the requirement, exactly)

When resolution fails after the ladder:

1. Step `status: "skipped"`, `skipReason: "element-not-found:<key>"` (local mutation —
   client-owned playback state, `2-system/01` §3).
2. **Message**: a small non-modal notice card where the popover would be (viewport-center):
   *"I couldn't find **{label}** on this page — it may be hidden or this page may have changed."*
   with **Continue** (default, auto after 2.5s) and **Stop walkthrough**.
3. **Timeline**: the step's slice of its chapter segment turns red ( `4-client/02` §3); the plan
   panel marks the step ⚠ with the reason.
4. Playback continues with the next step. A chapter whose *target* key never resolves skips as a
   unit (all its steps) with one notice, not N.
5. Telemetry: skip reasons land in the run record → the dashboard's "failed steps" view → the
   customer fixes the selector. This is loop step 7 from `1-product/01`.

Same path handles: tool throw (`skipReason: "tool-error:<name>"`), tool timeout, `api` tool
non-2xx. One failure UX, many causes.

## 4. Action execution (per step)

```
for each action: scroll-to → settle | highlight → resolve (ladder) → spotlight
                 wait(ms ≤10s) | wait-for-click → pulse + listener + 30s timeout→skip
                 call-tool → validate still-registered → execute (10s timeout) → record result
```

- Engine is sequential within a step, steps sequential within the run — no parallel DOM actions, ever.
- Every action wrapped: an exception becomes a skip, never an uncaught error in the host console.
- Highlight cleanup is owned by the *next* step's setup and by `Stop` — no orphaned spotlights.

## 5. What the engine never does

- Never executes selectors from the LLM (only manifest entries the customer registered).
- Never clicks/types on the host page by itself — MVP interaction is *the visitor* clicking
  (`wait-for-click`) or *the page's own tools*. A future `click` action is a product decision
  (consent, liability), not an engine patch.
- Never swallows a failure silently — every deviation is a status + reason + visible cue.

## 6. Testing the engine

Pure-function extraction makes this testable without a browser: `trySelector`/`isUsable` against
jsdom fixtures; the ladder with fake timers; not-found path as a state-machine test. The
playground's hostile components (`5-playground/02`) are the integration suite: late-mounting,
vanishing, duplicated, hidden-in-tab, dialog-only — each maps to one ladder branch or skip reason.
