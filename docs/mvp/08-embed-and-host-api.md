# 08 — Embed and Host API

> How the customer's page boots the widget and how the host page injects state and tools into the agent. The IIFE script installs `window.eregna` *synchronously* (before React mounts) so the host's inline scripts can call `registerTool` and `setState` immediately after the `<script>` tag.

Folders: `packages/widget/src/embed/`, `packages/widget/src/dev-main.ts`.

---

## 1. Boot sequence

```
1. Customer's HTML loads:
     <script src="https://cdn.eregna.dev/embed.iife.js" data-agent-id="acme-abc"></script>

2. IIFE runs:
     a. Reads data-agent-id, optional data-api-url from document.currentScript.
     b. Installs window.eregna with no-op-until-mounted shims (setState/registerTool
        record to a buffer; ask() throws a not-ready error).
     c. Creates the host element + shadow root + style + mount node (existing
        embed.tsx logic).
     d. Renders <WidgetRoot agentId apiUrl /> into the shadow.

3. WidgetRoot's effect runs on first commit:
     a. Drains the buffered setState / registerTool calls into the real stores.
     b. Swaps window.eregna's shims to the live implementations.
     c. Marks "ready" — ask() becomes callable.

4. From this point, the host can call window.eregna.* freely.
```

The pre-mount buffering means a host page that does

```html
<script src="...embed.iife.js" data-agent-id="acme-abc"></script>
<script>
  window.eregna.registerTool({ name: "openAccordion", ... })
  window.eregna.setState({ user: { plan: "pro" } })
</script>
```

works without race conditions — even if React's first paint hasn't happened yet, the calls are recorded and replayed.

---

## 2. Public surface

```ts
// packages/widget/src/embed/host-api.ts

export interface HostApi {
  setState(patch: Record<string, unknown>): void
  registerTool(spec: ToolSpec): () => void           // returns an unregister fn
  ask(query: string): Promise<void>
  open(): void
  close(): void
  readonly ready: boolean
  onReady(cb: () => void): () => void                // resolves on initial mount; subscribe for late callers
}

export interface ToolSpec {
  name: string                                       // unique per page
  description: string                                // shown to the LLM
  parameters: Record<string, JsonSchemaProp>         // tiny JSON-Schema subset
  run: (args: Record<string, unknown>) => unknown | Promise<unknown>
}

export type JsonSchemaProp =
  | { type: "string"; description?: string; enum?: string[] }
  | { type: "number"; description?: string }
  | { type: "boolean"; description?: string }
  | { type: "object"; description?: string; properties?: Record<string, JsonSchemaProp>; required?: string[] }
```

`window.eregna: HostApi`. Stable surface; we promise to not break it without a major version bump.

`run()` stays on the client — it's a closure over the host's own page state. The server never sees the function, only `name`, `description`, `parameters` (`02-context.md` §3.5).

---

## 3. `installGlobal.ts` — the pre-mount installer

```ts
// packages/widget/src/embed/installGlobal.ts

interface BufferedCall {
  kind: "setState" | "registerTool"
  payload: unknown
}

export function installGlobalShim(): { drain(real: HostApi): void } {
  const buffer: BufferedCall[] = []
  const readyCbs: Array<() => void> = []
  let realApi: HostApi | null = null

  const stub: HostApi = {
    setState(patch)    { realApi ? realApi.setState(patch)    : buffer.push({ kind: "setState",    payload: patch }) },
    registerTool(spec) {
      if (realApi) return realApi.registerTool(spec)
      buffer.push({ kind: "registerTool", payload: spec })
      return () => { /* will be re-registered on drain; unregister is harmless before */ }
    },
    async ask(query) {
      if (!realApi) throw new Error("[Eregna] widget is not ready yet; await window.eregna.onReady(...)")
      return realApi.ask(query)
    },
    open()  { realApi?.open() },
    close() { realApi?.close() },
    get ready() { return realApi !== null },
    onReady(cb) {
      if (realApi) { cb(); return () => {} }
      readyCbs.push(cb)
      return () => { const i = readyCbs.indexOf(cb); if (i !== -1) readyCbs.splice(i, 1) }
    },
  }

  ;(window as any).eregna = stub

  return {
    drain(real) {
      realApi = real
      for (const c of buffer) {
        if (c.kind === "setState")    real.setState(c.payload as Record<string, unknown>)
        if (c.kind === "registerTool") real.registerTool(c.payload as ToolSpec)
      }
      buffer.length = 0
      readyCbs.splice(0).forEach(cb => { try { cb() } catch {} })
    }
  }
}
```

The IIFE calls `installGlobalShim()` *before* `createRoot` so the stub is live the instant the script tag is parsed.

---

## 4. The two in-memory stores

```
packages/widget/src/embed/hostState.ts
packages/widget/src/embed/hostTools.ts
```

Both are simple synchronous singletons. No React context, no reactivity — `ask()` reads them once at request time.

### 4.1 `hostState.ts`

```ts
type HostState = Record<string, unknown>

let state: HostState = {}
const subs: Array<() => void> = []

export const hostState = {
  set(patch: HostState) { state = { ...state, ...patch }; subs.forEach(fn => { try { fn() } catch {} }) },
  get(): HostState { return state },
  subscribe(fn: () => void) { subs.push(fn); return () => { const i = subs.indexOf(fn); if (i !== -1) subs.splice(i, 1) } },
  clear() { state = {} },
}
```

Subscription is for dev tooling and potential dashboard "preview state" UI. The agent doesn't subscribe — it snapshots `get()` at `ask()` time.

### 4.2 `hostTools.ts`

```ts
import type { ToolSpec } from "./host-api"

const registered = new Map<string, ToolSpec>()

export const hostTools = {
  register(spec: ToolSpec): () => void {
    if (registered.has(spec.name)) console.warn(`[Eregna] tool "${spec.name}" already registered; overwriting`)
    registered.set(spec.name, spec)
    return () => { registered.delete(spec.name) }
  },
  unregister(name: string) { registered.delete(name) },
  list(): ToolSpec[] { return [...registered.values()] },
  /** What the server sees: name/description/parameters only, no run(). */
  serializableList(): { name: string; description: string; parameters: ToolSpec["parameters"] }[] {
    return this.list().map(({ run: _, ...rest }) => rest)
  },
  async dispatch(name: string, args: Record<string, unknown>): Promise<{ ok: true; result: unknown } | { ok: false; reason: string }> {
    const spec = registered.get(name)
    if (!spec) return { ok: false, reason: `tool "${name}" not registered` }
    try {
      const result = await spec.run(args)
      return { ok: true, result }
    } catch (err) {
      return { ok: false, reason: errMessage(err) }
    }
  },
}
```

The engine (`07-engine.md`) calls `hostTools.dispatch` from `actions/callTool.ts`. The `ask()` flow calls `hostTools.serializableList()` to fill the request body.

---

## 5. The real `HostApi` implementation

```ts
// packages/widget/src/embed/host-api.impl.ts

import { hostState } from "./hostState"
import { hostTools } from "./hostTools"
import { runStream } from "../agent/runStream"

export function createHostApi(opts: { agentId: string; apiUrl: string; dispatch: Dispatch }): HostApi {
  return {
    setState(patch) { hostState.set(patch) },
    registerTool(spec) { return hostTools.register(spec) },
    async ask(query) {
      opts.dispatch({ type: "SET_PLAY_MODE", playMode: "live" })
      opts.dispatch({ type: "APPEND_USER_MESSAGE", text: query })          // optimistic local echo

      await runStream({
        url: `${opts.apiUrl}/v1/agent/run`,
        body: {
          publicId:  opts.agentId,
          query,
          pageUrl:   location.href,
          hostState: hostState.get(),
          hostTools: hostTools.serializableList(),
        },
        dispatch: opts.dispatch,
      })
    },
    open()  { opts.dispatch({ type: "SET_MODE", mode: "bubble" }) },
    close() { opts.dispatch({ type: "SET_MODE", mode: "closed" }) },
    ready: true,
    onReady(cb) { cb(); return () => {} },
  }
}
```

`createHostApi` runs inside `WidgetRoot`'s first effect; it has the `dispatch` from the store. The IIFE then calls `shim.drain(realApi)` to replay buffered calls and flip the global.

---

## 6. Updated `embed.tsx` flow

The shipped `embed.tsx` exports `initWidget`. We extend it:

```ts
// packages/widget/src/embed.tsx (extended)
import { installGlobalShim } from "./embed/installGlobal"

export type InitWidgetOptions = {
  container?: HTMLElement
  agentId?:   string                                    // optional for the dev playground; required for prod
  apiUrl?:    string
}

export function initWidget(options: InitWidgetOptions = {}): InitWidgetResult {
  const shim = installGlobalShim()                       // synchronous, before React

  // ... existing host/shadow/style/mount creation ...

  let onMount!: (api: HostApi) => void
  const mountedApi = new Promise<HostApi>(r => { onMount = r })

  root = createRoot(mount)
  root.render(
    <StrictMode>
      <WidgetRoot
        agentId={options.agentId}
        apiUrl={options.apiUrl ?? defaultApiUrl()}
        onReady={(api) => { shim.drain(api); onMount(api) }}
      />
    </StrictMode>,
  )

  return { unmount, shadowRoot: shadow, ready: mountedApi }
}
```

`mountedApi` is exposed on the result so tests can `await widget.ready` instead of polling `window.eregna.ready`.

---

## 7. The auto-boot entrypoint

```ts
// packages/widget/src/embed-auto.ts
import { initWidget } from "./embed"

const el = document.currentScript as HTMLScriptElement | null
const agentId = el?.dataset.agentId
const apiUrl  = el?.dataset.apiUrl

if (agentId) initWidget({ agentId, apiUrl })
else console.warn("[Eregna] data-agent-id missing on <script> tag")
```

Vite's IIFE build entry. Produces `dist/embed.iife.js`.

---

## 8. Failure modes (embed side)

| Failure                                       | Behaviour                                                                                  |
|-----------------------------------------------|--------------------------------------------------------------------------------------------|
| `data-agent-id` missing                       | Console warn; no mount; `window.eregna` still installed as a shim (its `ask` errors).      |
| Agent inactive or 404                         | First `ask()` call returns the 404 surfaced in the chat as an error message; widget stays mounted. |
| `registerTool` with a colliding built-in name | Server renames it to `host_<name>` (`02-context.md` §3.5 & `06-patcher-and-wire.md`'s helpers ignore the rename). Client console warn. |
| `setState(patch)` with non-serializable values | Sent as-is; server may fail to JSON-stringify. Document: stick to JSON-serializable values. |
| Host calls `ask()` before mount               | Shim's `ask()` throws a clear error. Use `await window.eregna.onReady(...)` first.         |
| Multiple `<script>` tags on the same page     | Only the first one's `initWidget` succeeds; subsequent shims throw a "already initialised" warning. |

---

## 9. The dev playground

```
packages/widget/src/dev-main.ts
```

Existing. Calls `initWidget({})` against an empty page. We extend the harness to mount a small "host page" UI in the iframe so we can test `registerTool`, `setState`, `ask`, and visually verify spotlight + popover against real DOM elements.

```ts
// dev-main.ts (extended)
import { initWidget } from "./embed"

const widget = initWidget({ agentId: "dev-agent", apiUrl: "http://localhost:3001" })

document.getElementById("ask-btn")?.addEventListener("click", () => {
  window.eregna.ask((document.getElementById("ask-input") as HTMLInputElement).value)
})

document.getElementById("register-accordion")?.addEventListener("click", () => {
  window.eregna.registerTool({
    name: "openAccordion",
    description: "Opens the FAQ accordion by id",
    parameters: { id: { type: "string", description: "Accordion section id" } },
    run: ({ id }) => document.querySelector(`#${id}`)?.dispatchEvent(new Event("toggle")),
  })
})
```

We also ship a tiny static `dev-host.html` with a mocked agent (`/v1/agent/run` returns hand-canned NDJSON frames) for offline UI iteration.

---

## 10. CDN delivery (Phase 2, mentioned here for the seam)

Production: `dist/embed.iife.js` is uploaded to a CDN keyed by version. The customer's `<script>` tag uses an unpinned `latest` for first integration and switches to a pinned version once stable. MVP: serve from the API host (`apps/api`'s static directory) — no CDN setup needed.

---

## 11. Module file list

```
packages/widget/src/embed/
├── installGlobal.ts
├── host-api.ts                      # public types only
├── host-api.impl.ts                 # createHostApi (called from WidgetRoot)
├── hostState.ts
└── hostTools.ts

packages/widget/src/
├── embed.tsx                        # extended (existing file)
└── embed-auto.ts                    # new — IIFE auto-boot entry
```

`installGlobal.ts` ~60 LOC. `host-api.impl.ts` ~40 LOC. `hostState.ts` ~25 LOC. `hostTools.ts` ~40 LOC. `embed-auto.ts` ~10 LOC.

---

## 12. References

- `02-context.md` — what the server receives in `body.hostState` / `body.hostTools`.
- `05-subagents.md` — how the planner sees host tools via the prompt section.
- `07-engine.md` — `callTool` action handler that invokes `hostTools.dispatch`.
- The shipped `packages/widget/src/embed.tsx` — the file we extend; existing behaviour preserved.
