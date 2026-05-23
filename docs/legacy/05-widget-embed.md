# 05 — Widget Embed

The widget is the customer-facing half of Eregna.
It renders a floating chat bubble on the host site, isolated from host CSS/JS via Shadow DOM.

---

## Integration (host site)

```html
<script
  src="https://cdn.eregna.dev/widget/latest/embed.iife.js"
  data-agent-id="acme-abc123"
  async defer
></script>
```

One script tag. No framework dependency on the host page.

---

## Boot sequence

1. IIFE loads → reads `data-agent-id` from its own `<script>` tag.
2. Creates `<div id="eregna-widget-host">` appended to `document.body`.
3. Attaches **Shadow DOM** (`mode: 'open'`) to that element.
4. Injects `widget.css` as an inline `<style>` inside the shadow root.
5. Mounts the React tree inside the shadow root.

```
document.body
└── <div id="eregna-widget-host">  (position:fixed, bottom:0, right:0, z-index:max)
    └── #shadow-root
        ├── <style>…widget.css…</style>
        └── <div class="eregna-widget-mount">
            └── <WidgetRoot agentId="acme-abc123" />
```

---

## Build outputs

Vite produces two artifacts from `packages/widget`:

| File | Format | Used by |
|------|--------|---------|
| `dist/embed.iife.js` | IIFE | `<script src="...">` on host sites |
| `dist/index.js` + `.d.ts` | ESM library | Dashboard `initWidget()` call |

---

## `embed-auto.ts` — IIFE entry

```typescript
import { initWidget } from './embed.js'

const scriptEl = document.currentScript as HTMLScriptElement | null
const agentId = scriptEl?.dataset.agentId

if (agentId) {
  initWidget({ agentId })
} else {
  console.warn('[Eregna] data-agent-id missing on script tag.')
}
```

---

## `initWidget` API

```typescript
export type InitWidgetOptions = {
  agentId:    string          // agent public_id — required
  container?: HTMLElement     // custom mount point (optional)
  apiUrl?:    string          // override API base URL
}

export type InitWidgetResult = {
  unmount:    () => void
  shadowRoot: ShadowRoot
}

export function initWidget(options: InitWidgetOptions): InitWidgetResult { ... }
```

---

## Component tree

```
Widget.tsx          <WidgetRoot agentId />
  ChatPanel.tsx       slide-up dialog
    MessageList.tsx   scrollable message feed
    InputBar.tsx      textarea + send button
  FloatButton.tsx     fixed-position trigger button
hooks/
  useChat.ts          SSE consumer + JSON-Patch state machine
```

---

## `useChat` hook — SSE + JSON-Patch

Widget state shape:
```typescript
type ChatState = {
  conversationId: string | null
  messages: { id: string; role: 'user'|'assistant'; content: string }[]
  status: 'idle' | 'thinking' | 'streaming' | 'done' | 'error'
}
```

Each SSE `data:` line is a JSON-Patch array applied to this state with `fast-json-patch`.

```typescript
import { useReducer, useCallback } from 'react'
import { applyPatch } from 'fast-json-patch'

function reducer(state: ChatState, ops: object[]): ChatState {
  return applyPatch(state, ops, false, false).newDocument as ChatState
}

export function useChat(agentId: string, apiUrl: string) {
  const [state, dispatch] = useReducer(reducer, initialState)

  const sendMessage = useCallback(async (text: string) => {
    // optimistic user message
    dispatch([{ op: 'add', path: '/messages/-',
      value: { id: crypto.randomUUID(), role: 'user', content: text } }])

    const res = await fetch(`${apiUrl}/v1/chat/${agentId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ conversation_id: state.conversationId,
        message: text, page_url: window.location.href }),
    })

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buf = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const raw = line.slice(6).trim()
          if (raw && raw !== '{}') dispatch(JSON.parse(raw))
        }
      }
    }
  }, [agentId, apiUrl, state.conversationId])

  return { state, sendMessage }
}
```

---

## Widget CSS tokens

```css
:host {
  --eregna-primary: #6366f1;
  --eregna-bg: #18181b;
  --eregna-fg: #f4f4f5;
  --eregna-border: #3f3f46;
  --eregna-radius: 16px;
  --eregna-shadow: 0 8px 32px rgba(0,0,0,.4);
}
```

Host sites can override tokens in Phase 2 via `data-theme='{"--eregna-primary":"#0ea5e9"}'`.

---

## Security

| Risk | Mitigation |
|------|-----------|
| XSS | Render content as text nodes, never `innerHTML` |
| CSS bleed | Shadow DOM |
| CORS | API restricts `/v1/chat/*` to allowlist |
| `public_id` leak | Designed to be public — no secrets in it |

---

## CDN strategy

- Versioned: `cdn.eregna.dev/widget/v1.0.0/embed.iife.js` — `Cache-Control: immutable`
- Latest alias: `cdn.eregna.dev/widget/latest/embed.iife.js` — TTL 5 min
