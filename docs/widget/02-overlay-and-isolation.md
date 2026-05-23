# widget/02 — Overlay & Isolation

Two DOM surfaces, two reasons. This doc explains the split and the rules for what lives where.

---

## The two surfaces

```
document.body
  ├── <div id="eregna-host-XXXXXX">           ← shadow host
  │     └── #shadow-root  (mode: open)
  │           ├── <style>widget.css</style>
  │           └── <div class="eregna-widget-mount">
  │                 └── React tree (PlayerBar, ChatLog, PopoverLayer)
  │
  └── <div data-eregna-overlay>               ← regular DOM, no shadow
        ├── <div class="eregna-spotlight" style="…clip-path or box-shadow ring…"/>
        ├── <div class="eregna-scroll-marker">…
        └── <div class="eregna-pick-outline">… (picker mode only)
```

Shadow DOM gives **CSS isolation**. Host page `* { margin: 0 }` resets won't bleed in; our Tailwind tokens stay clean.

The overlay is **regular DOM** because it needs to:

- Visually compose with host elements (spotlight ring around a real button).
- Use `position: fixed` reliably (some host pages set a CSS transform on `body`, which breaks fixed positioning *inside* a shadow root in some browsers).
- Be inspectable by customers when debugging selectors ("I see the ring, where's it pointing").

A spotlight rendered inside a shadow root can technically work, but pixel-aligning a ring around a host element from inside a shadow boundary is a stack of edge cases (z-index stacking contexts, transformed ancestors, ResizeObserver edge cases). Putting it outside the shadow trades CSS isolation (we manage that with a unique class prefix) for predictable positioning.

---

## Class-name discipline

Everything inside the overlay is prefixed `eregna-`. CSS lives in `overlay.css` and is injected once into `<head>`. We don't use `!important`; instead the overlay container sets `all: initial` on itself and we redeclare what we need:

```css
[data-eregna-overlay] {
  all: initial;
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 2147483646;        /* one below the shadow host */
}

[data-eregna-overlay] .eregna-spotlight {
  all: initial;
  position: fixed;
  pointer-events: none;
  box-sizing: border-box;
  border: 2px solid rgb(99 102 241);
  border-radius: 8px;
  box-shadow: 0 0 0 9999px rgba(0,0,0,.45);
  transition: top .25s ease, left .25s ease, width .25s ease, height .25s ease;
}
```

`all: initial` resets inherited CSS from the host page so a hostile reset can't deform our elements.

---

## `pointer-events`

The overlay container is `pointer-events: none`. The user must be able to **click through** the dim layer to reach the real button the agent is highlighting. Individual overlay children can opt back in (e.g. a "Cancel walkthrough" button if we add one) but the spotlight ring stays click-through.

---

## Z-index

We use `2147483646` for the overlay and `2147483647` for the shadow host. Both are near `INT32_MAX` and high enough that the only collisions are with sites that have already picked those exact values. If a customer reports a conflict, we expose an init option `zIndexBase` (Phase 2).

---

## Tracking host element positions

Spotlight position needs to follow the host element through scroll, resize, layout shifts, and animations. Approach:

1. On `highlight-element` action, resolve the host element via the DOM adapter.
2. Read its `getBoundingClientRect()`.
3. Set the spotlight's `top/left/width/height` from the rect.
4. Subscribe with **two** observers:
   - `ResizeObserver` on the element — fires on size changes.
   - A shared `IntersectionObserver` with a 1px root margin — fires on scroll/visibility changes.
5. Throttle to `requestAnimationFrame` so we never update faster than the browser repaints.

Cleanup unhooks both observers when the step ends. See `engine/04-dom-adapter.md` for the adapter API that exposes this.

---

## What does NOT go on the overlay

| Component | Where | Why |
|---|---|---|
| Popover | shadow DOM | Has rich content (text, buttons). Read host element rect, render in shadow. |
| Chat input | shadow DOM | Form input + IME — needs full text-input semantics, which shadow handles cleanly. |
| Player bar | shadow DOM | Same reason as chat input. |
| Spotlight ring | overlay | Pixel-aligned to host element. |
| Picker outline | overlay | Pixel-aligned to host element. |
| Scroll marker (arrow on edge of viewport) | overlay | Indicates off-screen target. |

---

## Host CSS attacks

Two hostile patterns we plan for:

1. **Host sets `pointer-events: none` on body.** Overlap with our overlay is fine because overlay is fixed and a child of body, but the shadow host could be unclickable. We set `pointer-events: auto` on the shadow host.
2. **Host has a `transform: ...` on `html` or `body`.** This re-roots fixed positioning. Our overlay still works because it's a direct body child rooting on the same transformed coordinate system as host elements — they all share it. The shadow host gets the same treatment.

If we see customers hitting more exotic patterns, the playbook is: dump the conflict into `reliability/01-robust-playback.md` and patch.

---

## SSR & hydration

The widget is fully client-rendered. There is no SSR concern on customer pages — the embed is a `<script>` that runs after parse. The dashboard is TanStack Start with SSR, but it never mounts the widget itself; the dashboard's "Preview" feature opens the customer site in a new tab.
