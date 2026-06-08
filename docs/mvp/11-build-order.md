# 11 — Build Order

> A dependency-true sequence for landing the MVP. The order is chosen so every step can be **unit-tested in isolation** before the next one builds on top — no big-bang integration. Parallelism is called out where independent work streams can run concurrently.

---

## 1. Phasing principle

| Stage | What lands | Acceptance |
|-------|------------|------------|
| **Foundation** | Types, wire, persistence wiring | A canned NDJSON of patches reconstructs a Conversation byte-for-byte, both server side (in the mirror) and client side (in the widget store). |
| **Widget plumbing** | Embed shim, host API, store APPLY_PATCH | A static dev page can `registerTool`, `setState`, and have the widget render a hand-canned conversation. |
| **Engine** | Action handlers + live-mode loop | A hand-canned `Conversation` plays on the host page (highlight, scroll, click gates, call-tool). |
| **Sub-agents** | Planner, Stepper, Narrator each running with a real model | Hitting `POST /v1/agent/run` with a fixture context produces a real walkthrough end-to-end. |
| **Polish + persistence** | `agent_runs` SQLite saves, dashboard view, replay | Past runs are listed in the dashboard and replay in history mode. |

Each stage's tests run green before the next starts. No half-finished work crosses a stage boundary.

---

## 2. Stage 1 — Foundation

### 1.1 `packages/walkthrough-core` (new package)

Files:
- `conversation/types.ts` (Message, ChatRole, TextPart, Conversation, MessageStatus — extended from `01-conversation-shape.md`).
- `walkthrough/types.ts` (WalkthroughPart, WalkthroughChapter, WalkthroughStep, PopoverConfig, statuses).
- `walkthrough/actions.ts` (WalkthroughAction union including `call-tool`, `wait-for-click`).
- `walkthrough/timing.ts` (re-export of TYPEWRITER_MS_PER_CHAR etc.).
- `conversation/applyPatch.ts` (`applyOps` with `fast-json-patch` + string-append wrapper).
- `conversation/langchain.ts` (toLangChain / fromLangChainChunk adapters).
- `patch/types.ts` (JsonPatchOp re-export, PatchFrame).
- `index.ts`.

Re-point `packages/widget/src/types/conversation.ts` to re-export from this package. Update `packages/widget/src/data/sample-conversation.ts` to satisfy the new required fields (`status`, chapter `description` + `elementId`, step `status`) so the existing renderers still build.

**Test**: snapshot-test `applyOps` against a hand-written list of frames, asserting the resulting `Conversation` matches expectations. Run on both the server's import path and the widget's.

### 1.2 Server: patcher + transport (skeleton, no LLM)

Files:
- `apps/api/src/services/agent/patcher/{createPatcher,frame,streamablePaths,transformStringAppend}.ts`.
- `apps/api/src/services/agent/patcher/helpers.ts` (the PatchHelpers implementation).
- `apps/api/src/services/agent/transport/ndjson.ts`.
- `apps/api/src/routes/agent.ts` (skeleton: validate body, open NDJSON, call a stub run function that emits canned frames).

**Test**: with the route wired, `curl -N -d @body.json /v1/agent/run` produces a stream of NDJSON frames matching the canned sequence. Pipe through `jq -c` and diff against a fixture.

### 1.3 SQLite scaffolding

Files:
- `apps/api/db/schema.sql`.
- `apps/api/src/lib/sqlite.ts`.
- `apps/api/src/services/agent/runs/{types,save,load,list,index}.ts`.

**Test**: insert a canned `Conversation` + `PatchFrame[]`; load by id; assert deep equality. Use `:memory:` for the test database.

**Parallelism**: 1.2 and 1.3 can run in parallel after 1.1 lands.

---

## 3. Stage 2 — Widget plumbing

### 2.1 `applyPatch` + store integration

Files:
- `packages/widget/src/agent/applyPatch.ts` (re-export from walkthrough-core).
- `packages/widget/src/agent/store.ts` (extend the existing reducer with `APPLY_PATCH`, `SET_PLAY_MODE`, `SET_STEP_STATUS`; add `playMode` to state).

**Test**: dispatch a sequence of canned `APPLY_PATCH` actions; assert the store's `conversation` matches the expected snapshot. Same fixture as 1.1.

### 2.2 Embed shim + host API

Files:
- `packages/widget/src/embed/{installGlobal,host-api,host-api.impl,hostState,hostTools}.ts`.
- Extend `packages/widget/src/embed.tsx` to install the shim + drain on mount.
- New `packages/widget/src/embed-auto.ts` for the IIFE entry.
- Extend `packages/widget/vite.config.ts` to build the IIFE.

**Test**: dev page calls `window.eregna.registerTool` before mount; after mount, the tool is in `hostTools.list()` and the buffered call drained. `window.eregna.ask` rejects pre-ready, resolves post-ready.

### 2.3 Wire `runStream` + a mocked server endpoint

Files:
- `packages/widget/src/agent/runStream.ts`.

**Test**: dev playground hits a small mock server that emits canned NDJSON; the widget's store reconstructs the same `Conversation` byte-for-byte.

**Parallelism**: 2.1 and 2.2 are independent after 1.1; 2.3 depends on both.

---

## 4. Stage 3 — Engine

### 3.1 Action handlers

Files:
- `packages/widget/src/engine/selectors.ts`.
- `packages/widget/src/engine/actions/{scrollTo,highlight,waitMs,waitForClick,callTool,index}.ts`.

**Test** (per handler): unit tests with jsdom for everything except `waitForClick` and `scrollTo` (those need a real browser). For `callTool`, mock the hostTools registry.

### 3.2 Live-mode loop

Files:
- `packages/widget/src/engine/playStep.ts`.
- `packages/widget/src/engine/waitLiveAdvance.ts`.
- `packages/widget/src/engine/index.ts` (`startEngineIfLive`).

**Test**: with the dev playground, dispatch a canned `Conversation` in live mode (no real server); the engine highlights elements, fires callTool against mock host tools, advances steps.

### 3.3 History-mode overlay tweak

Files:
- Edit `packages/widget/src/components/WalkthroughOverlay/index.tsx`: one ternary on `playMode` for the popover body source.
- Edit `packages/widget/src/hooks/usePlayer.ts`: skip the tick when `playMode === "live"`.

**Test**: load `sample-conversation.ts` (history mode default) — existing behaviour unchanged. Flip to live mode in a fixture — engine drives the same walkthrough; popover renders the literal body string from store.

**Parallelism**: 3.1 ⟂ 3.3 after 2.1.

---

## 5. Stage 4 — Sub-agents

### 4.1 Context loading

Files:
- `apps/api/src/services/agent/context/{types,compose,focusChapter,index}.ts`.
- `apps/api/src/services/agent/context/providers/{dbAgent,dbPage,dbElements,hostState,hostTools,conversationHistory}.ts`.
- `apps/api/src/services/agent/context/util/{matchUrl,buildTree}.ts`.

**Test**: end-to-end fixture against the dev Supabase: `composeContext` returns the expected `AgentContext` for a known agent/page/elements set.

### 4.2 Prompt sections

Files:
- `apps/api/src/services/agent/prompts/{types,compose,index}.ts`.
- `apps/api/src/services/agent/prompts/sections/{rules,customerOverlay,pageContext,elementsTree,hostStateBlock,hostToolsBlock,builtinToolsBlock}.ts`.

**Test**: snapshot each section's output for a canonical `AgentContext`. Snapshot the composed system prompt.

### 4.3 LLM provider wrapper

Files:
- `apps/api/src/services/agent/llm/{provider,openai}.ts`.

**Test**: integration test against a mock OpenAI server; verify `withStructuredOutput(PlanSchema)` flows correctly.

### 4.4 PlannerSubAgent

Files:
- `apps/api/src/services/agent/subagents/types.ts`.
- `apps/api/src/services/agent/subagents/planner/{prompt,schema,run,index}.ts`.

**Test**: mock the model to return a canned `AIMessage` with structured output; assert the `Plan` returned matches.

### 4.5 StepperSubAgent

Files:
- `apps/api/src/services/agent/subagents/stepper/{prompt,schema,run,index}.ts`.

**Test**: as 4.4.

### 4.6 NarratorSubAgent

Files:
- `apps/api/src/services/agent/subagents/narrator/{prompt,run,index}.ts`.

**Test**: mock the model's `.stream()` to yield canned text chunks; assert the AsyncIterable yields the same chunks.

### 4.7 Workflow (LangGraph)

Files:
- `apps/api/src/services/agent/workflow/{types,graph,index}.ts`.
- `apps/api/src/services/agent/workflow/nodes/{enrich,plan,streamChapter,streamBody,complete}.ts`.
- `apps/api/src/services/agent/workflow/util/{stepOfChapter,countStepsInChapter}.ts`.

**Test**: integration test with mocked sub-agents; assert the patch log produced by `Patcher.getLog()` matches an expected sequence.

### 4.8 Wire it all in `run.ts`

File:
- `apps/api/src/services/agent/run.ts`.

**Test**: end-to-end against a real OpenAI dev key (gated behind an env flag; not in CI). Hit `POST /v1/agent/run` with a fixture body, watch NDJSON frames, verify the widget can replay them.

**Parallelism**: 4.1 ⟂ 4.2 ⟂ 4.3 ⟂ 4.4/4.5/4.6 (sub-agents) after 4.1+4.2+4.3 land. 4.7 depends on all sub-agents.

---

## 6. Stage 5 — Persistence + dashboard view

### 5.1 Wire `runs.save` into `run.ts`

Already mostly described in stage 1.3 + 4.8. The actual `save()` call is added to the orchestrator's try/finally.

**Test**: an end-to-end run lands a row; `runs.load(id)` returns the same `Conversation`.

### 5.2 GET `/v1/agent/runs/:id` route

File:
- Add to `apps/api/src/routes/agent.ts`.

**Test**: dashboard fetches the row, the widget loads it in history mode, walkthrough replays.

### 5.3 Dashboard listing UI (Phase 2-lite)

A minimal "Sessions" tab on the agent dashboard that lists rows from `GET /v1/agent/runs?agentId=…` and links each to a replay view. Not blocking the MVP; can land in the same week.

---

## 7. Acceptance criteria — final mapping

| #  | Criterion (`07-engine.md` / `08-embed-and-host-api.md` references) | Lands in |
|----|------------------------------------------------------------------|----------|
| 1  | `window.eregna` installs synchronously                          | Stage 2.2 |
| 2  | `ask()` posts to `/v1/agent/run`; assistant message appears within 1.5s | Stage 4.8 |
| 3  | Assistant `text` parts grow word-by-word via `add` patches      | Stage 1.1 + 4.7 |
| 4  | Plan checklist renders with `chapters[]` populated, status=`planning` | Stage 4.4 + 4.7 |
| 5  | Status flips to `playing`; steps stream in; `chapter.stepIndex` populates | Stage 4.5 + 4.7 |
| 6  | Live mode: `popover.body` grows char/word by patches            | Stage 4.6 + 4.7 + 3.3 |
| 7  | History mode: existing `usePlayer` typewriter animates the body | Stage 3.3 + 5.2 |
| 8  | `highlight` action paints the spotlight                          | Stage 3.1 (existing components + selectors) |
| 9  | `call-tool` invokes host's `run()` and proceeds                  | Stage 3.1 |
| 10 | `wait-for-click` blocks until click or timeout                   | Stage 3.1 |
| 11 | Run ends with statuses `complete`; row persisted                 | Stage 5.1 |
| 12 | Unknown elementId / toolName → step marked `skipped`             | Stage 3.1 (engine) + Stage 4.7 (orchestrator) |
| 13 | Server makes zero network requests to the host's URL             | Stage 4.1 (no fetch providers anywhere) |
| 14 | Closing the widget mid-run aborts the fetch + marks the run aborted | Stage 4.8 (try/catch) |

---

## 8. Test pyramid

| Layer | Coverage | Where |
|---|---|---|
| Unit | Pure functions (prompts, schemas, helpers, sections, action handlers) | alongside each file, `*.test.ts` |
| Integration | Workflow with mocked sub-agents; patcher mirror; engine with jsdom | `apps/api/src/services/agent/__tests__/` |
| End-to-end (manual / nightly) | Real OpenAI key, real Postgres + SQLite, real widget on a real page | `e2e/` (not in CI; nightly cron) |

No widget E2E in CI for MVP. Storybook-style component tests for the overlay + popup are sufficient.

---

## 9. Parallelism (developer streams)

```
A — Foundation        : packages/walkthrough-core + applyPatch
B — Server transport  : patcher/helpers + NDJSON route + SQLite scaffolding   (depends on A)
C — Widget plumbing   : store + embed shim + runStream                          (depends on A)
D — Engine            : actions + playStep + history tweak                      (depends on C)
E — Context + prompts : context providers + prompt sections                     (depends on A)
F — Sub-agents        : planner + stepper + narrator                            (depends on E)
G — Workflow          : LangGraph + nodes + run.ts wiring                       (depends on B+F)
H — Persistence       : runs.save call + replay endpoint                        (depends on G)
```

Two-developer split: one on A → B → G → H, one on C → D, with E + F overlapping when context lands.

Single-developer: A → B → C → D → E → F → G → H, with stage tests gating each transition. About 2–3 weeks at focused pace.

---

## 10. Cuts if we're behind

If timeline pressure: drop in this order.

1. **Dashboard sessions UI** (5.3) — fully replaced by `curl` of the API.
2. **`call-tool` action** (3.1 part) — the demo works without host interaction for the first customer; reinstate week 2.
3. **Multi-provider LLM** (already deferred) — OpenAI only.
4. **Element-tree validation in `addChapter`** — accept whatever; let the engine drop bad steps. Faster to ship; small risk of confusing playback.

Do **not** cut: the sub-agent split, the JSON-Patch wire, the live/history play modes. Those are the MVP's structural commitments; partial versions cost more later.

---

## 11. References

- All other MVP docs. This file is the integration plan; each stage's content is detailed in the doc that owns the affected files.
