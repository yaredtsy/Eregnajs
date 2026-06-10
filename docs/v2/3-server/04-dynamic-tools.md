# 3.4 — Dynamic Tool Orchestration

> Tools the server has never seen until the request arrives, declared by a script you don't
> control, executed in a browser you don't own. This file is the spine of the "dynamic tool
> orchestration" learning goal.

> **What you're learning here:** runtime tool registries (vs. compile-time toolsets), the
> descriptor/implementation split, rendering dynamic toolsets into prompts, validating
> model-chosen invocations, and designing a result round-trip before you need it.

---

## 1. The core split: descriptor crosses the wire, implementation never does

```
HOST PAGE                         SERVER                          WIDGET ENGINE
registerTool({                    sees only:                      executes:
  name, description,    ──────▶   { name, description,   ──────▶  spec.kind === "fn"  → run(args)
  parameters,                       parameters }                   spec.kind === "api" → fetch(...)
  run | api                       (renders into prompts,
})                                 validates invocations)
```

The server orchestrates capabilities it cannot execute; the page executes capabilities it didn't
choose. Authority is split exactly along the trust boundary (`2-system/01` §4).

## 2. Tool kinds (v2 adds `api`)

```ts
// what the host page registers (full spec, client-side only)
export type ToolSpec = FnToolSpec | ApiToolSpec

interface ToolSpecBase {
  name: string                 // unique per page; server namespaces nothing (MVP has no built-ins)
  description: string          // the model reads this — quality here = quality of tool use
  parameters: Record<string, JsonSchemaProp>
}
interface FnToolSpec  extends ToolSpecBase { kind?: "fn"; run: (args) => unknown | Promise<unknown> }
interface ApiToolSpec extends ToolSpecBase {
  kind: "api"
  endpoint: { method: "GET"|"POST"; url: string; headers?: Record<string,string>; bodyTemplate?: object }
  // url/bodyTemplate may contain {param} placeholders filled from validated args
}
```

`api` tools let a customer expose backend actions *declaratively* — no glue code, the widget runs
the `fetch` from the visitor's browser (their cookies, their session — the request is one the
visitor could already make). Constraint: **same-origin URLs only** in MVP; cross-origin needs the
customer's CORS anyway and invites exfiltration mistakes.

## 3. The dynamic registry lifecycle

1. Page calls `registerTool` (any time; buffered pre-mount; re-register replaces by name).
2. `ask()` snapshots descriptors → request body (≤20 tools, route-validated).
3. Server renders `hostToolsBlock`: name, description, compact params schema, per tool. The
   *planner* sees names+descriptions (capability awareness); the *stepper* sees full schemas
   (invocation accuracy). Same projection gradient as everything else.
4. Stepper may emit `call-tool` actions; server validates name+args (3.3 §3) before they ship.
5. Engine executes when the step plays; result handling per §5.

The toolset is **per request** — different pages, different visitors, different moments produce
different capability sets. The prompts are rebuilt every run; nothing is cached against a toolset.

## 4. Validation, both ends (fix #5)

| Where | Checks |
|---|---|
| Route (Zod) | descriptor shape; name `[a-z0-9_-]{1,40}`; unique names; param schema is the supported subset |
| Server, post-Stepper | tool exists; args validate against `parameters` (required present, types match, enums respected); on fail → self-repair retry → drop action + `skipReason` |
| Engine, pre-execution | tool still registered (page may have changed since `ask`); `api` URL still same-origin; 10s execution timeout |

Trust nothing across either gap: the model can hallucinate invocations; the page can mutate
between request and playback.

## 5. The result round-trip (designed now, built Phase 5)

MVP behavior: fire-and-forget. Engine runs the tool, *locally* records
`{ status: "ok" | "error", summary }` on the step (visible in the player + telemetry later),
advances regardless. The Stepper is prompted "assume tool calls succeed."

The seam, fully named so nothing in MVP blocks it:

```
1. POST /public/agent/tool-result { runId, stepId, result }     ← widget, after execution
2. orchestrator node `waitForToolResult` parks the graph        ← needs resumable orchestration
3. Stepper (reactive mode) receives result in its next call     ← schema gains toolResults[]
```

Why deferred: it forces resumable graph state and a widget→server channel — both real
subsystems. Why designed now: the step/run ids in the wire format (already present) are the only
prerequisites, and we keep them stable.

## 6. Tool-description quality is a customer problem you must absorb

The model is exactly as good as `description` strings written by customers. Mitigations: the
playground's tools panel shows *how the model used* a tool (which args, when chosen); the
dashboard can later lint descriptions ("too short", "doesn't say when to use it"). For now: docs +
playground feedback loop. This mirrors a general truth — in dynamic tool systems, **the spec
surface is the product surface**.
