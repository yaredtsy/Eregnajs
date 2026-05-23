# widget/01 — Embed & Bootstrap

How `<script src="…/embed.iife.js" data-agent-id="…">` becomes a running player on the customer's page.

---

## Boot sequence

```
1. <script> tag loads. document.currentScript points at it.
2. Read data-agent-id (and optional data-api-url, data-theme).
3. Create <div id="eregna-host">  on document.body.
   └── attachShadow({ mode: 'open' })  ← player UI lives in here.
4. Create <div data-eregna-overlay>   on document.body.
   └── NO shadow root. Holds spotlight rings + scroll anchors.
5. Inject widget.css into the shadow root.
   Inject overlay.css into <head>  (namespaced selectors).
6. Mount <WidgetRoot> with React into the shadow root.
7. Fetch agent config from the API → if active, render player. Else, do nothing.
```

Two DOM surfaces, by design. See `widget/02-overlay-and-isolation.md` for the rationale.

---

## `initWidget` signature

```ts
// packages/widget/src/embed.tsx
export type InitWidgetOptions = {
  agentId:   string                 // required — agent public_id
  apiUrl?:   string                 // override base URL
  container?: HTMLElement           // for embedding inside an iframe in tests
  picker?:   { agentId: string; pageId: string }   // dev-mode picker flow
}

export type InitWidgetResult = {
  shadowRoot: ShadowRoot
  overlay:    HTMLDivElement
  unmount:    () => void
}

export function initWidget(opts: InitWidgetOptions): InitWidgetResult
```

The IIFE entry just reads the dataset and calls it:

```ts
// packages/widget/src/embed-auto.ts
import { initWidget } from './embed'

const el = document.currentScript as HTMLScriptElement | null
const agentId = el?.dataset.agentId
const apiUrl  = el?.dataset.apiUrl
const picker  = el?.dataset.eregnaPick

if (agentId) {
  if (picker) {
    initWidget({ agentId, apiUrl, picker: parsePickerHint(picker) })
  } else {
    initWidget({ agentId, apiUrl })
  }
} else {
  console.warn('[Eregna] data-agent-id missing on <script> tag')
}
```

---

## Agent identity & origin check

Once mounted, the widget calls `GET /v1/agents/by-public-id/:publicId` (a route we add specifically for the visitor flow) to fetch the agent's public config:

```
{
  "publicId":   "acme-abc123",
  "name":       "Acme Docs Agent",
  "isActive":   true,
  "websiteUrl": "https://acme.com",
  "theme":      { ... }  // Phase 2
}
```

If `isActive === false`, the widget unmounts. If the current `window.location.origin` doesn't match `websiteUrl`'s origin, the widget shows a one-line console warning and stays dormant (helps customers notice they pasted the snippet on the wrong domain).

The API does the same origin check on `POST /v1/walkthroughs/run`. The client check is courtesy; the server is authoritative.

---

## Build outputs

`packages/widget` produces three artifacts via Vite:

| File | Format | Consumer |
|---|---|---|
| `dist/embed.iife.js` | IIFE | Customer `<script>` tag |
| `dist/embed.iife.js.map` | source map | Devtools |
| `dist/index.js` + `.d.ts` | ESM library | Dashboard `picker` flow + tests |

`embed.iife.js` must be self-contained — no chunk splitting, no CSS file siblings. Vite config:

```ts
// packages/widget/vite.config.ts
export default {
  build: {
    lib: { entry: 'src/embed-auto.ts', name: 'EregnaEmbed', formats: ['iife'], fileName: 'embed' },
    rollupOptions: { output: { inlineDynamicImports: true } },
    cssCodeSplit: false,
    cssMinify: true,
  },
}
```

CSS is bundled into the JS via `?inline` imports so it can be injected programmatically:

```ts
import widgetCss from './styles/widget.css?inline'
import overlayCss from './styles/overlay.css?inline'
```

---

## What gets shipped where

| Concern | Lives in | Why |
|---|---|---|
| Player UI (player bar, chat input, popover) | shadow DOM | CSS isolation. Host site's `*` resets won't break our buttons. |
| Spotlight ring, scroll target marker | host body overlay | Must align over real host elements pixel-perfect. Shadow DOM can't paint outside itself. |
| Picker outline (dev-mode element picker) | host body overlay | Same reason. Re-uses spotlight code. |
| `<style>` tokens & resets | both | Two CSS bundles, both namespaced. |

The popover anchored to an element is rendered in the shadow DOM but **positioned by reading the host element's bounding rect** from inside the widget. We don't need to paint the popover on the host body — it just needs to know where the element is.

---

## Cleanup

`initWidget` returns an `unmount` function. The IIFE doesn't call it (the page lifetime owns the widget), but it's wired up for tests and dev hot-reload. `unmount` tears down React, removes both DOM nodes, and aborts any in-flight SSE stream.

---

## Failure modes (handled)

| Failure | Behavior |
|---|---|
| `data-agent-id` missing | Console warn, no mount. |
| Agent inactive or 404 | Mount removed silently. |
| Origin mismatch | Mount stays but disabled (no chat bubble shown), console hint logged. |
| API unreachable on first load | Retry with exponential backoff (3 attempts, then dormant until `window.eregna.retry()` is called). |
| Customer's site has its own `<div id="eregna-host">` | Use a randomized suffix per init: `eregna-host-<6-char>`. |
