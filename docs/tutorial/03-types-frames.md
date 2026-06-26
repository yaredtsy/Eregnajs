# tutorial/03 — Types: Frames on the wire

All types in this file live in:

```
packages/walkthrough-core/src/patch/types.ts
```

A **frame** is one line of NDJSON on the response. The server writes one JSON object per line. The browser reads one line at a time and decides what to do.

There are three kinds of frame. Every run starts with one `hello`, has zero or more `patch`s in the middle, and ends with exactly one `end`.

```
hello → patch → patch → patch → ... → end
```

## `HelloFrame` — the first line

```ts
export const WIRE_PROTOCOL = 2

export interface HelloFrame {
  kind: "hello"
  runId: string
  protocol: number
  conversation: Conversation     // the starting document
}
```

The server sends this **before any patch**. It hands the client the full starting document, so the client knows what the patches apply to.

- `runId` — the id of this run. The client keeps it because if the agent pauses, it needs the runId to call `/resume`.
- `protocol` — version of the wire shape (currently `2`). If a client sees a different number, it can refuse.
- `conversation` — the full starting `Conversation`. Often this is what the client sent up plus a new empty assistant message.

## `PatchRunFrame` — the middle lines

```ts
export interface PatchRunFrame extends PatchFrame {
  kind: "patch"
}

export interface PatchFrame {
  seq: number
  ops: WireOp[]
}
```

- `seq` — a counter that goes up by 1 each frame. Helps detect lost or out-of-order frames.
- `ops` — a list of small changes to the `Conversation`.

### `WireOp` — the small changes

```ts
export type WireOp = JsonPatchOp | StringAppendOp
```

Two kinds:

1. **`JsonPatchOp`** — standard [JSON Patch (RFC 6902)](https://datatracker.ietf.org/doc/html/rfc6902). The ops we actually use are `add`, `replace`, and `remove`.
2. **`StringAppendOp`** — our own op. It is the one that makes streaming feel fast:

```ts
export interface StringAppendOp {
  op: "string-append"
  path: string         // e.g. "/messages/3/parts/0/text"
  value: string        // e.g. "hello"  → append "hello" to that string
}
```

Without `string-append`, every new token would have to send the **whole text so far** as a `replace`. That is many bytes for long messages. With `string-append`, each token is just the new characters.

`isStringAppend(op)` is the type guard:

```ts
export function isStringAppend(op: WireOp): op is StringAppendOp {
  return (op as StringAppendOp).op === "string-append"
}
```

## `EndFrame` — the last line

```ts
export interface EndFrame {
  kind: "end"
  seq: number
  status: "complete" | "error"
  message?: string         // present on error
}
```

The server always sends this, even on failure. The client must never hang waiting. If the connection drops without an `end`, the widget surfaces "stream closed without an end frame".

## `RunFrame` — the union

```ts
export type RunFrame = HelloFrame | PatchRunFrame | EndFrame
```

The widget's `onFrame` callback receives values of this type.

## How the server builds frames

The `Patcher` (in `services/agent/patcher/createPatcher.ts`) watches the conversation with `fast-json-patch`'s `observe`. When you call `patcher.emit()`, it asks the observer for any new diffs, transforms text replacements into `string-append` ops where safe, wraps them in a `PatchFrame { seq, ops }`, and calls `onFrame`. You never build a frame by hand.

```ts
async function emit(): Promise<void> {
  const rawOps = generate(observer)
  if (rawOps.length === 0) return
  const wireOps: WireOp[] = rawOps.map((op) => transform(op))
  const frame: PatchFrame = { seq: seq++, ops: wireOps as PatchFrame["ops"] }
  log.push(frame)
  await send(frame)
}
```

Next: [chat-level events the agent emits alongside frames →](04-types-chat-events.md)
