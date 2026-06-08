# 02 — Context Engineering

> Everything the agent knows comes from **four sources**: DB rows for the agent/page/elements, host-injected state, host-injected tools, and prior conversation messages. Nothing else. This doc defines the `ContextProvider` interface, the providers themselves, and how chapter-scoped contexts are derived from them for the per-chapter prompt.

Folder: `apps/api/src/services/agent/context/`

---

## 1. The hard rule

> The agent **never** fetches the host's HTML, never scrapes, never queries third-party APIs, never reads cookies. If something needs to be visible, it lives in one of the four sources below.

| Source                 | Who supplies it                                       | When                                  |
|------------------------|-------------------------------------------------------|---------------------------------------|
| DB: agent row          | Dashboard registration                                | At run start, read by `dbAgent`       |
| DB: page row           | Dashboard, picked by `pageUrl`                        | At run start, read by `dbPage`        |
| DB: element tree       | Dashboard, full tree of the picked page               | At run start, read by `dbElements`    |
| `hostState`            | Host page, via `window.eregna.setState`               | At each `ask()` call, in request body |
| `hostTools`            | Host page, via `window.eregna.registerTool` (name + description + parameters only — `run()` stays on the client) | At each `ask()` call, in request body |
| Conversation history   | Prior messages of the same `Conversation`             | At run start, from store/DB           |

This is the **closed set**. If a future feature needs to "search the docs" or "look at recent visitor activity", it adds a new `ContextProvider` — never a new direct lookup buried in a workflow node.

---

## 2. Shapes

```ts
// apps/api/src/services/agent/context/types.ts

export interface AgentContext {
  agent:               AgentInfo            // dbAgent provider
  page:                PageInfo             // dbPage provider
  elements:            ElementNode[]        // dbElements provider (hierarchical)
  elementById:         Map<string, ElementNode>  // derived index, see §3.5
  hostState:           Record<string, unknown>   // hostState provider
  hostTools:           HostToolSpec[]            // hostTools provider
  conversationHistory: BaseMessage[]             // conversationHistory provider
}

export interface AgentInfo {
  id: string
  name: string
  systemPrompt: string | null
  model: string
}

export interface PageInfo {
  id: string
  title: string
  urlPattern: string
  description: string
}

export interface ElementNode {
  id: string                  // = elements.dom_id (the literal DOM id attribute)
  label: string
  description: string | null
  notes: string | null
  parentId: string | null
  children: ElementNode[]
  path: string                // breadcrumb e.g. "header > nav > billing-link"
}

export interface HostToolSpec {
  name: string
  description: string
  parameters: Record<string, JsonSchemaProp>
}

export type JsonSchemaProp =
  | { type: "string"; description?: string; enum?: string[] }
  | { type: "number"; description?: string }
  | { type: "boolean"; description?: string }
  | { type: "object"; description?: string; properties?: Record<string, JsonSchemaProp>; required?: string[] }
```

Note `elementById` — a derived flat index, populated once in `compose.ts`. Per-chapter focusing (§4) needs O(1) lookup.

---

## 3. Provider interface

```ts
// apps/api/src/services/agent/context/types.ts

export interface ContextProvider<K extends keyof AgentContext> {
  key: K
  load(opts: RunOpts, deps: ProviderDeps): Promise<AgentContext[K]>
}

export interface RunOpts {
  publicId:   string
  query:      string
  pageUrl:    string
  hostState:  Record<string, unknown>
  hostTools:  HostToolSpec[]
  conversationId?: string
  visitorId?: string
}

export interface ProviderDeps {
  db:    SupabaseClient<Database>
  logger: Logger
}
```

One file per provider, all in `context/providers/`. Each provider is **pure** (no shared mutable state) and **independent** (does not call other providers). `compose.ts` is the only place that knows about the full set.

### 3.1 `dbAgent.ts`

```ts
export const dbAgent: ContextProvider<"agent"> = {
  key: "agent",
  async load(opts, { db }) {
    const { data } = await db.from("agents")
      .select("id, name, system_prompt, model")
      .eq("public_id", opts.publicId)
      .single()
    if (!data) throw new Error(`Agent ${opts.publicId} not found`)
    return {
      id: data.id,
      name: data.name,
      systemPrompt: data.system_prompt,
      model: data.model,
    }
  }
}
```

### 3.2 `dbPage.ts`

Picks the page whose `url_pattern` matches `opts.pageUrl`. If none match, picks the first page of the agent and logs a warning (so a misconfigured site still works for demo).

```ts
export const dbPage: ContextProvider<"page"> = {
  key: "page",
  async load(opts, { db, logger }) {
    const { data: pages } = await db.from("pages")
      .select("id, title, url_pattern, description, agent_id, sort_order")
      .eq("agent_id", await resolveAgentId(opts.publicId, db))
      .order("sort_order", { ascending: true })

    const matched = pages?.find(p => matchUrl(p.url_pattern, opts.pageUrl))
    const picked = matched ?? pages?.[0]
    if (!matched && picked) logger.warn(`no page matched ${opts.pageUrl}; using ${picked.id}`)
    if (!picked) throw new Error(`agent has no pages`)
    return { id: picked.id, title: picked.title, urlPattern: picked.url_pattern, description: picked.description ?? "" }
  }
}
```

`matchUrl(pattern, url)` — supports `*` wildcards and `:param` placeholders. Tiny helper in `context/util/matchUrl.ts`; one file, one job.

### 3.3 `dbElements.ts`

Loads the full element tree of the picked page, builds the hierarchical structure + breadcrumb paths.

```ts
export const dbElements: ContextProvider<"elements"> = {
  key: "elements",
  async load(opts, { db }) {
    const pageId = await resolvePickedPageId(opts, db)
    const { data: rows } = await db.from("elements")
      .select("id, dom_id, label, description, notes, parent_id, sort_order")
      .eq("page_id", pageId)
      .order("sort_order", { ascending: true })

    return buildTree(rows ?? [])
  }
}
```

`buildTree` is in `context/util/buildTree.ts`. Returns roots (parent_id = null) with children attached and breadcrumb `path` filled in.

**Element id used in the agent's output = `elements.dom_id`** (the literal DOM `id` attribute). The DB `id` (UUID) is *not* what the LLM sees; the agent emits `dom_id` strings and the engine resolves them with `document.getElementById`.

### 3.4 `hostState.ts`

```ts
export const hostState: ContextProvider<"hostState"> = {
  key: "hostState",
  async load(opts) { return opts.hostState ?? {} }
}
```

Verbatim pass-through. We do **not** transform, schema-validate, or filter. The host owns this surface.

### 3.5 `hostTools.ts`

```ts
export const hostTools: ContextProvider<"hostTools"> = {
  key: "hostTools",
  async load(opts) {
    // strip anything beyond the documented shape
    return (opts.hostTools ?? []).map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }))
  }
}
```

The `run()` function never enters this object — it's stripped at the request boundary (Zod schema in the route rejects extra props). The server only knows the tool *exists*.

### 3.6 `conversationHistory.ts`

MVP: returns `[]`. Wired up so the seam exists; the actual lookup lands when sessions persist across `ask()` calls.

```ts
export const conversationHistory: ContextProvider<"conversationHistory"> = {
  key: "conversationHistory",
  async load(opts, { db }) {
    if (!opts.conversationId) return []
    // Phase 2: read prior agent_runs.state_snapshot, convert to BaseMessage[]
    return []
  }
}
```

### 3.7 Index derivation

After all providers return, `compose.ts` populates `elementById`:

```ts
function indexElements(roots: ElementNode[]): Map<string, ElementNode> {
  const ix = new Map<string, ElementNode>()
  const walk = (n: ElementNode) => { ix.set(n.id, n); n.children.forEach(walk) }
  roots.forEach(walk)
  return ix
}
```

---

## 4. Per-chapter focused context

This is the bit `chapter.elementId` enables. The per-chapter prompt (`03-prompts.md`) doesn't see the whole tree — it sees one focused projection:

```ts
// apps/api/src/services/agent/context/focusChapter.ts

export interface ChapterContext {
  chapter:  WalkthroughChapter
  target:   ElementNode               // resolved from ctx.elementById.get(chapter.elementId)
  parents:  ElementNode[]             // chain root → ... → target.parent
  siblings: ElementNode[]             // target.parent?.children except target
  notes:    string | null             // pulled from target for prompt convenience
}

export function focusChapter(ctx: AgentContext, chapter: WalkthroughChapter): ChapterContext {
  const target = ctx.elementById.get(chapter.elementId)
  if (!target) throw new ChapterTargetMissing(chapter.elementId)
  return {
    chapter,
    target,
    parents:  collectParents(target, ctx.elementById),
    siblings: collectSiblings(target),
    notes:    target.notes,
  }
}
```

The `streamChapter` node calls `focusChapter` once per chapter, then `chapterPrompt(ctxFocused)` builds the prompt block in `03-prompts.md`. **The full element tree is not in the per-chapter prompt** — only the target, parents (breadcrumb), and siblings. Tight, scoped, predictable token cost.

If the target isn't in the tree (the planner hallucinated an elementId), `ChapterTargetMissing` is caught by the workflow router and the chapter is marked `skipped` (mechanism in `04-workflow.md`).

---

## 5. Composition

```ts
// apps/api/src/services/agent/context/compose.ts

const PROVIDERS = [
  dbAgent,
  dbPage,
  dbElements,
  hostState,
  hostTools,
  conversationHistory,
] as const

export async function composeContext(opts: RunOpts, deps: ProviderDeps): Promise<AgentContext> {
  const results = await Promise.all(PROVIDERS.map(p => p.load(opts, deps).then(v => [p.key, v] as const)))
  const ctx = Object.fromEntries(results) as Omit<AgentContext, "elementById">
  return { ...ctx, elementById: indexElements(ctx.elements) }
}
```

Providers run in parallel because they don't depend on each other. The only ordering dependency is `elementById` derivation, which happens after.

To **add a new provider** (e.g., `recentVisitorActivity`): write one file, append to the `PROVIDERS` tuple, add the field to `AgentContext`. No other change.

---

## 6. Sizing (Phase 1 budgets)

| Provider              | Typical size  | Token cost in prompt | Notes                                                    |
|-----------------------|---------------|----------------------|----------------------------------------------------------|
| `agent` row           | ~100 bytes    | ~50 tokens           | name + customer overlay                                  |
| `page` row            | ~200 bytes    | ~80 tokens           | title + description                                      |
| `elements` tree       | ≤ 50 nodes    | ~1.5k tokens         | depth-indented; per-element ~30 tokens                   |
| `hostState`           | varies        | varies (warn at 1k)  | the host can dump a lot; cap at 4k tokens, truncate end  |
| `hostTools`           | typical ~3    | ~50 tokens each      |                                                          |
| `conversationHistory` | MVP empty     | 0                    | grows in Phase 2                                         |

Total under 3k input tokens for a typical query → cheap.

`hostState` is the only unbounded one and is **truncated** in the prompt-section formatter (`03-prompts.md` `hostStateBlock.ts`), with a `…truncated` marker. Truncation happens at the prompt layer, never inside the context — `AgentContext` stays the source of truth.

---

## 7. Failure modes

| Failure                                            | Behaviour                                                       |
|----------------------------------------------------|-----------------------------------------------------------------|
| Agent `public_id` not found                        | Route returns 404 before workflow runs.                         |
| No pages registered for agent                      | Route returns 422 with a clear message.                         |
| `pageUrl` doesn't match any `url_pattern`          | First page is picked + warning logged. Run continues.           |
| Element tree empty                                 | Run still proceeds; planner will likely produce an apology message and skip the walkthrough. No crash.|
| `hostTools[N].name` collides with a built-in tool  | Host tool is renamed `host_<name>` in the registry (see `05-tools.md`). |
| `hostState` exceeds 4k tokens                      | Truncated in the prompt section; full value still in `AgentContext`. |
| Provider throws                                    | Run errors with status `error`, message includes provider name. |

---

## 8. Module file list

```
context/
├── types.ts                # AgentContext, RunOpts, ProviderDeps, ContextProvider, ElementNode, ChapterContext
├── compose.ts              # PROVIDERS tuple + composeContext + indexElements
├── focusChapter.ts         # ChapterContext builder for per-chapter prompts
├── providers/
│   ├── dbAgent.ts
│   ├── dbPage.ts
│   ├── dbElements.ts
│   ├── hostState.ts
│   ├── hostTools.ts
│   └── conversationHistory.ts
├── util/
│   ├── matchUrl.ts
│   └── buildTree.ts
└── index.ts                # public re-exports
```

Each provider file is < ~30 LOC. `compose.ts` and `focusChapter.ts` are each < ~60 LOC. `buildTree.ts` and `matchUrl.ts` are < ~40 LOC.

---

## 9. References

- `01-conversation-shape.md` — types `AgentContext` references (`WalkthroughChapter` etc).
- `03-prompts.md` — consumers of `AgentContext` and `ChapterContext`.
- `04-workflow.md` — `enrich` node calls `composeContext`; `streamChapter` calls `focusChapter`.
- `08-embed-and-host-api.md` — `hostState` / `hostTools` shape on the wire matches `HostApi`.
