# 8.7 — Rollout

> The order. Each milestone is independently shippable; nothing here is a
> big-bang. Acceptance criteria at the end so "done" is unambiguous.

---

## Milestones, top to bottom

```
                            today
                              │
                              ▼
   M1  Docs sync       ─── update 3-server/01 §3 and 03-subagents.md §1
                              │
                              ▼
   M2  Rules split     ─── coreRules + walkthroughRules + chatRules
                              │
                              ▼
   M3  Projection      ─── add PLANNER/STEPPER/CHAT_SECTIONS in compose.ts
                              │
                              ▼
   M4  Chat rewrite    ─── chat/prompt.ts uses CHAT_SECTIONS + boundary
                              │
                              ▼
   M5  Sections tidy   ─── trust preamble, per-entry cap, central budgets
                              │
                              ▼
   M6  History upgrade ─── token budget + non-text summary
                              │
                              ▼
   M7  Runtime tidy    ─── run.ts single path, streamText.ts error sanitize
                              │
                              ▼
                       (review complete)
```

Each box is a separate PR. M1 unblocks everything because the docs
encode the intent the code is about to match.

---

## M1 — Docs sync

Edits to existing docs (not to this folder):

- `docs/v2/3-server/01-context-engineering.md §3` — add a "Chat" row to
  the projection table.
- `docs/v2/3-server/03-subagents.md §1` — add a fourth row to "The cast":
  `Chat | persona + knowledge + page summary + history | streamed prose |
  token stream`.

Cost: 10 minutes. Reviewer: anyone who knows the product. This is the
load-bearing one — the rest of the codebase change *follows* the table.

---

## M2 — Rules split

Files in chapter 04. Concrete steps:

1. Add `prompts/sections/coreRules.ts`, `walkthroughRules.ts`,
   `chatRules.ts` (text from chapter 04).
2. Leave `rules.ts` as a temporary re-export of `walkthroughRulesSection`
   so existing callers keep working.
3. No behaviour change yet — the new sections aren't referenced.

Acceptance: `pnpm test` green; `inspectPrompt` output unchanged.

---

## M3 — Projection sets

In `prompts/compose.ts`:

1. Add `PLANNER_SECTIONS`, `STEPPER_SECTIONS`, `NARRATOR_SECTIONS`,
   `CHAT_SECTIONS` exports.
2. Keep `DEFAULT_SECTIONS = PLANNER_SECTIONS` for back-compat.
3. Update planner/stepper/narrator call sites to pass their section set
   explicitly (one-line change each).

Acceptance: every subagent's call to `composeSystemPrompt` passes a
named section set; debug endpoint now reports the slice the call really
used.

---

## M4 — Chat rewrite

Files in chapter 05:

1. Add `pageElementsSummary.ts`.
2. Replace `chat/prompt.ts` with the chapter-05 version (`CHAT_SECTIONS`,
   `CHAT_MODE_SUFFIX`, boundary-wrapped HumanMessage).
3. Delete the trailing per-turn instruction from chat (it's in the suffix
   now).

Acceptance: a representative chat question reduces system-prompt token
count by ≥ 40% on `/dashboard` (the guide agent). No regressions on the
existing example questions in `7-guide-agent/02-prompts.md`.

---

## M5 — Sections tidy

In any order:
- `hostStateBlock.ts` — add trust preamble.
- `knowledgeBlock.ts` — `PER_ENTRY_MAX = 800`.
- `customerOverlay.ts` — 4 KB cap, "persona" heading.
- `prompts/util/budget.ts` — move all caps into one `BUDGETS` map.

Acceptance: `BUDGETS` is the only file with a literal cap number.

---

## M6 — History upgrade

`context/extractHistory.ts` — token budget + non-text summary (chapter 06).

Acceptance:
- a session that ends in a walkthrough leaves a one-line summary visible
  to the next chat turn;
- 100 long user/assistant turns no longer exceed `BUDGETS.history` in
  the system prompt budget probe.

---

## M7 — Runtime tidy

- `subagents/chat/run.ts` — single code path, `{ firstByte }` return.
- `workflow/nodes/streamText.ts` — drop blind retry, sanitize error text.

Acceptance: telemetry usage rows recorded on every chat call (ledger or
no ledger); a forced model error produces a one-line user-visible message
with no stack details.

---

## Cleanup (after M2–M7 land)

Delete `prompts/sections/rules.ts` and any `DEFAULT_SECTIONS` fallback.
Search the repo for `composeSystemPrompt(ctx)` (one-argument form) — it
should return no hits.

---

## What "done" looks like (one-screen check)

```
   ▣ docs/v2/3-server/01 §3            has a Chat row
   ▣ docs/v2/3-server/03 §1            has a Chat row
   ▣ prompts/compose.ts                exports per-role section sets
   ▣ prompts/sections/rules.ts         deleted
   ▣ prompts/sections/chatRules.ts     exists
   ▣ subagents/chat/prompt.ts          uses CHAT_SECTIONS + boundary
   ▣ hostStateBlock                    has trust preamble
   ▣ extractHistory                    char-budgeted, non-text aware
   ▣ runChat                           one path; ledger optional
   ▣ streamText error text             sanitized
```

If every box ticks, this review is complete. If a box can't be ticked
yet, the chapter it came from is still actionable.

---

## What this review explicitly leaves for later

| Deferred | Trigger |
|---|---|
| Retrieval over `siteFacts` | customer ships > ~30 facts on one agent |
| Reactive stepper / tool round-trip | first customer asks for it |
| Critic role (plan validator) | first plan-quality regression hits prod |
| Per-role model overrides | first cost spike on narrator |

Each one has a doc home already (`3-server/01 §6`, `3-server/03 §5`,
`3-server/03 §5`). Don't re-litigate them here.

---

## End of folder

Back to [README.md](./README.md) for the index. The four issues from
[02-issues.md](./02-issues.md) should all read as "fixed" once M1–M7
land.
