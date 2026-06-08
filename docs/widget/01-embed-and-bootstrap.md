# widget/01 — Embed & Bootstrap

How the widget gets onto a customer page, what it mounts, and how the dev loop works.

> **Status (as built).** The widget mounts a shadow-DOM player and plays a hard-coded sample conversation from `packages/widget/src/data/sample-conversation.ts`. The agent-config fetch, the SSE wiring, and the picker mode described at the bottom of this doc are all still on the roadmap — kept here as the next slice to land.

---

## Boot sequence (today)

```
1. Caller invokes initWidget({}).
2. A <div id="eregna-widget-host"> is appended to document.body.
   Inline styles: position:fixed; bottom:0; right:0; pointer-events:none;
                  z-index:2147483647.
3. attachShadow({ mode: "open" }) on the host.
4. The widget CSS bundle (imported with ?inline) is injected as a single
   <style> node into the shadow root.
5. A <div class="eregna-widget-mount"> child holds the React tree.
6. createRoot(mount).render(<WidgetRoot/>) under StrictMode.
7. WidgetRoot wraps everything in <WidgetProvider conversation={SAMPLE_CONVERSATION}>
   so the player has data to play.
```

There is **no separate body-level overlay div**. The spotlight + popover are rendered via `createPortal(…, document.body)` from inside `WalkthroughOverlay`. The chat popup, FAB, and player bar are in the shadow root; only the overlay portals out. See `widget/02-overlay-and-isolation.md` for why.

---

## `initWidget` signature

```ts
// packages/widget/src/embed.tsx
export type InitWidgetOptions = {
  /** When omitted, a fixed-position wrapper is appended to document.body. */
  container?: HTMLElement
}

export type InitWidgetResult = {
  unmount:    () => void
  shadowRoot: ShadowRoot
}

export function initWidget(options: InitWidgetOptions = {}): InitWidgetResult
```

`unmount()` calls `root.unmount()` and removes the host element if we created it (callers passing their own `container` keep the node). The dev entry uses this on hot-reload.

### What's not yet on the signature (and why it isn't blocking)

- **`agentId`, `apiUrl`** — There's no API call from the widget today. When the streaming endpoint lands, this is where `data-agent-id` and `data-api-url` from the `<script>` tag will flow in.
- **`picker`** — The selector-picker mode (`?eregna-pick=…`) is not wired. The dashboard's "Pick from page" affordance doesn't exist yet either, so there's no other end to talk to.

Plan: when adding the API call, the signature becomes `{ agentId, apiUrl?, container?, picker? }` and `initWidget` boots in three sub-flows — dormant (missing/invalid agentId), picker, or normal player — keyed on those props.

---

## Dev entry

```
packages/widget/src/dev-main.ts        // dev-only entrypoint for the playground
```

This is what Vite serves during `pnpm --filter @repo/widget dev` — a tiny harness that calls `initWidget({})` against an empty page so we can iterate on the shadow-DOM UI without bouncing through a real customer host. The dev playground is **not** what gets bundled into the embed; the IIFE entry below is.

---

## Build outputs (planned)

`packages/widget` will produce three artifacts via Vite once the build is set up:

| File | Format | Consumer |
|---|---|---|
| `dist/embed.iife.js` | IIFE | Customer `<script>` tag |
| `dist/embed.iife.js.map` | source map | Devtools |
| `dist/index.js` + `.d.ts` | ESM library | Dashboard picker flow + tests |

The IIFE entry will read the `<script>`'s dataset and call `initWidget`:

```ts
// packages/widget/src/embed-auto.ts  (not yet present)
import { initWidget } from './embed'

const el = document.currentScript as HTMLScriptElement | null
const agentId = el?.dataset.agentId
const apiUrl  = el?.dataset.apiUrl

if (agentId) initWidget({ agentId, apiUrl })
else console.warn('[Eregna] data-agent-id missing on <script> tag')
```

`embed.iife.js` must be self-contained — no chunk splitting, no CSS file siblings. The CSS is already inlined via `?inline`; the eventual Vite config will need:

```ts
build: {
  lib: { entry: 'src/embed-auto.ts', name: 'EregnaEmbed', formats: ['iife'], fileName: 'embed' },
  rollupOptions: { output: { inlineDynamicImports: true } },
  cssCodeSplit: false,
  cssMinify: true,
}
```

---

## Module resolution

`packages/widget/tsconfig.json` overrides the monorepo base (`NodeNext`) with `moduleResolution: "bundler"` so the source can use bare `from "./Widget"` imports — Vite is the runtime, so the Node-style `.js` requirement doesn't apply. Don't add `.js` extensions in widget imports; CI's tsc check will pass but it's noise.

---

## What gets shipped where

| Concern | Lives in | Why |
|---|---|---|
| Chat popup, FAB, player bar | shadow DOM | CSS isolation. Host site `*` resets can't break our buttons. |
| Spotlight ring | body via `createPortal` | Must align pixel-perfect over the host element. Shadow DOM can't paint outside itself reliably. |
| Popover with typewriter text | body via `createPortal` | Anchored to the highlighted DOM element; co-located with the spotlight. |
| `<style>` tokens & resets | shadow root only | The body-level portal nodes use plain styles defined in the same `widget.css` — they render outside the shadow root but the className prefix `eregna-*` keeps collisions unlikely. |

---

## State + animation

The widget's runtime state lives in **`useReducer` + Context** (`packages/widget/src/store/widget-context.tsx`) — not Zustand. The reducer owns:

- `mode`: `"closed" | "bubble" | "detached"`.
- `status`: `"idle" | "playing" | "paused" | "complete"`.
- The active walkthrough + which step + a `globalOffsetMs` tick.
- Speed (`0.75 | 1 | 1.5 | 2`).

`usePlayer()` runs a `requestAnimationFrame` loop that dispatches `TICK` actions while `status === "playing"`, multiplying the frame delta by the current speed. The typewriter effect is derived purely from `localOffsetMs / TYPEWRITER_MS_PER_CHAR` — no separate timer, no per-character setState.

---

## Failure modes (handled / planned)

| Failure | Today | Once the API call lands |
|---|---|---|
| `data-agent-id` missing | n/a (no script wrapper yet) | Console warn, no mount. |
| Agent inactive or 404 | n/a | Skip mount silently. |
| Origin mismatch | n/a | Mount stays dormant; log a console hint so customers spot a mis-paste. |
| API unreachable on first load | n/a | Retry with exponential backoff (3 attempts) then dormant until `window.eregna.retry()` is called. |
| Host has its own `#eregna-widget-host` | Today's ID is fixed | Switch to a randomized suffix per init: `eregna-widget-host-<6-char>`. |

---

## Cleanup

`initWidget` returns `unmount()`. The dev entry calls it on hot-reload; the eventual IIFE won't (page lifetime owns the widget). When the API call lands, `unmount` should also abort any in-flight SSE stream — wire it through the React context's reducer with an `ABORT` action.
