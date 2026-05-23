# engine/04 — DOM Adapter

`HostAdapter` is the interface the engine speaks. `DomHostAdapter` is the only implementation in MVP, lives in `packages/widget/src/adapter/DomHostAdapter.ts`. Tests use an in-memory fake.

The adapter is the **only** place that touches `document`, `window`, or the overlay. Engine handlers never reach into the DOM.

---

## Interface

```ts
// packages/walkthrough-core/src/adapters/HostAdapter.ts
export interface HostAdapter {
  // Selector resolution
  resolve(spec: SelectorSpec): Promise<ResolvedElement | null>
  waitForElement(spec: SelectorSpec, timeoutMs: number, signal: AbortSignal): Promise<ResolvedElement>

  // Visual
  highlightElement(spec: SelectorSpec, variant?: 'primary' | 'subtle'): Promise<TeardownFn>
  scrollIntoView(spec: SelectorSpec, opts: ScrollOpts): Promise<void>
  showPopover(config: PopoverConfig): Promise<TeardownFn>
  setTypewriterState(state: TypewriterState): void

  // Events
  waitForClick(spec: SelectorSpec, timeoutMs: number | null, signal: AbortSignal): Promise<void>

  // Lifecycle
  destroy(): void

  // Phase 2
  simulateClick(spec: SelectorSpec): Promise<void>
  fillInput(spec: SelectorSpec, value: string): Promise<void>
  navigate(url: string): Promise<void>
}

export interface ResolvedElement {
  el: Element
  rect: DOMRectReadOnly
  source: 'dom_id' | 'css_selector' | 'xpath' | 'raw'
}

export type TeardownFn = () => void
```

`ResolvedElement.rect` is captured at resolve time. Live tracking happens via observers wired internally by the adapter, not exposed to the engine.

---

## Selector resolution

`resolve()` is the core. Input: a `SelectorSpec`. Output: the element + which strategy worked.

```ts
async resolve(spec: SelectorSpec): Promise<ResolvedElement | null> {
  if (spec.kind === 'css')   return tryQuery(document, spec.css, 'raw')
  if (spec.kind === 'xpath') return tryXPath(spec.xpath, 'raw')

  // element-id → load the registered selectors from the page snapshot
  const reg = this.elementRegistry.get(spec.elementId)
  if (!reg) return null

  for (const [field, strategy] of [
    [reg.domId,        'dom_id'],
    [reg.cssSelector,  'css_selector'],
    [reg.xpath,        'xpath'],
  ] as const) {
    if (!field) continue
    const r = strategy === 'xpath' ? tryXPath(field, strategy) : tryQuery(document, field, strategy)
    if (r) return r
  }
  return null
}
```

`elementRegistry` is a `Map<elementId, ElementSnapshot>` populated by the widget at session start. The widget fetches `GET /v1/agents/by-public-id/:publicId/page-snapshot?url=...` once per session — a single call that returns the chosen page's full element tree, including all selectors. The same data is sent to the LLM as context (see `agent/02-context-strategy.md`).

If `domId` matches but is non-unique (multiple `#x` on a page — invalid HTML but real), we use the first match and log a warning.

---

## `waitForElement`

```ts
async waitForElement(spec, timeoutMs, signal): Promise<ResolvedElement> {
  // Fast path
  const immediate = await this.resolve(spec)
  if (immediate) return immediate

  return new Promise((resolve, reject) => {
    const observer = new MutationObserver(async () => {
      const r = await this.resolve(spec)
      if (r) { observer.disconnect(); clearTimeout(timer); resolve(r) }
    })
    observer.observe(document.body, { childList: true, subtree: true, attributes: true })

    const timer = setTimeout(() => {
      observer.disconnect()
      reject(new Error('element not found within timeout'))
    }, timeoutMs)

    signal.addEventListener('abort', () => {
      observer.disconnect()
      clearTimeout(timer)
      reject(new DOMException('aborted', 'AbortError'))
    }, { once: true })
  })
}
```

`MutationObserver` over the whole body sounds expensive — it isn't, as long as we disconnect on resolution and don't keep more than one active. We never run multiple waiters at the same time because the executor is sequential.

---

## `highlightElement`

```ts
async highlightElement(spec, variant = 'primary'): Promise<TeardownFn> {
  const target = await this.resolve(spec)
  if (!target) return noop

  const ring = this.overlay.createSpotlight(variant)
  const update = () => {
    const r = target.el.getBoundingClientRect()
    ring.style.top    = `${r.top}px`
    ring.style.left   = `${r.left}px`
    ring.style.width  = `${r.width}px`
    ring.style.height = `${r.height}px`
  }
  update()

  const ro = new ResizeObserver(update)
  ro.observe(target.el)
  const onScroll = () => requestAnimationFrame(update)
  window.addEventListener('scroll', onScroll, { passive: true, capture: true })
  window.addEventListener('resize', onScroll, { passive: true })

  return () => {
    ro.disconnect()
    window.removeEventListener('scroll', onScroll, { capture: true })
    window.removeEventListener('resize', onScroll)
    ring.remove()
  }
}
```

The teardown function is what handlers push onto the `CleanupStack`. When the engine aborts or completes, all teardowns flush in LIFO order — spotlights disappear in reverse of creation.

---

## `scrollIntoView`

Defers to the native API where possible:

```ts
async scrollIntoView(spec, { block = 'center', behavior = 'smooth' }): Promise<void> {
  const target = await this.resolve(spec)
  if (!target) return
  target.el.scrollIntoView({ block, inline: 'center', behavior })

  // Wait for the scroll to settle — the native API doesn't return a promise.
  // We approximate by polling the element's rect for stability across two frames.
  await waitForScrollSettle(target.el)
}
```

`waitForScrollSettle` watches `getBoundingClientRect()` over `requestAnimationFrame` until two consecutive frames report the same `top`. Bounded by 1500ms.

---

## `waitForClick`

```ts
async waitForClick(spec, timeoutMs, signal): Promise<void> {
  const target = await this.resolve(spec)
  if (!target) throw new Error('element not found')

  return new Promise((resolve, reject) => {
    const onClick = () => { cleanup(); resolve() }
    const timer = timeoutMs ? setTimeout(() => { cleanup(); reject(new Error('timeout')) }, timeoutMs) : null
    const onAbort = () => { cleanup(); reject(new DOMException('aborted', 'AbortError')) }

    const cleanup = () => {
      target.el.removeEventListener('click', onClick, true)
      signal.removeEventListener('abort', onAbort)
      if (timer) clearTimeout(timer)
    }

    target.el.addEventListener('click', onClick, { capture: true, once: true })
    signal.addEventListener('abort', onAbort, { once: true })
  })
}
```

`capture: true` so we hear the click even if the host site stops propagation in a bubble-phase listener.

---

## `showPopover`

```ts
async showPopover(config: PopoverConfig): Promise<TeardownFn> {
  // Resolve the anchor element once for stable positioning
  const anchorRect = await this.resolveAnchorRect(config.anchor)

  // The popover itself lives in the shadow DOM React tree.
  // We just write the config + rect into the store; PopoverLayer reads it.
  this.store.setPopover({ ...config, anchorRect })

  return () => this.store.setPopover(null)
}
```

The store-driven approach keeps the adapter free of React. PopoverLayer subscribes and renders.

---

## Phase 2 stubs

```ts
async simulateClick(spec): Promise<void> {
  if (!FEATURE_INTERACTIVE) throw new Error('simulate-click is gated in MVP')
  const target = await this.resolve(spec)
  target?.el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
}
```

`fillInput` will use `Input` events and respect React's controlled-input shenanigans (set the native value setter, then fire `input`). We're not solving that until Phase 2 forces us to.

---

## What the adapter does NOT do

- Render any DOM that's not the spotlight ring.
- Touch the engine state machine.
- Persist anything.
- Make network calls.

It is a pure mapping from "engine intent" → "host page effect", with cleanups. Easy to fake in tests.
