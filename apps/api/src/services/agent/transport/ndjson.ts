import type { Context } from "hono";
import type { PatchFrame } from "@repo/walkthrough-core";

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

    async writeFrame(frame: PatchFrame): Promise<void> {
      const line = JSON.stringify(frame) + "\n";
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
