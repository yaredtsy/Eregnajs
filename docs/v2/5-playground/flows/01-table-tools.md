# Flow 01 — Table Read-Tools (summary & summation)

> The MVP demonstration of "expose component tools, easy to use." A data table is the
> perfect specimen: visitors ask questions whose answers live *inside* a component
> ("how much did I spend?", "how many orders failed?"), and the host page can answer
> them with two tiny exported functions.

---

## 1. The stage component

An **orders table** (`orders.table` in the KB) with columns `date / item / status / total`,
seeded with ~12 rows. The host page registers read-tools next to it:

```js
window.eregna.registerTool({
  name: "table_summary",
  description: "Returns row count, column names, and status counts for the orders table. Use when the visitor asks what the table contains.",
  parameters: {},
  run: () => summarize(ordersData),          // { rows: 12, columns: [...], byStatus: {...} }
});

window.eregna.registerTool({
  name: "table_sum_column",
  description: "Sums a numeric column of the orders table. Use for 'total spend' style questions.",
  parameters: { column: { type: "string", enum: ["total"] } },
  run: ({ column }) => ordersData.reduce((s, r) => s + r[column], 0),
});
```

Two lines of lesson here: the `description` tells the model *when* to reach for the tool,
and `enum` makes bad args impossible rather than validated-after.

## 2. The flowchart

```
visitor: "how much did I spend this month?"
            │
            ▼
planner context: components(orders.table) + tools(table_summary,
                 table_sum_column) + hostState
            │
   ┌────────┴─────────────────────────┐
   │ answer already in hostState?     │   host pre-calculated:
   │ e.g. setState({monthSpend: 412}) │   the CHEAP channel
   └────────┬───────────────┬─────────┘
        yes │               │ no
            ▼               ▼
   plan narrates the     plan: chapter "Your total spend"
   number directly —        step 1: scroll-to + highlight orders.table
   walkthrough is just      step 2: call-tool table_sum_column {column:"total"}
   "here is the table                + popover anchored to the table
   it came from"            │
            │               ▼
            │        engine executes when step 2 plays
            │     ┌─────────┴──────────────┐
            │     │ MVP (no round-trip)    │ Phase 5 (round-trip)
            │     ▼                        ▼
            │  RESULT CARD: widget      result POSTs to
            │  renders the raw value    /public/agent/tool-result;
            │  in the popover footer:   orchestrator resumes; narrator
            │  "table_sum_column →      says "You spent $412 this
            │  412"                     month" and may re-plan
            ▼
        play continues (video-like) either way
```

## 3. Condition table

| # | Condition | Expected behavior | Phase |
|---|-----------|-------------------|-------|
| T-A1 | happy path: tool returns number | result card in popover footer; step completes | 3 |
| T-A2 | host pre-calculated via `hostState` | no tool call planned; narrator cites the value | works now |
| T-A3 | tool throws | step skipped `tool-error:table_sum_column`, red slice, run continues | 3 |
| T-A4 | tool slow (3s injector) | engine waits within 10s budget; popover shows spinner row | 3 |
| T-A5 | result huge (>4KB) | result card truncates with "…"; full value in run telemetry only | 3 |
| T-A6 | model invents `column:"price"` | enum validation post-Stepper drops the action, `bad-args` reason | 4 |
| T-A7 | narrated answer from result | round-trip; narrator references actual value | 5 |
| T-A8 | result invalidates the plan (e.g. table empty) | round-trip + re-plan | 5+ |

## 4. What this teaches

- **Read-tools vs act-tools.** Acting tools (open dialog) only need fire-and-forget; *read*
  tools are pointless unless someone consumes the result. The consumers, cheapest first:
  the **visitor** (result card — pure widget code), then the **agent** (round-trip — a whole
  subsystem). Knowing which consumer you actually need is the design skill.
- **hostState is the poor man's read-tool.** If the page can compute the answer at
  `ask()` time, inject it as state and skip the tool entirely. Tools earn their keep only
  when the value must be computed *mid-walkthrough* or on demand.
- **Schema as guard-rail**: `enum: ["total"]` at declaration beats arg-validation at runtime.

## 5. Result card contract (MVP widget work)

The engine records tool outcomes on the step (client-side state, single-writer rule):

```ts
step.toolResult = { name, status: "ok" | "error", summary: string /* ≤300 chars, JSON-stringified */ }
```

The popover renders `toolResult.summary` as a monospace footer row. This same field is what
the Phase 5 round-trip will POST — the contract is shared, only the consumer changes.
