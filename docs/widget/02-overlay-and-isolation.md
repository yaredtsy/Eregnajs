# widget/02 — Overlay & Isolation

Two DOM surfaces, two reasons. This doc explains the split and the rules for what lives where.

> **Important difference from the original spec.** The first draft of this doc described a *separate* `<div data-eregna-overlay>` container appended to `document.body`, with `overlay.css` injected into `<head>`. The shipped widget does it differently: `WalkthroughOverlay` uses `createPortal(…, document.body)` to render directly into the host body, and all styles live in the single `widget.css` injected into the shadow root. Plain CSS for the portaled elements lives alongside the shadow-scoped CSS in the same file because the bundler inlines it as a single string. No second `<style>` tag in `<head>`. The two-surface mental model is identical; the wiring is one tag, not two.

---

## The two surfaces

```
document.body
  ├── <div id="eregna-widget-host">              ← shadow host
  │     style="position:fixed; bottom:0; right:0;
  │            pointer-events:none; z-index:2147483647"
  │     └── #shadow-root  (mode: open)
  │           ├── <style>widget.css</style>
  │           └── <div class="eregna-widget-mount">
  │                 └── React tree (BubbleFAB, ChatPopup, PlayerBar)
  │
  └── createPortal target = document.body         ← regular DOM, no shadow
        ├── <svg class="eregna-spotlight">…       (rendered only while status is active)
        └── <div class="eregna-popover">…         (anchored to the highlighted element)
```

Shadow DOM gives **CSS isolation**. Host page `* { margin: 0 }` resets won't bleed in; our Tailwind-like tokens stay clean.

The portal exists because the overlay needs to:

- Visually compose with host elements (spotlight ring around a real button).
- Use `position: fixed` reliably (some host pages set a CSS transform on `body`, which breaks fixed positioning *inside* a shadow root in some browsers).
- Be inspectable by customers when debugging selectors — they can right-click the ring and see it in their devtools, not behind `#shadow-root`.

Pixel-aligning a ring around a host element from inside a shadow boundary is a stack of edge cases (z-index stacking contexts, transformed ancestors, ResizeObserver behavior). Portalling outside the shadow trades CSS isolation (we manage that with a unique `eregna-` class prefix) for predictable positioning.

---

## Class-name discipline

Everything painted on the host body via the portal is prefixed `eregna-`. CSS for those nodes lives in the same `widget.css` file as the shadow-DOM styles. The bundler inlines it as a single string at build time; the shadow root gets the full sheet, and the portaled DOM happens to render its `eregna-spotlight` / `eregna-popover` classes against the host page's cascade. Host CSS *can* reach those nodes — we mitigate by writing explicit values for every property the visual depends on, not by relying on `all: initial`.

Spotlight rendering uses an SVG with a `<mask>` cutout rather than a CSS `box-shadow: 0 0 0 9999px rgba(0,0,0,.45)` ring. The mask gives us a real "see-through hole" in a translucent overlay, which behaves correctly when the host has its own pointer events and z-index stacking.

---

## `pointer-events`

The shadow-host wrapper sets `pointer-events: none` so it doesn't intercept clicks across the whole bottom-right region; the React mount inside it (`.eregna-widget-mount`) is also `pointer-events: none`, and individual interactive children opt back in to `pointer-events: auto`. The chat popup and player bar have `pointer-events: auto` set per element.

The spotlight SVG and the popover are both `pointer-events: none` so the visitor can **click through** to the real button the agent is highlighting.

---

## Z-index

The shadow host sets `z-index: 2147483647` (near `INT32_MAX`). The portaled overlay is rendered into `document.body` *after* the shadow host node in DOM order, so it stacks above by default. If a customer site has its own max-z elements, we'll need to surface a `zIndexBase` option from `initWidget` (Phase 2).

---

## Tracking host element positions

Spotlight position needs to follow the host element through scroll, resize, and layout shifts.

The shipped approach (`packages/widget/src/hooks/useElementRect.ts`):

1. Resolve the host element via `document.getElementById(elementId)`.
2. Poll `getBoundingClientRect()` on every animation frame via `requestAnimationFrame`.
3. Compare against the previous rect; setState only when something changed.
4. Stop polling when the hook unmounts or the element id changes.

This is intentionally lazy — it's the simplest thing that survives scroll, resize, and animated layouts without subscribing to multiple observer APIs. If the polling becomes a bottleneck once we have real walkthroughs running, swap in `ResizeObserver` + `IntersectionObserver` (per the original design) without changing the consumers.

The hook returns `DOMRect | null`; `null` becomes a no-render in `WalkthroughOverlay` (no spotlight, no popover) which is the desired behavior when the target element doesn't exist.

---

## What does NOT go on the body portal

| Component | Where | Why |
|---|---|---|
| Chat popup | shadow DOM | Rich content (text, buttons, scroll). Needs full input semantics, which shadow handles cleanly. |
| Player bar | shadow DOM | Same reason as chat popup — input field, focus management. |
| FAB | shadow DOM | Button; needs hover states; isolated from host hovers. |
| Spotlight ring | body portal | Pixel-aligned to host element. |
| Popover | body portal | Anchored to the highlighted element; needs to overlap arbitrary host content. |

The popover is in the portal (not the shadow root) for one specific reason: when the highlighted element is near the bottom-right of the viewport, the popover's "place above" fallback can overlap the shadow-host region. Rendering both spotlight + popover into the same portal layer keeps them stacking-context coherent.

---

## Host CSS attacks

Two hostile patterns to plan for:

1. **Host sets `pointer-events: none` on body.** Our shadow host is also `pointer-events: none` at the wrapper level, but the interactive children inside `.eregna-widget-mount` set `pointer-events: auto`, which is enough. The body portal nodes are `pointer-events: none` by design.
2. **Host has a `transform: …` on `html` or `body`.** This re-roots fixed positioning. The portal nodes are direct children of `body` and share the host's coordinate system, so they still align with host elements (which also share it). The shadow host is positioned the same way.

If we hit more exotic patterns, the playbook is: file the conflict in `reliability/01-robust-playback.md` and patch.

---

## SSR & hydration

The widget is fully client-rendered. There is no SSR concern on customer pages — the embed is a `<script>` that runs after parse. The dashboard is TanStack Router with client-side rendering; it doesn't mount the widget itself today. A "Preview" feature would open the customer site in a new tab once it exists.
