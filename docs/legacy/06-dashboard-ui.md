# 06 — Dashboard UI

The dashboard is a TanStack Start (React 19 + Vite) SPA at `apps/eregna/`.  
It is the **customer-facing control plane** — create agents, build knowledge trees, get embed codes.

---

## Screen map

```
/login                 Auth page (Google OAuth + email/password)
/dashboard             Agent list  ← landing after login
/dashboard/new         Create agent wizard
/dashboard/:agentId    Agent overview + embed code
/dashboard/:agentId/knowledge            Page tree root
/dashboard/:agentId/knowledge/:pageId    Page detail + element tree
/dashboard/:agentId/settings             Agent settings
```

---

## Route file structure

```
src/routes/
├── __root.tsx                          # Root layout — AppShell, providers
├── index.tsx                           # Marketing landing (public)
├── login.tsx                           # Auth page
├── auth.callback.tsx                   # OAuth redirect handler
└── dashboard/
    ├── index.tsx                       # Agent list
    ├── new.tsx                         # Create agent
    └── $agentId/
        ├── index.tsx                   # Agent overview
        ├── knowledge/
        │   ├── index.tsx               # Page tree view
        │   └── $pageId.tsx             # Page + element editor
        └── settings.tsx                # Agent settings
```

---

## AppShell layout (`__root.tsx`)

```
┌─────────────────────────────────────────────────────┐
│  Header (logo + user avatar + sign-out)             │
├──────────────┬──────────────────────────────────────┤
│              │                                      │
│   Sidebar    │   <Outlet />                         │
│  (nav items) │                                      │
│              │                                      │
└──────────────┴──────────────────────────────────────┘
```

```tsx
// routes/__root.tsx
export function RootComponent() {
  const { user, loading } = useAuth()
  return (
    <div className="app-shell">
      <Header />
      {user ? (
        <div className="app-body">
          <Sidebar />
          <main className="app-main">
            <Outlet />
          </main>
        </div>
      ) : (
        <main className="app-main--full">
          <Outlet />
        </main>
      )}
    </div>
  )
}
```

---

## Screen designs

### Agent list — `/dashboard`

```
┌─────────────────────────────────────────────────────┐
│  My Agents                          [+ New Agent]   │
├─────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐           │
│  │ Acme Docs Agent │  │ Support Bot     │           │
│  │ acme.com        │  │ help.acme.com   │           │
│  │ 12 pages        │  │ 4 pages         │           │
│  │ Active ●        │  │ Inactive ○      │           │
│  └─────────────────┘  └─────────────────┘           │
└─────────────────────────────────────────────────────┘
```

Data: `GET /v1/agents` — returns `{ data: Agent[] }`.

```tsx
// routes/dashboard/index.tsx
export function AgentListPage() {
  const { data: agents, isLoading } = useAgents()
  return (
    <div>
      <PageHeader title="My Agents">
        <Link to="/dashboard/new"><Button>+ New Agent</Button></Link>
      </PageHeader>
      {isLoading ? <Spinner /> : (
        <div className="agent-grid">
          {agents?.map(a => <AgentCard key={a.id} agent={a} />)}
        </div>
      )}
    </div>
  )
}
```

---

### Create agent wizard — `/dashboard/new`

Two-step form:

**Step 1 — Basics**
- Agent name (required)
- Website URL (required, validated)
- Description (optional)

**Step 2 — Configuration**
- Model selection (`gpt-4o-mini` default, `gpt-4o`, `claude-3-5-haiku`)
- System prompt (textarea, with placeholder)
- Preview embed code (shown after creation)

```tsx
// components/agents/AgentForm.tsx
const schema = z.object({
  name:        z.string().min(2).max(80),
  website_url: z.string().url(),
  description: z.string().max(500).optional(),
  model:       z.enum(['gpt-4o-mini', 'gpt-4o', 'claude-3-5-haiku']),
  system_prompt: z.string().max(2000).optional(),
})
```

On submit → `POST /v1/agents` → redirect to `/dashboard/:agentId/knowledge`.

---

### Agent overview — `/dashboard/:agentId`

```
┌─────────────────────────────────────────────────────┐
│  ← Agents    Acme Docs Agent    [Settings]          │
├──────────────┬──────────────────────────────────────┤
│  Knowledge   │  Embed Code                          │
│  Settings    │  ─────────────                       │
│              │  <script                             │
│              │    src="cdn.eregna.dev/..."          │
│              │    data-agent-id="acme-abc123"       │
│              │  ></script>                          │
│              │                [Copy]                │
│              │                                      │
│              │  Status: Active ●     [Deactivate]   │
└──────────────┴──────────────────────────────────────┘
```

---

### Knowledge page tree — `/dashboard/:agentId/knowledge`

```
┌─────────────────────────────────────────────────────┐
│  Knowledge Base — Acme Docs        [+ Add Page]     │
├─────────────────────────────────────────────────────┤
│  ▼ Home (/)                                  [+ ✎ ✕]│
│    ▼ Documentation (/docs/*)                 [+ ✎ ✕]│
│        API Reference (/docs/api)             [+ ✎ ✕]│
│        Getting Started (/docs/start)         [+ ✎ ✕]│
│    ▶ Blog (/blog/*)  (collapsed)             [+ ✎ ✕]│
└─────────────────────────────────────────────────────┘
```

- Data: `GET /v1/pages?agentId=:id` → flat list → client builds tree from `path` / `parent_id`.
- Click a page → navigates to `/dashboard/:agentId/knowledge/:pageId`.

**Tree build utility:**
```typescript
// lib/utils.ts
export function buildTree<T extends { id: string; parent_id: string | null }>(
  flat: T[]
): (T & { children: T[] })[] {
  const map = new Map(flat.map(n => [n.id, { ...n, children: [] as T[] }]))
  const roots: (T & { children: T[] })[] = []
  for (const node of map.values()) {
    if (node.parent_id) {
      map.get(node.parent_id)?.children.push(node as T)
    } else {
      roots.push(node as T & { children: T[] })
    }
  }
  return roots
}
```

---

### Page detail + element editor — `/dashboard/:agentId/knowledge/:pageId`

```
┌─────────────────────────────────────────────────────┐
│  ← Back    Page: API Reference (/docs/api)    [✎]   │
├──────────────────┬──────────────────────────────────┤
│  Elements        │  Element Detail                  │
│  ──────────      │  ──────────────                  │
│  ▼ Navbar        │  Label:    Navbar                │
│    Left Nav      │  DOM ID:   #main-navbar          │
│    Right Nav     │  Selector: nav.main              │
│  ▼ Hero          │  Description:                    │
│    CTA Button    │  [  The main navigation bar  ]   │
│  Footer     [+]  │  [  containing primary links ]   │
│                  │                     [Save]       │
└──────────────────┴──────────────────────────────────┘
```

- Left panel: `ElementTree` component — recursive, same `buildTree` utility.
- Right panel: `ElementForm` — edit label, DOM ID, selector, description.
- On description save → API re-generates embedding automatically.

---

## Data fetching — TanStack Query pattern

All data fetching uses **TanStack Query** (already included via `@tanstack/react-start`).

```typescript
// hooks/useAgents.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '#/lib/api'

export function useAgents() {
  return useQuery({
    queryKey: ['agents'],
    queryFn: () => api.get('/v1/agents').then(r => r.data),
  })
}

export function useCreateAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateAgentInput) => api.post('/v1/agents', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents'] }),
  })
}
```

---

## `lib/api.ts` — typed fetch wrapper

```typescript
// src/lib/api.ts
import { supabase } from './supabase.js'

const BASE = import.meta.env.VITE_EREGNA_API_URL

async function getAuthHeader(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Not authenticated')
  return `Bearer ${token}`
}

async function request<T>(method: string, path: string, body?: unknown): Promise<{ data: T }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: await getAuthHeader(),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
  return res.json()
}

export const api = {
  get:    <T>(path: string)                 => request<T>('GET', path),
  post:   <T>(path: string, body: unknown)  => request<T>('POST', path, body),
  patch:  <T>(path: string, body: unknown)  => request<T>('PATCH', path, body),
  delete: <T>(path: string)                 => request<T>('DELETE', path),
}
```

---

## Navigation & auth guard

TanStack Router `beforeLoad` is used to guard dashboard routes:

```typescript
// routes/dashboard/index.tsx
export const Route = createFileRoute('/dashboard/')({
  beforeLoad: async ({ context }) => {
    const { user } = context.auth
    if (!user) throw redirect({ to: '/login' })
  },
  component: AgentListPage,
})
```

The `auth` object is injected via router context — set up in `router.tsx`:

```typescript
export const router = createRouter({
  routeTree,
  context: { auth: undefined! },  // populated by AuthProvider
})
```

---

## Component conventions

| Component | Location | Responsibility |
|-----------|----------|----------------|
| `AppShell` | `components/layout/` | Top-level layout wrapper |
| `Sidebar` | `components/layout/` | Nav links, active states |
| `PageHeader` | `components/layout/` | Title + right-side actions |
| `AgentCard` | `components/agents/` | Single agent in grid |
| `AgentForm` | `components/agents/` | Create/edit form |
| `EmbedCodeSnippet` | `components/agents/` | Copy-to-clipboard embed code |
| `PageTree` | `components/knowledge/` | Recursive page nav tree |
| `ElementTree` | `components/knowledge/` | Recursive element nav tree |
| `ElementForm` | `components/knowledge/` | Element detail editor |
