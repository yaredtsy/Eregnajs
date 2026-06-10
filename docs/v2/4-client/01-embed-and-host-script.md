# 4.1 — Embed & Host Script API

> The customer-facing developer surface. v1's boot design (IIFE + buffered shim) is kept verbatim
> (`docs/mvp/08-embed-and-host-api.md` still applies); this file covers the v2 additions:
> `addKnowledge`, `api` tools, and configuration.

---

## 1. The snippet

```html
<script src="https://cdn.eregna.dev/embed.iife.js"
        data-agent-id="acme-abc"
        data-api-url="https://api.eregna.dev"   <!-- optional, default prod -->
></script>
```

Boot order (unchanged): synchronous shim install → shadow DOM mount → drain buffered calls →
ready. Host code may call `window.eregna.*` on the very next line after the script tag.

## 2. The full surface (v2)

```ts
interface EregnaApi {
  // context injection — all optional, all buffered pre-mount
  setState(patch: Record<string, unknown>): void
  registerTool(spec: ToolSpec): () => void              // fn or api kind (3-server/04 §2)
  addKnowledge(entry: { id?: string; title: string; content: string }): () => void   // NEW

  // control
  ask(query: string): Promise<void>
  open(): void; close(): void

  // lifecycle
  readonly ready: boolean
  onReady(cb: () => void): () => void

  // config (also settable via data- attributes)
  configure(opts: { redactKeys?: string[]; defaultPlayback?: "live" | "on-demand" }): void  // NEW
}
```

## 3. `addKnowledge` — the quick-fix channel

The dashboard knowledgebase is curated and slow-moving. `addKnowledge` is for facts only the page
knows at runtime, or gaps the customer wants to patch *now* without a dashboard round-trip:

```js
window.eregna.addKnowledge({
  title: "Current promotion",
  content: "Until June 30 the Pro plan is 20% off with code SUMMER.",
})
```

- Same shape as dashboard site facts; merged into the same prompt block, tagged
  `(source: page)` so model and debugger can tell origins apart.
- Returns an unregister fn (like `registerTool`) — SPAs can swap knowledge on route change.
- Capped: ≤20 entries, 32KB total (route re-enforces).
- Anti-goal: this is not a CMS. If a customer ships 50 entries here, the dashboard failed them —
  watch for it in run telemetry.

## 4. State, and what "state" means

`setState` describes *the current page situation* for the agent's benefit:

```js
window.eregna.setState({ user: { plan: "free" }, invoiceCount: 0, featureFlags: ["new-nav"] })
```

- Merge semantics (shallow), snapshot taken at each `ask()`.
- Use it for: plan/permission gating ("user can't see that menu"), empty states ("no invoices yet —
  the walkthrough should mention the empty list"), feature flags.
- `redactKeys` (config) drops matching keys before the snapshot leaves the page — the privacy
  valve from `3-server/06` §6.

## 5. SPA route changes

`pageUrl` is read at `ask()` time (`location.href`), so SPAs work without integration. Optional
nicety, deferred: `eregna.notifyNavigation()` to pre-warm page matching. Not MVP.

## 6. Versioning & failure posture

- The IIFE is versioned on the CDN (`embed.v2.iife.js`); `window.eregna.protocol = 2`.
- The widget must **never break the host page**: every public method wrapped in try/catch that
  logs `[eregna]`-prefixed warnings; if the API is unreachable, `ask()` rejects and the widget
  shows its own error bubble — no uncaught rejections escape into host console workflows.
- Unknown options/fields are ignored with a warning, never thrown — old snippets on new widgets
  and vice versa must coexist.
