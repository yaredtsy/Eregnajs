# tutorial/10 — Rendering on the widget

Files:

```
packages/widget/src/chat/agent/runStream.ts          ← drives the run
packages/widget/src/chat/protocol/consumeStream.ts   ← parses NDJSON lines
packages/walkthrough-core/src/conversation/applyPatch.ts  ← applies patches
packages/widget/src/hooks/useAgentRun.tsx            ← React glue
```

This is the browser side. Three layers:

1. **Transport** — read NDJSON bytes, split lines, parse JSON.
2. **Apply** — apply each patch to the local `Conversation`.
3. **React** — re-render messages from the updated conversation.

## Layer 1: `consumeAgentStream`

```ts
export async function consumeAgentStream(body: ReadableStream<Uint8Array>, handlers): Promise<StreamConsumeResult>
```

It reads from a `fetch` response body and:

- Splits on `\n`. Anything after the last `\n` is buffered until the next chunk.
- `JSON.parse`s each line.
- If `isChatEvent(parsed)` → `handlers.onChatEvent(parsed)`. Also captures `runId` from `run-started` and notes `paused = true` on `pending-tool-call`.
- Else → tries `toRunFrame(parsed)`. If it's `hello` / `patch` / `end` → `handlers.onFrame(frame)`.

The return value tells the caller why the loop stopped:

```ts
return { endReceived, paused, pendingToolCall, runId }
```

- `endReceived: true` — got an `end` frame. Done.
- `paused: true` — got a `pending-tool-call`. Resume needed.
- `paused: false && !endReceived` — connection died without an `end`. Caller throws.

## Layer 2: `applyPatchFrame`

The widget keeps a `Conversation` object in React state (the `WidgetProvider` reducer). On every `patch` frame:

```ts
state.conversation = applyPatchFrame(state.conversation, frame)
```

`applyPatchFrame` is **immutable** — it returns a new `Conversation` where only nodes on the modified path are cloned. Everything else keeps the same reference.

For example, this op:

```json
{"op": "string-append", "path": "/messages/1/parts/0/text", "value": "page "}
```

clones:

- the top `Conversation`,
- `messages` (new array, same elements except index 1),
- `messages[1]` (new object, same fields except `parts`),
- `parts` (new array, same elements except index 0),
- `parts[0]` (new object, new `text`).

Other messages, other parts, the `metadata` object — **same reference**. React's reconciler skips them by reference equality. Long chats stay fast.

The same function handles `string-append`, `add`, `replace`, `remove`. It ignores `move` / `copy` / `test` (our patcher never emits them).

## Layer 3: `runStream` — the loop

```ts
export async function runStream(opts: RunStreamOptions): Promise<void>
```

Drives a full turn:

```
POST /public/agent/run        → outcome
while (outcome.paused) {
   tell UI: tool is "pending" then "running"
   exec   = await executeClientTool(name, args)
   tell UI: tool is "done" or "error"
   outcome = await resumeStream({ runId, toolCallId, result | error })
}
if (!endReceived && !paused) throw "stream closed without an end frame"
```

Both `runStreamOnce` (the first POST) and `resumeStream` (the resume POST) call `consumeAgentStream` under the hood and return its `StreamConsumeResult`.

The same `onFrame` and `onChatEvent` callbacks are passed through both — so the React reducer sees one continuous stream of patches, even though it's two HTTP requests.

## Layer 4: `useAgentRun` — React glue

`RunSessionProvider` exposes `mountReady(...)` to the host page. When the host calls `eregna.ask("...")`:

1. The provider builds an `AbortController`.
2. Calls `runStream(...)` with:
   - `onFrame` → dispatch a `PATCH` action to the reducer.
   - `onChatEvent` → dispatch lifecycle actions (start, complete, error) and update tool-call UI.
3. On stop, aborts the controller; `consumeAgentStream` exits the read loop; `runStream` returns.

## Where the typewriter effect comes from

We do **not** animate text on the widget. The model decides token timing — the browser just shows each chunk as it arrives. That looks like a typewriter because LLMs stream a few tokens at a time.

(The walkthrough player **does** animate text — but that is a different code path using `TYPEWRITER_MS_PER_CHAR`. The chat agent does not use it.)

## Why this layering helps

- `consumeAgentStream` knows nothing about React. You can unit-test it with a `ReadableStream` made from a string of NDJSON lines.
- `applyPatchFrame` is a pure function. Easy to test, easy to snapshot.
- `runStream` is the only place that knows about pause/resume.
- `useAgentRun` is the only place that knows about React.

Swap any layer without touching the others.

Next: [how we build the system prompt →](11-prompt-composition.md)
