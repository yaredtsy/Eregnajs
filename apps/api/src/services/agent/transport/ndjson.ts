import type { Context } from "hono";
import type { RunFrame } from "@repo/walkthrough-core";

export function createNdjsonStream(c: Context) {
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  let closed = false;
  let wroteSuccessfully = false;
  let warnedClosedWrite = false;

  const warnIfDropped = (kind: string) => {
    if (wroteSuccessfully && !warnedClosedWrite) {
      warnedClosedWrite = true;
      console.warn(`[eregna] ndjson: write to closed stream dropped ${kind} frame`);
    }
  };

  const markClosed = () => {
    closed = true;
  };

  c.req.raw.signal?.addEventListener("abort", markClosed, { once: true });

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
      if (closed) {
        warnIfDropped(frame.kind);
        return;
      }
      try {
        const line = JSON.stringify(frame) + "\n";
        await writer.write(encoder.encode(line));
        wroteSuccessfully = true;
      } catch {
        // Client disconnected — stop writing; the run's AbortSignal will cancel upstream.
        closed = true;
      }
    },

    async writeEvent(event: Record<string, unknown>): Promise<void> {
      if (closed) {
        warnIfDropped("chat-event");
        return;
      }
      try {
        const line = JSON.stringify(event) + "\n";
        await writer.write(encoder.encode(line));
        wroteSuccessfully = true;
      } catch {
        closed = true;
      }
    },

    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      try {
        await writer.close();
      } catch {
        // Writable already closed or errored when the client disconnected.
      }
    },

    async abort(reason?: unknown): Promise<void> {
      if (closed) return;
      closed = true;
      try {
        await writer.abort(reason);
      } catch {
        // No-op if the stream is already gone.
      }
    },
  };
}
