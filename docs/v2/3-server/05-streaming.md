# 3.5 — Streaming

> The patcher and the wire. Built and conceptually right; v2 hardens it and adds the envelope.

> **What you're learning here:** streaming as *state replication* (not message passing) — the
> server replicates a document to the client; everything else (thinking tickers, step rails,
> chat bubbles) is rendering. Plus: protocol robustness — sequence numbers, terminal frames,
> append semantics.

---

## 1. The mental model

```
server: mutate conversation ──▶ patcher observes ──▶ ops ──▶ frames ──▶ NDJSON
client: NDJSON ──▶ applyPatch(conversation, ops) ──▶ store ──▶ React re-render
```

The patcher (`patcher/createPatcher.ts`, built) wraps `fast-json-patch`'s observer: subagent code
just mutates the document; patches are a side effect. Nodes never construct ops by hand —
preserve this; it's what keeps orchestration code readable.

## 2. The wire (v2 envelope, from `2-system/02` §5)

`hello` (seeded conversation + runId + protocol) → `patch`* (seq + ops) → `end` (status, always).

Client rules: ignore unknown `kind`s (forward compat); a `seq` gap = broken stream → treat as
`end:error` (MVP: surface "connection lost", no resume); `end` is the *only* way a run concludes.

## 3. String-append, hardened (fix #7)

The append transform (`transformStringAppend.ts`, built) turns repeated `replace` ops on growing
text into `append` ops so the client never re-renders a whole paragraph per token.

v2 change: streamability is decided by **terminal field name** — `body`, `text`, `detail` — via one
set: `STREAMABLE_LEAVES = new Set(["body","text","detail"])`, checked against the last path
segment. The current full-path regexes break silently when the document shape shifts (e.g.
`thoughts` arriving before `steps` changes indices — regexes keyed on positions rot).
Add the test: replay a recorded run's mutation log through the patcher, assert byte-identical
final documents server-side and client-side.

## 4. Ordering and small invariants

- One patcher per run; `seq` strictly increments; frames are written in mutation order.
  NDJSON over one HTTP stream preserves order — no reordering problem *until* WebSockets, which is
  why `seq` exists already.
- Mutations must be *granular* (push one thought, append one chunk) — a node that builds a big
  object and assigns it in one go produces one giant `replace`, which still works but defeats
  progressive rendering. Convention, enforced by review.
- Backpressure (noted in 0.3 §9): `await stream.write(frame)` — Bun/Hono's writer returns a
  promise; awaiting it is the entire fix. A slow visitor connection then naturally slows token
  consumption via the awaited chain.

## 5. Why thoughts/plans need nothing new

The thinking ticker, plan panel, and step rail (`4-client/02`) are *renderings of document paths*:

| UI element | Document path |
|---|---|
| thinking ticker | `…/thoughts[*].label` (appends) |
| plan panel | `…/chapters[*]` + `status` |
| step rail / popover | `…/steps[*]` + `popover.body` (appends) |
| red segment | `chapters[*].status === "failed"` / steps' `skipped` |

This is the payoff of state replication: **five new UI features, zero new wire features.** When
you later want, say, a progress percentage, the question is never "what event do I add?" but
"what field does the document need?"

## 6. As-built inventory

| File | Status | v2 change |
|---|---|---|
| `patcher/createPatcher.ts` | keep | — |
| `patcher/transformStringAppend.ts` | keep | — |
| `patcher/streamablePaths.ts` | replace | leaf-name set (§3) |
| `transport/ndjson.ts` | keep | envelope frames + awaited writes |
| widget `agent/runStream.ts` | keep | envelope handling + `end` timeout (60s no-frame watchdog) |
