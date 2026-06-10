import type { Context } from "hono";
import type { RunFrame } from "@repo/walkthrough-core";

export function createNdjsonStream(c: Context) {
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  return {
    response: new Response(readable, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Transfer-Encoding": "chunked",
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff",
      },
    }),

    async writeFrame(frame: RunFrame): Promise<void> {
      const line = JSON.stringify(frame) + "\n";
      // Awaiting the writer is the backpressure: a slow client slows the run.
      await writer.write(encoder.encode(line));
    },

    async close(): Promise<void> {
      await writer.close();
    },

    async abort(reason?: unknown): Promise<void> {
      await writer.abort(reason);
    },
  };
}
