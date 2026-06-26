# tutorial/09 — The wire, end to end

You now know the pieces. This file shows what an **actual stream** looks like for two cases.

The transport is **NDJSON** — one JSON object per line. No SSE framing, no chunk markers, just newlines.

## Case A: short reply, no tools

Client POSTs `/public/agent/run` with `{ agentPublicId, query: "What is this page?" }`.

Server response body (each line is one JSON object):

```jsonc
{"kind":"hello","runId":"abc123","protocol":2,"conversation":{"sessionId":"abc123","agentName":"Helper","messages":[]}}
{"kind":"run-started","runId":"abc123"}
{"seq":0,"kind":"patch","ops":[{"op":"add","path":"/messages/0","value":{"id":"u1","role":"user","parts":[{"type":"text","text":"What is this page?"}],"status":"complete","createdAt":1700000000}}]}
{"seq":1,"kind":"patch","ops":[{"op":"add","path":"/messages/1","value":{"id":"a1","role":"assistant","parts":[],"status":"streaming","createdAt":1700000001}}]}
{"kind":"message-started","messageId":"a1"}
{"seq":2,"kind":"patch","ops":[{"op":"add","path":"/messages/1/parts/0","value":{"type":"text","text":""}}]}
{"seq":3,"kind":"patch","ops":[{"op":"string-append","path":"/messages/1/parts/0/text","value":"This "}]}
{"kind":"text-delta","text":"This "}
{"seq":4,"kind":"patch","ops":[{"op":"string-append","path":"/messages/1/parts/0/text","value":"page "}]}
{"kind":"text-delta","text":"page "}
{"seq":5,"kind":"patch","ops":[{"op":"string-append","path":"/messages/1/parts/0/text","value":"is a demo."}]}
{"kind":"text-delta","text":"is a demo."}
{"seq":6,"kind":"patch","ops":[{"op":"replace","path":"/messages/1/status","value":"complete"}]}
{"kind":"message-complete","messageId":"a1"}
{"kind":"end","seq":7,"status":"complete"}
```

What to notice:

- `hello` first. `end` last.
- Every text chunk produces a `string-append` patch **and** a `text-delta` event. They carry the same letters.
- The assistant message is `add`ed empty first, then text parts are appended. The status flips at the end.
- `seq` only counts frames, not chat events.

## Case B: model calls a client tool, then continues

Client POSTs `/run` with a `hostTools` list that includes `{name: "open_drawer", runsIn: "client", ...}`.

Response on the first POST (the run pauses):

```jsonc
{"kind":"hello","runId":"xyz789","protocol":2,"conversation":{...}}
{"kind":"run-started","runId":"xyz789"}
{"seq":0,"kind":"patch","ops":[ /* add user message */ ]}
{"seq":1,"kind":"patch","ops":[ /* add assistant message + text part */ ]}
{"kind":"message-started","messageId":"a2"}
{"seq":2,"kind":"patch","ops":[{"op":"string-append","path":"/messages/1/parts/0/text","value":"Opening it for you."}]}
{"kind":"text-delta","text":"Opening it for you."}
{"kind":"pending-tool-call","toolCallId":"call_42","name":"open_drawer","args":{"side":"left"}}
```

Notice there is **no `end` frame yet**. The connection closes after `pending-tool-call` because the run is paused. The widget knows that "paused without end" is normal because `consumeAgentStream` returned `{ paused: true, pendingToolCall }`.

Now the widget runs `open_drawer({side:"left"})` locally. It POSTs `/public/agent/resume` with `{ runId: "xyz789", toolCallId: "call_42", result: { ok: true } }`.

Response on the resume POST:

```jsonc
{"kind":"run-resumed","runId":"xyz789","toolCallId":"call_42","elapsedMs":42}
{"seq":3,"kind":"patch","ops":[{"op":"string-append","path":"/messages/1/parts/0/text","value":" Done."}]}
{"kind":"text-delta","text":" Done."}
{"seq":4,"kind":"patch","ops":[{"op":"replace","path":"/messages/1/status","value":"complete"}]}
{"kind":"message-complete","messageId":"a2"}
{"kind":"end","seq":5,"status":"complete"}
```

Notice the `seq` counter **continues** across the two HTTP requests. That is because the `Patcher` is the same object — `resumeChatAgent` re-points the `onFrame` callback to the new response stream:

```ts
cached.patcher.setOnFrame((frame) => opts.onFrame({ kind: "patch", ...frame }))
```

The widget treats both responses as one logical stream.

## Why NDJSON and not SSE?

- Easier to write from a Node HTTP handler — just `res.write(JSON.stringify(obj) + "\n")`.
- Easier to read on the client — `TextDecoder` + split on `\n`.
- No special `event:` or `data:` framing.
- Each line is a self-contained JSON object you can also log line-by-line during debug.

The transport is in `apps/api/src/services/agent/transport/ndjson.ts`.

## Watchdog

The widget runs a 60-second timeout via `consumeAgentStream`. If no line arrives for 60s, it aborts the reader and throws "stream timed out". Servers that go silent cannot keep clients hanging.

Next: [how the widget reads the stream and renders →](10-render-widget.md)
