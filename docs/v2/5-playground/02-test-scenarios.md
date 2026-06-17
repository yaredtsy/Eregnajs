# 5.2 — Test Scenarios

> The stage's components are chosen adversarially: each one exists to force a specific condition
> in the engine, the player, the tools, or the prompts. This matrix is the de-facto integration
> test plan — when all rows behave, MVP is done (it includes `1-product/03`'s acceptance demo).

---

## 1. Stage components (the fake host page)

| Component | Registered as | Hostile property | Exercises |
|---|---|---|---|
| Hero section | `home.hero` | none (control) | happy path: scroll, highlight, narrate |
| Orders table | `orders.table` | answers live inside the component | read-tools (`table_summary`, `table_sum_column`) → result cards; hostState as the pre-calculated alternative ([flow 01](./flows/01-table-tools.md)) |
| Export button | `orders.export-btn` | disabled until a row is selected; tool throws `{code, hint}` | guided precondition recovery, planned vs reactive ([flow 02](./flows/02-guided-recovery.md)) |
| Long-scroll section | `home.details` | 3 viewports down | scroll-into-view + settle |
| Tabs (3 tabs) | `tabs.panel-b` | content hidden until tab active | `isUsable` check, `switchTab` tool → reveal, retry ladder |
| Dialog | `dialog.upgrade-cta` | only exists after `openPricingDialog` tool runs | tool → MutationObserver branch of the ladder |
| Form + validation | `form.email-input`, `form.submit` | error state on bad input | `prefillForm` tool args, error-state narration, `wait-for-click` |
| Async usage table | `usage.table` | loads 2s after mount | late-mount branch of the ladder |
| Vanishing banner | `promo.banner` | removes itself after 5s | **not-found path**: message + red segment + continue |
| Ghost component | `ghost.button` | registered in KB, never rendered | not-found on a never-existing key |
| Twin buttons | `twins.action` | css selector matches 2 nodes | ambiguity handling + telemetry |
| No-id card | `card.css-only` | no dom id; css+text selectors only | selector strategy order |

## 2. Condition matrix

### Engine / player
| # | Scenario | Expected |
|---|---|---|
| E1 | happy 3-chapter run, live | segments grow → fill; ticker thoughts; popovers stream; complete |
| E2 | same run, play-on-demand | buffer; "Ready ▶"; typewriter playback; seekable |
| E3 | replay from dashboard | identical to E2 from snapshot |
| E3b | replay on a drifted page | chapter-1 pre-flight fails → drift dialog: regenerate (plain `ask()`) or stop ([flow 04](./flows/04-replay-drift.md)) |
| E4 | vanishing banner targeted | notice card, step red slice, auto-continue 2.5s |
| E5 | ghost component chapter | whole chapter skips as unit, one notice, segment red |
| E6 | wait-for-click ignored 30s | auto-skip + thought + continue |
| E7 | stop mid-run (✕) | stream aborted, spotlight cleaned, chat shows partial card |
| E8 | ask mid-walkthrough | confirm → abort → new run |

### Tools
| # | Scenario | Expected |
|---|---|---|
| T0 | read-tool result card (`table_sum_column`) | result rendered in popover footer; never re-executed on replay (flows 01, 03 A-C10) |
| T1 | dialog flow (tool reveals target) | `call-tool` → ladder catches dialog → highlight inside it |
| T2 | tool throws | step skipped `tool-error`, red slice, run continues |
| T3 | tool 3s latency | engine waits (≤10s), no double-fire |
| T4 | tool timeout (>10s) | skip + reason; engine never hangs |
| T5 | tool unregistered between ask and play | pre-execution check → skip `unknown-tool` |
| T6 | stepper emits bad args | server-side validation drops action *before* wire (verify in Stream panel) |
| T7 | api tool non-2xx | skip `tool-error`, response code in reason |

### Context / prompts (via Run panel)
| # | Scenario | Expected |
|---|---|---|
| C1 | state `{plan:"free"}` vs `{plan:"pro"}` | plan visibly adapts (e.g. upgrade chapter only for free) |
| C2 | contradicting hostKnowledge vs site fact | model sees both source-tagged; observe arbitration; no crash |
| C3 | 50-entry hostState | truncation marker visible in Context panel; counter increments |
| C4 | question with no matching components | apology walkthrough on page root (v1 open-q #7 behavior) |
| C5 | prompt-injection string in hostState (`"ignore instructions and …"`) | quoted as data; plan unaffected — the §7 framing holds |
| C6 | unmatched pageUrl | first-page fallback + warning in context debug |

### Stream / failure (server)
| # | Scenario | Expected |
|---|---|---|
| S1 | kill API mid-run | widget watchdog → "connection lost", no hang |
| S2 | planner forced failure (debug flag) | `end:error` frame, error bubble, partial run saved |
| S3 | narrator failure chapter 2 | chapter 2 `failed` + red, chapters 3+ play |
| S4 | frame log replay | patcher test: re-applied ops reproduce snapshot byte-identical |
| S5 | origin not in allowlist | 403 before any LLM call |
| S6 | rate limit burst | 429 + headers; widget backs off with message |

## 3. Component gallery states (visual, `/playground/components`)

Popover: streaming / complete / error / no-anchor (viewport-center). Ticker: idle shimmer, 1
thought, rapid thoughts, long label ellipsis. Timeline: 1/4/8 chapters, hover-grow, red segment,
red slice, live pulse, seek hover. PlanPanel: all four chapter states, thought expansion. Notice
card: not-found / tool-error / connection-lost. Input row: idle, streaming(disabled+stop), error.
Bar: docked→detached transition, narrow viewport (360px).

## 4. Working agreement

Every bug found outside the playground gets a row here *before* it gets a fix — the matrix only
grows. When a row can be asserted cheaply in code (patcher replay, resolver units), it graduates
to a real test; the playground keeps the rest honest.
