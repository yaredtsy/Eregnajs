# Flow 05 — The Combined Scenario (step by step)

> One playground session that walks every condition in order. This is the demo you run
> after building each phase, and the script you follow to *understand* the system end to
> end. Each step names the flow it exercises and what to watch.

---

## Setup (panels, once)

1. **State panel**: apply preset `{ user: { plan: "free" }, monthSpend: undefined }`.
2. **Tools panel**: enable `table_summary`, `table_sum_column`, `clickExport`
   (precondition-throwing), `openPricingDialog`. Latency 0, failure off.
3. **Knowledge panel**: add one entry — "Exports are limited to 100 rows on the free plan."
4. Page has the orders table (12 rows, none selected), export button (disabled),
   pricing dialog (closed), vanishing banner (disappears after 5s).

## The session

| Step | Do | Watch | Flow |
|---|---|---|---|
| 1 | Ask **"how much did I spend this month?"** | Ticker thinks; plan = 1 chapter on `orders.table`; a `call-tool table_sum_column` step executes; **result card** shows `412` in the popover footer. Agent does *not* say "412" in prose (no round-trip yet — that asymmetry is the lesson). | F01 |
| 2 | Set state `monthSpend: 412`, ask the same question | No tool call planned; narrator cites the number directly. **Pre-calculated beats awaited.** | F01/F03 |
| 3 | Ask **"export my orders"** | Stepper read the export button's notes → plan: select-row (wait-for-click) → export (wait-for-click). The popup says "First, select the row…" — guided, *before* failure. | F02 |
| 4 | Don't click anything for 30s | wait-for-click times out → step auto-skips with a thought; export step's `clickExport` (if planned) throws → notice shows the tool's `hint` verbatim; red slice; run finishes. | F02/F03 |
| 5 | Ask again, click through properly this time | Full happy path with human gates; segments fill as you click. | F03 |
| 6 | Toggle `table_sum_column` failure = throw, repeat step 1 | Step skips `tool-error`, red slice, run continues to the end frame. | F01 |
| 7 | Toggle latency = 3000ms, repeat | Spinner row in popover; advance after ~3s; nothing hangs. | F03 |
| 8 | Ask **"what does the upgrade dialog offer?"** | `openPricingDialog` tool fires → resolver ladder catches the dialog appearing → highlight lands *inside* it. | F03 |
| 9 | Wait 6s (banner vanished), replay the run from step 8 if it referenced the banner — or ask about the banner, then replay that run | Live run: banner step red + notice. Replay later: chapter-1 pre-flight fails → **drift dialog**. | F04 |
| 10 | Drift dialog → **Regenerate** | Normal `ask()` fires with the stored query; new live run plans around today's page (no banner chapter). | F04 |
| 11 | Replay the step-5 run | Tools do **not** re-execute (the table doesn't re-export); recorded result cards display; gates replay as recordings. | F03 A-C10 |
| 12 | Open the **Stream panel** for any of the above | Find the exact frames: the manifest in `hello`-adjacent enrich patches, the thought adds, the status flips that turned a segment red. | all |

## Exit criteria

You understand the system when you can answer, from memory, for each step above:
*which actor decided* (planner / stepper / engine / visitor / reducer) and *which document
field changed* (manifest, thoughts, step.status, toolResult, chapter.status). The Stream
panel is the answer key.

## Phase gating

Steps 1–8 and 11–12 need Phases 3–5 widget+server work as mapped in each flow file;
steps with round-trip narration (the "agent says 412" variant of step 1) are the Phase 5+
demo — when that lands, rerun this script and diff the behavior of steps 1 and 4.
