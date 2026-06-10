# 0.2 — The Good (keep these)

> Decisions in v1 that are genuinely strong. v2 keeps every one of them. Each entry says *why*
> it's good in general agent-engineering terms — these are the patterns worth internalizing.

---

## 1. Conversation-as-document + JSON Patch streaming

The agent's entire output is **one mutable document** (`Conversation`); the server mutates it,
`fast-json-patch` observes, and RFC 6902 patches stream to the client which applies them.

Why this is excellent:
- **One mechanism for everything.** New chapters, step status flips, popover text growth — all the
  same wire format. No zoo of ad-hoc SSE event types.
- **Replay is free.** The final document *is* the run record; history mode replays it without a
  second code path for parsing events.
- **It teaches the real thing.** Production agent UIs (Claude, Vercel AI SDK) converge on
  "stream deltas into a client-side state tree." You built the general version.

## 2. Orchestrator without an LLM; LLM only in the leaves

The LangGraph `StateGraph` is deterministic — it dispatches subagents in a fixed loop and never
calls a model itself. All intelligence lives in three narrow calls.

Why: control flow you can unit-test, costs you can predict, and the orchestrator becomes a
**swap seam** — exactly what "simple now, scalable later" requires. This is the architecture
Anthropic's "Building Effective Agents" calls *workflows before agents*: don't give a model
autonomy where a `for` loop will do.

## 3. The Planner / Stepper / Narrator split

Three focused calls instead of one monolith with a growing history.

Why: each call gets a **scoped context** (plan sees the whole tree; stepper sees one chapter's
focused projection; narrator sees one step). That is context engineering in miniature — the prompt
of each call contains only what that decision needs. It also gives you per-role model choice and
per-role evaluation for free later.

## 4. The closed context set

"The agent only sees: DB rows, `hostState`, `hostTools`, prior messages. No HTML fetch, no scrape."

Why: a **trust boundary you can state in one sentence**. Every context source is enumerable,
inspectable, and testable. When something is wrong in an answer, there are exactly four places to
look. Keep this rule forever; extend the set deliberately (v2 adds `hostKnowledge` as a fifth).

## 5. Pre-mount buffered `window.eregna`

The IIFE installs a shim synchronously; host calls before React mounts are buffered and drained.

Why: this is correct embed engineering — the host page must never need to know *when* your widget
is ready. Most real-world embeds (analytics snippets, Intercom) use the same queue trick.

## 6. Structured outputs over forced tool calls

Subagents use `withStructuredOutput` / `.stream()`; tool calling is reserved for when a model has
a genuine *choice*.

Why: forcing a tool call to extract JSON conflates two ideas. Schema-constrained output for
"fill this shape"; tools for "decide among actions." Knowing the difference is a core
agent-building skill.

## 7. Decision-log documentation style

Every v1 decision has a reason and an "if overridden, these files change" note.

Why: docs that record *why* survive contact with change. v2 keeps the convention.

## 8. Shapes lifted into a shared package

`packages/walkthrough-core` letting API and widget import identical types — one contract,
two consumers, drift caught by the compiler.
