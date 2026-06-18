# Docs v2 — Embeddable Walkthrough Agent

> v2 of the plan. v1 lives in `docs/mvp/` and is partially built in `apps/api/src/services/agent/`.
> v2 starts from an honest review of what v1 got right and wrong, then redesigns the parts that
> need it and adds what's new: the knowledgebase model, the walkthrough player UX, the playground,
> and a public-embed auth model that actually works.

This doc tree is also a **learning curriculum**. The product is the vehicle; the skills are
**agent building**, **context engineering**, and **dynamic tool orchestration**. Server docs carry
a "What you're learning" box tying the concrete design back to the general skill.

---

## How this tree is organized (dendrogram)

Top = most abstract. Each level down gets more specific. Read a level fully before descending —
every file assumes its ancestors, never its siblings.

```
Level 0  README (you are here) ──────────────────────────── the map
            │
Level 1  0-review/ ─────────────────────── what exists, good, bad, direction
            │
Level 2  1-product/ ────────────────────── vision, concepts, MVP scope
            │
Level 3  2-system/ ─────────────────────── architecture, contracts, scaling seams
            │
Level 4  ├── 3-server/ ─────────────────── context, orchestration, subagents,
            │                               tools, streaming, persistence+auth
            ├── 4-client/ ─────────────────  embed script, player UX, engine,
            │                                knowledge capture
            └── 5-playground/ ───────────── test harness + scenario matrix
            │
Level 5  ├── 6-roadmap/ ────────────────────── build order + learning map
            └── 7-guide-agent/ ──────────── dev guide agent for /dashboard (stream + UI test)
```

## Reading order

| Folder | Files | Answers |
|---|---|---|
| `0-review/` | what-exists, the-good, the-bad, direction | "Where am I, what do I keep, what do I fix?" |
| `1-product/` | vision, concepts, mvp-scope | "What am I building and for whom?" |
| `2-system/` | architecture, contracts, scaling-seams | "How do the pieces talk? What shapes are sacred?" |
| `3-server/` | context-engineering, orchestration, subagents, dynamic-tools, streaming, persistence-and-auth | "How does the agent think, and how do I make it swappable?" |
| `4-client/` | embed-and-host-script, walkthrough-player, engine-and-recovery, knowledge-capture | "How does it look, play, and recover on a stranger's page?" |
| `5-playground/` | playground-design, test-scenarios | "How do I test each piece in isolation?" |
| `6-roadmap/` | build-order, learning-map | "What do I build next week, and what does it teach me?" |
| `7-guide-agent/` | overview → components → prompts → seed → wiring → how-to-test | "How do I dogfood stream + animation on `/dashboard`?" |

## Conventions

- One domain per file; files stay under ~150 lines. If a file grows, it becomes a folder.
- Decisions are stated with their *reason* and their *escape hatch* (what changes if reversed).
- Code references use real paths (`apps/api/src/services/agent/...`) so docs and code can be diffed.
- v1 docs are **not** deleted; where v2 overrides v1, the v2 file says so explicitly.

## The product in one paragraph

A customer signs up, creates an **agent**, and builds a **knowledgebase** describing their website:
pages, components, and selector queries — plus optional extras injected at runtime from their own
site via a script tag (live **state**, callable **tools**, extra **knowledge**). They drop one
`<script>` with their agent's public id on their site. Visitors ask questions; the agent plans a
**walkthrough** and streams it; the widget plays it as guided steps — spotlight, popover,
YouTube-style chapter timeline, a detached input bar with a live "thinking" ticker. A
**playground** in the dashboard lets the customer (and us) test state, tools, knowledge, and the
player against deliberately awkward components before touching a real site.
