# 06 — Patcher and Wire

> **As-built note (2026-06):** the wire now has an envelope — first line `{kind:"hello", runId, protocol, conversation}`, then `{kind:"patch", seq, ops}`, always a terminal `{kind:"end", status, message?}` (docs/v2 `2-system/02-contracts.md` §5). Streamability is decided by terminal field name (`text`/`body`/`detail`), not full-path regexes — the original regexes missed step popovers entirely. See `patcher/streamablePaths.ts` + `patcher.test.ts`.

> How mutations on the in-memory `Conversation` mirror become NDJSON-of-JSON-Patch frames on the wire. `fast-json-patch` does the heavy lifting via its `observe()` API — the orchestrator and patch helpers mutate plain objects; ops are emitted automatically; one writer pipes them as NDJSON.

Folders: `apps/api/src/services/agent/patcher/`, `apps/api/src/services/agent/transport/`, and the widget's `packages/walkthrough-core/src/conversation/applyPatch.ts`.

---

## 1. The split: patch helpers vs. Patcher vs. transport

| Layer       | Knows                                                                | Doesn't know                          |
|-------------|----------------------------------------------------------------------|---------------------------------------|
| Patch helpers | The shape of the conversation. How to mutate it. (`startWalkthrough`, `addChapter`, `openStep`, `appendAction`, `popoverChunk`, …) | What's a patch, what's a frame, what's NDJSON. |
| Patcher     | The mirror reference. The `fast-json-patch.observe` handle. How to compute pending ops. How to assign `seq` and emit a frame. | Conversation semantics. The wire format details beyond "one frame per emit". |
| Transport   | How to write a frame as one NDJSON line on the Hono response stream.  | What's inside the frame.              |

These are three small files with one job each.

---

## 2. `fast-json-patch.observe` in one paragraph

`observe(obj)` returns a `JsonPatchObserver` that snapshots `obj` and, on each call to `generate()`, returns the JSON Patch ops representing the mutations since the last call (or since `observe`). It mutates by reference — we modify `obj.messages[2].parts[1].steps[0].popover.body += "..."` and `generate()` gives back `[{ op: "replace", path: "/messages/2/parts/1/steps/0/popover/body", value: "..."}]`.

We don't want `replace` for body though — we want `add` with append semantics (see §6). The observer always emits `replace` for in-place string mutations, so we transform `replace` → `add` for known text-streamable paths before emitting. One small filter; see §5.3.

---

## 3. Patch helpers — the orchestrator's only mutation surface

```
apps/api/src/services/agent/patcher/helpers.ts
```

The orchestrator and sub-agent callers never write paths by hand. They call typed helper functions; the helper knows where to write.

```ts
// apps/api/src/services/agent/patcher/helpers.ts
import type { Conversation, Message, WalkthroughPart, WalkthroughStep } from "@repo/walkthrough-core"
import { nanoid } from "nanoid"

export interface PatchHelpers {
  // user side
  appendUserMessage(c: Conversation, text: string): Message

  // assistant lifecycle
  appendAssistantMessage(c: Conversation): Message
  appendAssistantText(m: Message, chunk: string): void
  setMessageStatus(m: Message, s: Message["status"]): void

  // walkthrough lifecycle
  startWalkthrough(m: Message, p: { planGoal: string; planRationale?: string }): WalkthroughPart
  addChapter(wt: WalkthroughPart, c: { title: string; description: string; elementId: string }): void
  setChapterStepIndex(wt: WalkthroughPart, chapterIndex: number, stepIndex: number): void
  setWalkthroughStatus(wt: WalkthroughPart, s: WalkthroughPart["status"]): void

  // step lifecycle
  openStep(wt: WalkthroughPart, chapterIndex: number, popoverMeta?: { title?: string; elementId?: string }): WalkthroughStep
  appendAction(step: WalkthroughStep, action: WalkthroughAction): void
  popoverChunk(step: WalkthroughStep, chunk: string): void
  setStepStatus(step: WalkthroughStep, s: WalkthroughStep["status"], skipReason?: string): void

  // failure
  failWalkthrough(c: Conversation, message: string): void
}

export function createPatchHelpers(): PatchHelpers {
  return {
    appendUserMessage(c, text) {
      const m: Message = { id: nanoid(8), role: "user", parts: [{ type: "text", text }], status: "complete", createdAt: Date.now() }
      c.messages.push(m)                                  // observed → add /messages/-
      return m
    },
    appendAssistantMessage(c) {
      const m: Message = { id: nanoid(8), role: "assistant", parts: [{ type: "text", text: "" }], status: "streaming", createdAt: Date.now() }
      c.messages.push(m)
      return m
    },
    appendAssistantText(m, chunk) {
      const part = m.parts[0]
      if (part.type === "text") part.text += chunk        // observed → "replace .../text", transformed to "add" by the patcher
    },
    setMessageStatus(m, s) { m.status = s },              // observed → replace /messages/N/status
    // ... (each helper is one or two lines)
    startWalkthrough(m, { planGoal, planRationale }) {
      const wt: WalkthroughPart = {
        type: "walkthrough", walkthroughId: nanoid(8),
        planGoal, planRationale, status: "planning",
        chapters: [], steps: [], parentContext: null,
      }
      m.parts.push(wt)
      return wt
    },
    addChapter(wt, c) {
      wt.chapters.push({ ...c, stepIndex: -1 })           // observed → add /parts/.../chapters/-
    },
    setChapterStepIndex(wt, i, stepIndex) { wt.chapters[i].stepIndex = stepIndex },
    setWalkthroughStatus(wt, s) { wt.status = s },
    openStep(wt, chapterIndex, popoverMeta) {
      const step: WalkthroughStep = {
        id: nanoid(8), actions: [],
        popover: popoverMeta ? { ...popoverMeta, body: "" } : undefined,
        status: "pending",
      }
      wt.steps.push(step)
      return step
    },
    appendAction(step, action) { step.actions.push(action) },
    popoverChunk(step, chunk) {
      if (!step.popover) return
      step.popover.body += chunk                          // observed → "replace .../body", transformed to "add"
    },
    setStepStatus(step, s, skipReason) {
      step.status = s
      if (skipReason !== undefined) step.skipReason = skipReason
    },
    failWalkthrough(c, message) {
      const last = c.messages.at(-1)
      if (last) last.status = "error"
      // Surface the error somewhere visible — convention is a final text part:
      if (last?.role === "assistant" && last.parts[0].type === "text") last.parts[0].text += `\n\n[error] ${message}`
    },
  }
}
```

Each helper is one or two lines. The semantic meaning is in the helper's name; the patcher takes care of the wire.

Where validation lives:
- **Helpers do no validation.** They are dumb mutators. Validating "is this elementId in the registry?" belongs to the caller — usually the workflow node that received a sub-agent's output. Helpers stay tiny.

---

## 4. The Patcher

```
apps/api/src/services/agent/patcher/createPatcher.ts
```

```ts
import { observe, type JsonPatchOperation } from "fast-json-patch"

export type EmitFrame = (frame: PatchFrame) => Promise<void>

export interface PatchFrame {
  seq: number
  ops: JsonPatchOperation[]
}

export interface Patcher {
  emit(): Promise<void>                       // flush observed mutations as one frame
  getLog(): PatchFrame[]                      // in-memory copy, for persistence at end of run
  snapshot(): Conversation                    // current mirror state
}

export function createPatcher(conversation: Conversation, emit: EmitFrame): Patcher {
  const observer = observe<Conversation>(conversation)
  const log: PatchFrame[] = []
  let seq = 0

  return {
    async emit() {
      const raw = observer.generate()         // accumulated ops since last call
      if (raw.length === 0) return            // nothing to send
      const ops = raw.map(transformStringAppend(conversation))
      const frame: PatchFrame = { seq: seq++, ops }
      log.push(frame)
      await emit(frame)
    },
    getLog()  { return log.slice() },
    snapshot() { return conversation },
  }
}
```

The orchestrator calls `patcher.emit()` between groups of mutations (typically: after each helper call that produces a visible change). Frame size:
- **One op per frame** is the default and gives the smoothest UX (each chapter row, each action, each text chunk = one frame).
- **Multiple ops per frame** happens naturally if the orchestrator does several helper calls without an intervening `await patcher.emit()`. We use this for "atomic transitions" like flipping both `walkthrough.status` and `message.status` at the end.

---

## 5. String-append transformation

### 5.1 The need

`fast-json-patch.observe` emits `op: "replace"` for in-place string mutations. We want incremental text on the widget — applying `replace` to a 5-character `body` and then `replace` to a 12-character `body` works, but it sends the **entire current string** every time, blowing up bandwidth and forcing the widget to re-render the full body on each patch.

Instead, our text-streaming convention says:

> For a known string-valued path, `op: "add"` with the *delta* (the new characters only) means "append to the existing string."

The Patcher transforms `replace` → `add` with the delta for known streamable paths. The widget's `applyPatch` (next section) has the inverse interpretation.

### 5.2 Streamable paths

Hard-coded set (small enough to list):

```ts
// patcher/streamablePaths.ts
const STREAMABLE_PATTERNS: RegExp[] = [
  /^\/messages\/\d+\/parts\/\d+\/text$/,                                                    // assistant text
  /^\/messages\/\d+\/parts\/\d+\/planGoal$/,
  /^\/messages\/\d+\/parts\/\d+\/planRationale$/,
  /^\/messages\/\d+\/parts\/\d+\/steps\/\d+\/popover\/body$/,
  /^\/messages\/\d+\/parts\/\d+\/steps\/\d+\/popover\/title$/,
  /^\/messages\/\d+\/parts\/\d+\/steps\/\d+\/skipReason$/,
]

export function isStreamable(path: string): boolean {
  return STREAMABLE_PATTERNS.some(rx => rx.test(path))
}
```

Adding a new streamable text field = appending one regex.

### 5.3 The transform

```ts
// patcher/transformStringAppend.ts
import { isStreamable } from "./streamablePaths"
import { getValueByPointer } from "fast-json-patch"

export function transformStringAppend(snapshot: Conversation) {
  // Track last emitted length per path, so we can compute the delta.
  const lastLen: Record<string, number> = {}

  return (op: JsonPatchOperation): JsonPatchOperation => {
    if (op.op !== "replace") return op
    if (!isStreamable(op.path)) return op
    if (typeof op.value !== "string") return op

    const prevLen = lastLen[op.path] ?? 0
    const newStr  = op.value as string
    const delta   = newStr.slice(prevLen)
    lastLen[op.path] = newStr.length
    return { op: "add", path: op.path, value: delta }
  }
}
```

The first mutation to a path emits the whole initial string as an `add` (because `prevLen` is 0). Subsequent mutations emit only the new tail.

The widget's `applyPatch` recognises `add` on an existing string and concatenates rather than replacing.

---

## 6. Client-side `applyPatch` (widget)

```
packages/walkthrough-core/src/conversation/applyPatch.ts
```

```ts
import { applyOperation, getValueByPointer, type JsonPatchOperation } from "fast-json-patch"

export function applyOps(state: Conversation, ops: JsonPatchOperation[]): Conversation {
  let next = state
  for (const op of ops) next = applyOne(next, op)
  return next
}

function applyOne(state: Conversation, op: JsonPatchOperation): Conversation {
  if (op.op === "add") {
    const current = getValueByPointer(state, op.path)
    if (typeof current === "string" && typeof op.value === "string") {
      // string-append convention
      return applyOperation(state, { op: "replace", path: op.path, value: current + op.value }, false, false).newDocument
    }
  }
  return applyOperation(state, op, false, false).newDocument
}
```

`applyOperation(_, _, false, false)` runs without mutating the input and without strict validation (mutation is what `applyOperation` does by default; we want immutable for React rendering). `fast-json-patch` actually mutates; we deep-clone before the call in the widget reducer:

```ts
// packages/widget/src/agent/store.ts (case in the reducer)
case "APPLY_PATCH": {
  const next = applyOps(structuredClone(state.conversation), action.ops)
  return { ...state, conversation: next }
}
```

`structuredClone` is fine for this scale; the conversation is small (< 100 KB even for long runs). If profiling later shows hot-path overhead, switch to Immer or `fast-json-patch`'s `applyPatch(_, ops, false, false)` with a manual snapshot of touched subpaths.

---

## 7. Frame format on the wire

NDJSON. One JSON object per line, separated by `\n`.

```
{"seq":0,"ops":[{"op":"add","path":"/messages/-","value":{"id":"msg_u","role":"user","parts":[{"type":"text","text":"how do I cancel?"}],"status":"complete","createdAt":1717804800000}}]}
{"seq":1,"ops":[{"op":"add","path":"/messages/-","value":{"id":"msg_a","role":"assistant","parts":[{"type":"text","text":""}],"status":"streaming","createdAt":1717804800000}}]}
{"seq":2,"ops":[{"op":"add","path":"/messages/1/parts/0/text","value":"Let me walk you through this."}]}
{"seq":3,"ops":[{"op":"add","path":"/messages/1/parts/-","value":{"type":"walkthrough","walkthroughId":"wt_1","planGoal":"","planRationale":"","status":"planning","chapters":[],"steps":[],"parentContext":null}}]}
{"seq":4,"ops":[{"op":"add","path":"/messages/1/parts/1/planGoal","value":"Cancel your Pro plan"}]}
{"seq":5,"ops":[{"op":"add","path":"/messages/1/parts/1/chapters/-","value":{"title":"Open Billing","description":"Navigate to billing settings","elementId":"billing-link","stepIndex":-1}}]}
...
{"seq":42,"ops":[{"op":"replace","path":"/messages/1/parts/1/status","value":"complete"},{"op":"replace","path":"/messages/1/status","value":"complete"}]}
```

Properties:
- `seq` is monotonic from 0. Phase 2 resume reads `lastAppliedSeq` and asks the server to start from `seq+1`.
- `ops` always has ≥ 1 element when a frame is emitted.
- The last frame ends with a `replace` to the assistant message's `status` of `complete` or `error`.

---

## 8. Server transport

```
apps/api/src/services/agent/transport/ndjson.ts
```

```ts
import { stream } from "hono/streaming"
import type { Context } from "hono"
import type { EmitFrame } from "../patcher/createPatcher"

export function ndjsonStreamFor(c: Context): { emit: EmitFrame; signal: AbortSignal } {
  let resolveSignal!: AbortController
  resolveSignal = new AbortController()

  // Hono's stream(): the callback runs until it resolves; aborts when client disconnects.
  c.header("Content-Type", "application/x-ndjson")
  let writeLn!: (s: string) => Promise<void>
  let done!: () => void

  stream(c, async (s) => {
    writeLn = (line) => s.writeln(line)
    s.onAbort(() => resolveSignal.abort("client-disconnect"))
    await new Promise<void>(r => { done = r })
  })

  return {
    signal: resolveSignal.signal,
    async emit(frame) { await writeLn(JSON.stringify(frame)) },
  }
}
```

`done()` is called by the route handler when the workflow resolves; that unblocks the `stream()` callback and closes the response.

---

## 9. Client transport

```
packages/widget/src/agent/runStream.ts
```

```ts
import { applyOps } from "@repo/walkthrough-core/conversation/applyPatch"

export async function runStream(opts: { url: string; body: unknown; dispatch: Dispatch }, signal?: AbortSignal) {
  const res = await fetch(opts.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
    body: JSON.stringify(opts.body),
    signal,
  })
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let buf = ""
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buf += value
    let nl: number
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (line.length === 0) continue
      const frame = JSON.parse(line) as PatchFrame
      opts.dispatch({ type: "APPLY_PATCH", ops: frame.ops })
    }
  }
}
```

~25 LOC, no library. The widget reducer's `APPLY_PATCH` case calls `applyOps`.

---

## 10. Failure modes on the wire

| Failure                                  | Surfaced as                                                                                 |
|------------------------------------------|---------------------------------------------------------------------------------------------|
| Client disconnects                       | Hono's `signal` aborts; LangGraph cancels in-flight LLM call; orchestrator emits final `error` patch and `runs.save({ status: "aborted" })`. |
| Server throws before any patch           | Route returns HTTP 5xx; widget surfaces a generic error in the chat.                        |
| Server throws mid-stream                 | `helpers.failWalkthrough` runs in the `run.ts` catch block; final patch flips `Message.status` to `"error"` with the message appended as text; stream then closes normally. |
| Frame fails to JSON-parse on the client  | Widget logs; ignores that frame; subsequent frames still apply.                              |
| Out-of-order frames (shouldn't happen with Hono single-writer) | Widget detects gap via `seq`; logs; applies anyway (idempotency of `add` to arrays makes this safe for most cases). |

---

## 11. Module file list

```
apps/api/src/services/agent/patcher/
├── createPatcher.ts
├── helpers.ts                       # PatchHelpers implementation
├── streamablePaths.ts
└── transformStringAppend.ts

apps/api/src/services/agent/transport/
└── ndjson.ts

packages/walkthrough-core/src/conversation/
└── applyPatch.ts                    # applyOps (client + server share this for the mirror)

packages/widget/src/agent/
└── runStream.ts
```

`createPatcher.ts` < ~50 LOC. `helpers.ts` ~140 LOC (one of the larger files; consider splitting per-domain when it grows). `transformStringAppend.ts` < ~30 LOC. `ndjson.ts` < ~40 LOC. `applyPatch.ts` < ~30 LOC. `runStream.ts` < ~30 LOC.

---

## 12. References

- `01-conversation-shape.md` — the document the helpers mutate.
- `04-workflow.md` — the orchestrator's call sites for helpers and `patcher.emit()`.
- `05-subagents.md` — the data the helpers receive from sub-agents.
- `08-engine.md` — what the widget does with the patched `Conversation`.
- `10-libraries.md` — `fast-json-patch`, Hono streaming, native fetch streams.
