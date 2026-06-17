# Flow 02 — Guided Precondition Recovery ("do this first, then this")

> A condition error happens — the export button is disabled, the form field is invalid,
> the dialog needs another dialog closed first. The popup must not just *fail*; it must
> **interact**: "do this first… now do this." There are two very different ways to get
> that behavior, and the cheap one works today.

---

## 1. The stage components

- **Export button** (`orders.export-btn`): disabled until a table row is selected.
  Clicking it via tool while disabled throws `{ code: "no-row-selected" }`.
- **Email form** (`form.email-input` + `form.submit`): submit with an invalid email
  renders an inline validation error; the `prefillForm` tool with a bad arg triggers it
  deliberately.

## 2. The flowchart

```
visitor: "export my orders"
            │
            ▼
   stepper context for chapter "Export your orders":
   target = orders.export-btn, whose KB NOTES say
   "disabled until a row is selected in the orders table"
            │
   ┌────────┴────────────────────────────────────────────┐
   │ PLANNED guidance (MVP — notes ARE the precondition)  │
   │                                                      │
   │  step k:   highlight orders.table row                │
   │            popover: "First, select the row you want  │
   │            to export"                                │
   │            action: wait-for-click (orders.table)     │ ← human gate
   │  step k+1: highlight orders.export-btn               │
   │            popover: "Now click Export"               │
   │            action: wait-for-click (export-btn)       │
   └──────────────────────────────────────────────────────┘
            │
            │ but what if the model DIDN'T plan for it
            │ (notes missing / state unexpected)?
            ▼
   ┌──────────────────────────────────────────────────────┐
   │ REACTIVE guidance (Phase 5 — needs tool round-trip)   │
   │                                                       │
   │  call-tool clickExport → throws                       │
   │     { code: "no-row-selected",                        │
   │       hint: "select a row in the orders table first" }│
   │            │                                          │
   │            ▼  POST tool-result (error + hint)         │
   │  orchestrator resumes stepper WITH the error →        │
   │  agent inserts corrective steps (exactly the          │
   │  planned-guidance shape above) and retries the export │
   └──────────────────────────────────────────────────────┘
            │
            ▼  MVP fallback when reactive isn't built:
   step skipped (`tool-error:no-row-selected`), notice card shows
   the tool's hint verbatim: "Select a row in the orders table
   first." — red slice, run continues. Degraded but honest.
```

## 3. Condition table

| # | Condition | Expected behavior | Phase |
|---|-----------|-------------------|-------|
| G-B1 | notes describe the precondition | stepper plans select-row → wait-for-click → export (planned guidance) | works now |
| G-B2 | visitor ignores "select a row" for 30s | wait-for-click times out → step auto-skips + thought; export step then fails gracefully (G-B4) | 3 |
| G-B3 | visitor clicks the WRONG row area | click listener is on the target element only; pulse continues until target clicked or timeout | 3 |
| G-B4 | tool throws structured error `{code, hint}` | notice card shows `hint` verbatim, red slice, continue | 3 |
| G-B5 | tool throws unstructured `Error` | generic notice ("This action didn't work — you can do it manually"), reason in telemetry | 3 |
| G-B6 | reactive: corrective steps generated from error | round-trip + stepper re-entry | 5 |
| G-B7 | form validation error path | `prefillForm` bad arg → page shows its own inline error → agent's next step highlights the error message (planned via notes: "shows inline error below the field") | works now |

## 4. The error contract for host tools (decide once, here)

Host tools that *can* fail with a user-fixable cause should throw:

```ts
throw Object.assign(new Error("no row selected"), {
  code: "no-row-selected",                       // machine-readable, stable
  hint: "Select a row in the orders table first" // visitor-facing, the popup shows this
});
```

The engine reads `code` into `skipReason` (`tool-error:no-row-selected`) and `hint` into
the notice card. In Phase 5 the same two fields ride the round-trip so the agent can plan
the fix. One error shape, three consumers (notice, telemetry, agent) — same pattern as
the result card in Flow 01.

## 5. What this teaches

**Preconditions are knowledge before they are errors.** The reactive path (tool fails →
agent re-plans) is seductive and expensive: a network round-trip, a paused graph, a second
LLM call — to discover something the customer could have written in one sentence of
component notes. The planned path costs zero extra calls and produces a *better*
walkthrough (the visitor is guided before failing, not after). Reactive recovery is the
safety net, not the strategy — which is why notes quality (4-client/04 §2) matters more
than round-trip plumbing.
