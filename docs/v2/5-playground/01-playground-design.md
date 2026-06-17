# 5.1 — Playground Design

> A dashboard route (`/dashboard/$agentId/playground`) that is **itself a fake host site** with the
> real widget embedded, plus control panels to inject context and run any pipeline piece in
> isolation. It is simultaneously: your dev environment, the integration test suite, the customer's
> sandbox, and the place where context engineering becomes *visible*.
>
> The hardest interaction conditions each get a dedicated flow file with flowcharts in
> [`flows/`](./flows/00-overview.md): table read-tools, guided precondition recovery,
> awaited-vs-precalculated paths, and replay drift.

---

## 1. Layout

```
┌────────────────────────────────────────────┬──────────────────────────┐
│  STAGE — fake host page                    │  PANELS                  │
│  (real widget embedded, real engine        │  ┌ State    [JSON editor]│
│   touching this DOM)                       │  ├ Tools    [toggles]    │
│                                            │  ├ Knowledge[entries]    │
│  [hero] [tabs] [form] [table] [dialog btn] │  ├ Run      [subsystem]  │
│  …awkward components, see 02-…             │  └ Stream   [frame log]  │
└────────────────────────────────────────────┴──────────────────────────┘
```

- The stage components are registered as a **seeded knowledgebase** (a "Playground" page +
  components, created with the agent or on first visit) — so the agent genuinely knows them.
- The panels call the *same* `window.eregna` API a customer would (`setState`, `registerTool`,
  `addKnowledge`) — the playground exercises the public surface, not a backdoor. Dogfooding the
  embed API is half its value.

## 2. The panels

### State
JSON editor with presets (`free user`, `pro user`, `empty account`); apply → `eregna.setState`.
Shows the exact snapshot that would leave the page (post-`redactKeys`).

### Tools
Prebuilt specs with toggles, each configurable with **latency** (0/500/3000ms) and **failure**
(off / throw / timeout) injectors:
- `openPricingDialog` (fn) — the dialog-only component's only entrance
- `switchTab` (fn, `{tab: enum}`)
- `prefillForm` (fn, `{email}` — triggers the form's validation error on bad input)
- `fetchUsage` (api, same-origin mock endpoint)
A call log shows: when invoked, args received, result/error returned.

### Knowledge
Add/remove `addKnowledge` entries; presets ("promo fact", "contradicting fact" — to watch how the
model arbitrates page-vs-dashboard truth).

### Run
The subsystem isolator, mapping 1:1 to the debug endpoints (`3-server/02` §5):

| Mode | Calls | Shows |
|---|---|---|
| **Context** | `/debug/context` | composed AgentContext, every rendered prompt section, token count per block, truncation markers |
| **Plan** | `/debug/plan` | planner's exact prompt → raw output → parsed chapters + thought |
| **Steps** | `/debug/step` (pick chapter) | focused projection → prompt → steps; flags invalid keys/args caught by validation |
| **Narrate** | `/debug/narrate` (pick step) | prompt → body text |
| **Full run** | `/public/agent/run` (real surface) | the widget plays it on the stage, for real |

### Stream
Raw frame inspector for full runs: every NDJSON line (hello/patch/end), seq, ops, applied-document
diff viewer. Pause-and-step through frames — watch the document grow patch by patch. This panel is
where the streaming model (`3-server/05` §1) stops being abstract.

## 3. Why per-subsystem isolation matters (the learning argument)

A full agent run entangles five failure domains: context, planning, stepping, narration, playback.
When output is bad you need to *bisect*: was the context wrong (missing component description)?
the plan wrong (right context, bad chapters)? the steps wrong (right chapter, bad actions)? Only
isolation answers that in one move. This is the agent-engineering equivalent of unit vs. e2e
tests — and it's why the debug endpoints are MVP scope, not tooling gold-plating.

## 4. Implementation notes

- Owner-auth everything; debug endpoints live under `/v1` (JWT), full run via the public surface
  with `localhost`/dashboard origin allowed for the playground agent.
- The stage mounts the production widget bundle (not a storybook copy) — divergence between
  playground and reality is the one thing this tool must never have.
- Panels persist last-used config to `localStorage` per agent.
- Component-level visual states (popover variants, ticker animation, timeline hover/red states)
  get a separate lightweight **storybook-style gallery** route (`/playground/components`) — static
  fixtures, no API. The playground tests *behavior*; the gallery tests *looks*.
