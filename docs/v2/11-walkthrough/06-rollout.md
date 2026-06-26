# 11.6 — Rollout

> Phase 1 only. Four milestones. Each is independently shippable.
> Stepper and narrator live in their own folders later; this rollout
> never touches them.

---

## Milestones, top to bottom

```
                          today
                            │
                            ▼
   M1  Types + schema + rules split ── PlanReasoning, intent,
                                       expectedSteps; coreRules /
                                       walkthroughRules / chatRules;
                                       PLANNER_SECTIONS + CHAT_SECTIONS
                                       (chat/prompt.ts adopts CHAT_SECTIONS
                                        per 8/05).
                            │
                            ▼
   M2  Three-stage planner ──── runPlanner becomes 3 LLM calls with
                                patcher writes in between; three prompt
                                builders; existing repair flow preserved.
                            │
                            ▼
   M3  Tool + middleware ───── start_walkthrough tool in chatAgent;
                                walkthroughContextMiddleware (wrapModelCall)
                                with most-recent selection rule.
                            │
                            ▼
   M4  Widget UI ──────────── WalkthroughCard grows: reasoning
                                disclosure, thought ticker, chapter
                                checklist, skeleton.
                            │
                            ▼
                          (phase 2 — stepper — separate folder)
```

Each milestone is one PR. The chat path stays usable between every
milestone — M1–M3 ship the server changes invisibly (no UI change
until M4), M4 unhides them.

---

## M1 — Types + schema + rules split

**Files:**
- `packages/walkthrough-core/src/walkthrough/types.ts` — add
  `PlanReasoning`, add `intent` + `expectedSteps` to
  `WalkthroughChapter`, add optional `reasoning` to `WalkthroughPart`.
- `apps/api/src/services/agent/subagents/planner/schema.ts` — split
  into `PlanReasoningSchema`, `PlanFrameSchema`, `ChaptersSchema`.
- `apps/api/src/services/agent/subagents/types.ts` — update `Plan`,
  add `PlanReasoning`, `PlanFrame`.
- `apps/api/src/services/agent/prompts/sections/coreRules.ts` (NEW).
- `apps/api/src/services/agent/prompts/sections/walkthroughRules.ts` (NEW).
- `apps/api/src/services/agent/prompts/sections/chatRules.ts` (NEW).
- `apps/api/src/services/agent/prompts/sections/pageElementsSummary.ts` (NEW).
- `apps/api/src/services/agent/prompts/compose.ts` — export
  `PLANNER_SECTIONS`, `CHAT_SECTIONS`.
- `apps/api/src/services/agent/subagents/chat/prompt.ts` — adopt
  `CHAT_SECTIONS` + boundary-wrapped query (per `8/05`).

**Acceptance:**
- `pnpm typecheck` green across packages and apps.
- `pnpm test` green (planner + chat tests still pass; planner tests
  may need fixture updates for new chapter fields — keep mocks small).
- Existing chat path: unchanged behavior, but now reads `CHAT_SECTIONS`
  instead of the planner-grade default. Manual smoke test: chat reply
  on a known query is similar prose, no walkthrough framing.
- `composeSystemPrompt(ctx, PLANNER_SECTIONS)` snapshot test confirms
  the section order.

---

## M2 — Three-stage planner

**Files:**
- `apps/api/src/services/agent/subagents/planner/prompt.ts` — rewrite
  as three builders + two formatters (`buildReasoningPrompt`,
  `buildFramePrompt`, `buildChaptersPrompt`,
  `formatReasoningAsPrior`, `formatFrameAsPrior`).
- `apps/api/src/services/agent/subagents/planner/run.ts` — three
  stages with patcher writes in between; preserve repair/validation
  flow for stage 3 only.
- `apps/api/src/services/agent/patcher/helpers.ts` —
  `setWalkthroughReasoning`, `setPlanGoal`,
  `replaceOrAddWalkthroughPart`.

**Acceptance:**
- `runPlanner` returns the new `Plan` shape (with `reasoning`,
  `chapters` carrying `intent` + `expectedSteps`).
- Three model calls visible in LangSmith trace, each with a
  distinct prompt.
- Stage 1 failure → tool surfaces error; stage 2 & 3 do not run.
- Stage 3 failure → reasoning + frame already written; status flips
  to `error`.
- Token ledger sums per-stage usage under the existing
  `"planner"` label.
- Snapshot test for sample goal + sample ctx: deterministic chapter
  count + intent distribution within ±1 across runs (low-temp).

---

## M3 — Tool + middleware

**Files:**
- `apps/api/src/services/agent/tools/builtin/startWalkthrough.ts` (NEW).
- `apps/api/src/services/agent/workflow/middleware/walkthroughContext.ts` (NEW).
- `apps/api/src/services/agent/workflow/middleware/walkthroughProjection.ts` (NEW).
- `apps/api/src/services/agent/workflow/chatAgent.ts` — add args
  (`patcher`, `getAssistantMsgIndex`), wire tool + middleware.
- `apps/api/src/services/agent/chat/run.ts` — pass `patcher` and a
  `() => assistantMsgIndex` closure into `buildChatAgent`.

**Acceptance (server-side, curl-able):**
- `POST /agent/run` with query "walk me through creating an agent"
  → NDJSON stream includes:
  - `pending-tool-call` events? No — `start_walkthrough` is a
    server tool, no interrupt. Just text deltas + walkthrough
    patcher frames + a final assistant message.
- Conversation state after the run has one `WalkthroughPart` on
  the assistant message with: `reasoning`, `planGoal`,
  `chapters[1..6]`, each chapter carrying `intent` + `expectedSteps`.
- LangSmith trace shows: `wrapModelCall` middleware injecting a
  SystemMessage on the closing turn; ToolMessage carries
  `{ walkthroughId, chapterCount, status: "planned" }`.
- Follow-up query "what was chapter 2 again?" → text reply quoting
  the chapter title verbatim; no new tool call.
- Follow-up query "change chapter 3 to use the password field" →
  text reply offering re-plan + the model calls `start_walkthrough`
  with a refined goal in the same turn or invites the visitor to
  confirm (test both happy paths).
- Re-plan in same turn → `replaceOrAddWalkthroughPart` collapses to
  one part on the message.
- Pure chat query ("what is this?") → no tool call, no walkthrough,
  no injection.

---

## M4 — Widget UI

**Files:**
- `packages/widget/src/components/ChatPopup/WalkthroughCard.tsx` —
  expand with header + ticker + reasoning disclosure + checklist
  + skeleton.
- `packages/widget/src/components/ChatPopup/walkthrough/` (NEW):
  `ReasoningDisclosure.tsx`, `ChapterChecklist.tsx`,
  `ChapterChecklistItem.tsx`, `ThoughtTicker.tsx`,
  `WalkthroughCardSkeleton.tsx`.
- `packages/widget/src/types/conversation.ts` — re-export new
  walkthrough-core types.
- Styles: extend existing `eregna-wt-card` rules; add disclosure
  expand/collapse + chip badges.

**Acceptance:**
- Widget renders skeleton during M3's stage-0 latency (before stage
  1 returns).
- Reasoning disclosure appears the moment stage 1 lands; expands
  to show all three reasoning fields; chip list when
  `knowledgeAnchors` non-empty, omitted otherwise.
- Title + ticker update once stage 2 lands.
- Checklist populates once stage 3 lands; chapter rows show title +
  intent badge + `~N step(s)`.
- Status dots all `pending`. Play icon visually dimmed (cursor
  default; no click).
- Error path: card shows the error reason inline; visitor can
  scroll back and re-ask.
- Sample conversation in `packages/widget/src/data/sample-conversation.ts`
  updated with one walkthrough that has `reasoning` + new chapter
  fields, so dev demos render the full surface.

---

## What "phase 1 done" looks like (one-screen check)

```
   ▣ Type changes + rules split shipped (M1)
   ▣ runPlanner is three-stage; patcher writes between stages (M2)
   ▣ start_walkthrough tool wired in chatAgent (M3)
   ▣ walkthroughContextMiddleware projects most-recent
       WalkthroughPart on every model call (M3)
   ▣ ToolMessage from start_walkthrough is the minimal ack;
       middleware carries the substance (M3)
   ▣ Closing message reads the projection and references chapters
       by title in prose (M3)
   ▣ Widget renders reasoning disclosure + checklist + ticker (M4)
   ▣ Re-plan in same turn collapses to one part (M3 patcher)
   ▣ Follow-up "what was chapter N?" answered from middleware
       projection (M3)
   ▣ "Edit chapter N" offers re-plan (M3 chat rules)
   ▣ Pure chat queries unchanged (M1 chat rules + M3 tool gate)
```

If every box ticks, phase 1 is shipped and we open the
`12-walkthrough-stepper/` folder.

---

## What this rollout explicitly leaves for later

| Deferred | Trigger |
|---|---|
| Stepper subagent (chapter expansion → step actions) | Phase 2 begins |
| Narrator subagent (popover bodies) | Phase 3 begins |
| Engine playback (highlight, wait-for-click, click) | Phase 2 |
| Chapter scroll-to preview in production | If visitor research shows it's wanted |
| Plan editing (`revise_walkthrough` tool) | Eval shows re-plan friction is real |
| Streaming partial chapters from stage 3 | If stage 3's 900–1400 ms feels slow in practice |
| Provider-native extended thinking instead of stage 1 | When we commit to a single provider |
| Compacting old ToolMessage acks | If sessions routinely exceed 10 walkthroughs |
| Cross-message walkthrough threading | When "go back to the second tour" becomes a top eval failure |

Each has a home elsewhere in v2 docs. Don't re-litigate here.

---

## End of folder

Back to the [README](./README.md). The vision in `00-overview.md`
should read as "shipped" once M1–M4 land. Then open
`12-walkthrough-stepper/`.
