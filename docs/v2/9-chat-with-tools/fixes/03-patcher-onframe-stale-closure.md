# Fix 03 — patcher writes to the closed `/agent/run` stream on resume

> **Smoking-gun symptom:** the `/agent/resume` response NDJSON contains
> only chat events (`run-resumed`, `text-delta`, `message-complete`,
> `end`) and **zero** `patch` frames — yet the `end` frame's
> `seq` field shows the patcher's log grew (e.g. `seq: 14` when only
> 3 patches appeared on `/run`). The patcher *emitted* the patches;
> they were written into a closed pipe and silently dropped.

---

## Why the wire log proves it

Concrete numbers from the captured run:

```
/run    →  3 patches (seq 0, 1, 2) + chat events
/resume →  0 patches              + text-delta chat events
end     →  seq: 14
```

`end.seq` comes from `cached.patcher.getLog().length`
(`chat/resume.ts:91`). `getLog()` is appended to every time
`patcher.emit()` produces ops. So 14 total emitted → 11 emitted on
the resume side → **none of those 11 reached the wire**.

If the patcher were no-op'ing (Fix 02's failure mode), the log
wouldn't grow and `end.seq` would still be `3`. The log *did* grow.
That rules out "indices wrong / appendTextChunk skipping". The
patches were emitted into the void.

---

## Root cause: closure over the wrong HTTP stream

`patcher/createPatcher.ts:12-30`:

```ts
export function createPatcher(
  initialConversation: Conversation,
  onFrame: (frame: PatchFrame) => Promise<void>,        // ◄ captured
): Patcher {
  // ...
  async function emit(): Promise<void> {
    const rawOps = generate(observer);
    if (rawOps.length === 0) return;
    const wireOps = rawOps.map((op) => transform(op));
    const frame: PatchFrame = { seq: seq++, ops: wireOps as PatchFrame["ops"] };
    log.push(frame);
    await onFrame(frame);          // ◄ closure to /run's writeFrame
  }
  // ...
}
```

`chat/run.ts:49-51`:
```ts
const patcher = createPatcher(initialConv, (frame) =>
  opts.onFrame({ kind: "patch", ...frame }),         // ◄ /run's onFrame
);
```

`chat/run.ts:111` caches the patcher (with that closure baked in).
`/run`'s HTTP stream closes when the run returns `"paused"`.

`chat/resume.ts:54-63` reuses the cached patcher unchanged:
```ts
const result = await streamAgent({
  agent: cached.agent,
  input: new Command({ resume: resumeValue }),
  config,
  emit: (e) => emitChat(opts.onChatEvent, e),    // ◄ NEW resume stream
  patcher: cached.patcher,                       // ◄ OLD closure inside
  ...
});
```

`streamAgent.ts:60-64`:
```ts
h.appendTextChunk(patcher.conversation, ...);
await patcher.emit();                           // ◄ writes to DEAD /run stream
await emit({ kind: "text-delta", text });       // ◄ writes to LIVE /resume stream
```

`transport/ndjson.ts:26-34` (the closed pipe):
```ts
async writeFrame(frame): Promise<void> {
  if (closed) return;                            // ◄ silently drops everything
  try { await writer.write(encoder.encode(...)); }
  catch { closed = true; }
},
```

So `patcher.emit()` succeeds (no throw), the log grows, the wire is
empty for patches. Chat events bypass the patcher entirely and use
the new resume stream's `onChatEvent` — hence they appear.

```
                 cached.patcher (created during /run)
                            │
              ┌─────────────┴──────────────┐
              ▼                            ▼
        conversation                    onFrame  ──► closure ──► /run's stream.writeFrame
        (live, mutated by                                           │
         streamAgent)                                               ▼
                                                            (closed; bytes dropped)


   /resume's stream  ◄── only chat events reach it (via opts.onChatEvent,
                          passed directly to streamAgent — bypasses patcher)
```

---

## Why we kept missing it

- Fix 01 corrected mutations to land on `patcher.conversation` (real).
- Fix 02 chased `appendTextChunk` no-op'ing (it isn't — the log grew).
- The patcher's `emit()` doesn't throw or report when the underlying
  stream is closed — `writeFrame`'s `if (closed) return` is silent
  by design (originally for clean client-disconnect handling).
- `text-delta` chat events still appear because they go through a
  **different** callback (`opts.onChatEvent`), which **is** the new
  resume stream. That's why the wire looked "almost right".

---

## Fix: let the patcher's `onFrame` be re-wired on resume

Add one method on the `Patcher` interface, implement it as a mutable
slot, and call it from `chat/resume.ts` before `streamAgent` runs.

### 1. `patcher/createPatcher.ts`

```ts
export interface Patcher {
  conversation: Conversation;
  emit(): Promise<void>;
  getLog(): PatchFrame[];
  setOnFrame(fn: (frame: PatchFrame) => Promise<void>): void;   // ◄ new
}

export function createPatcher(
  initialConversation: Conversation,
  onFrame: (frame: PatchFrame) => Promise<void>,
): Patcher {
  const conv = structuredClone(initialConversation) as Conversation;
  const observer: Observer<Conversation> = observe(conv);
  const transform = makeTransformer(conv as object);
  const log: PatchFrame[] = [];
  let seq = 0;
  let send = onFrame;                                            // ◄ mutable slot

  async function emit(): Promise<void> {
    const rawOps = generate(observer);
    if (rawOps.length === 0) return;
    const wireOps: WireOp[] = rawOps.map((op) => transform(op));
    const frame: PatchFrame = { seq: seq++, ops: wireOps as PatchFrame["ops"] };
    log.push(frame);
    await send(frame);                                            // ◄ uses slot
  }

  return {
    conversation: conv,
    emit,
    getLog: () => log,
    setOnFrame: (fn) => { send = fn; },                           // ◄ swap
  };
}
```

### 2. `chat/resume.ts`

Right after `lookupRun` returns the cached run, re-wire the patcher
to the *new* HTTP stream:

```ts
const cached = lookupRun(opts.runId)!;

// Re-point the patcher at THIS request's stream — the closure from the
// original /agent/run write to a now-closed pipe.
cached.patcher.setOnFrame((frame) =>
  opts.onFrame({ kind: "patch", ...frame }),
);

// ... unchanged below ...
```

That's the whole fix. No new abstractions, no API surface changes
beyond one method.

---

## Why this is the right shape (and not "recreate the patcher")

You can't recreate the patcher on resume — the observer carries the
"last seen state" snapshot. A fresh observer would compute the
diff from an empty conversation and re-emit *all* prior ops as new
frames. The widget would get duplicates and the seq numbers would
collide. Mutating the slot keeps the observer's state intact while
swapping just the egress.

The pattern also generalises: if you later add `/agent/resume` calls
for multi-tool chains, each one re-points the patcher to its own
stream before invoking `streamAgent`. The patcher's identity (and
its log) persists across the whole logical turn.

---

## Verification

After applying:

- [ ] `/agent/resume` response contains `patch` frames with
      `string-append` ops on `/messages/1/parts/0/text` between every
      `text-delta` chat event.
- [ ] The seq numbers continue from where `/run` left off (so if
      `/run` ended on `seq: 2`, the first resume patch is `seq: 3`).
- [ ] `end.seq` equals the count of patches actually on the wire.
- [ ] The widget renders the assistant prose after the tool card.
- [ ] React DevTools: `state.conversation.messages[1].parts[0].text`
      grows from `""` to the full reply during resume.

---

## Defensive follow-up (don't silently swallow next time)

The reason this slipped past Fix 02's diagnostics: a write to a
closed pipe was indistinguishable from a successful write. Consider
either:

1. **Log a warning** in `transport/ndjson.ts:27` when `closed` is hit
   *after* the first frame was successfully written (i.e. the stream
   closed mid-run, which usually means a real disconnect — but should
   never happen for the very-next emit if everything is wired right).
2. **Throw on writes to a closed stream** that's still being held by
   logic that expects it to be open. Catch at the boundary.

Either turns this class of bug from "silent text disappears" into
"explicit attributable failure". Worth doing once, never again.

---

## Related

- `01-patcher-conv-divergence.md` — same family: server-side state
  diverges from what the widget sees.
- `02-text-not-rendering-after-tool.md` — diagnosed the same symptom
  one level too high; this fix is the actual root cause.
- `apps/api/src/services/agent/patcher/createPatcher.ts` — where the
  closure is captured.
- `apps/api/src/services/agent/chat/resume.ts` — where the re-wire
  belongs.
