import type { RunFrame } from "../types/conversation";

export interface RunStreamOptions {
  apiBase: string;
  agentPublicId: string;
  pageUrl: string;
  query: string;
  hostState?: Record<string, unknown>;
  hostTools?: Array<{ name: string; description: string; parameters?: Record<string, unknown> }>;
  hostKnowledge?: Array<{ title: string; content: string }>;
  visitorId?: string;
  signal?: AbortSignal;
  onFrame: (frame: RunFrame) => void;
}

// No frame for this long = the run is dead (server hung, network black hole).
const WATCHDOG_MS = 60_000;

export async function runStream(opts: RunStreamOptions): Promise<void> {
  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  opts.signal?.addEventListener("abort", onExternalAbort, { once: true });
  if (opts.signal?.aborted) controller.abort();

  let timedOut = false;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  const resetWatchdog = () => {
    clearTimeout(watchdog);
    watchdog = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, WATCHDOG_MS);
  };

  let endReceived = false;
  const handleLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const parsed = JSON.parse(trimmed) as RunFrame | { seq: number };
    // Pre-envelope servers sent bare patch frames; unknown kinds are ignored
    // for forward compatibility.
    const frame: RunFrame =
      "kind" in parsed ? parsed : { kind: "patch", ...(parsed as { seq: number; ops: [] }) };
    if (frame.kind !== "hello" && frame.kind !== "patch" && frame.kind !== "end") return;
    if (frame.kind === "end") endReceived = true;
    opts.onFrame(frame);
  };

  try {
    resetWatchdog();
    const res = await fetch(`${opts.apiBase}/public/agent/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentPublicId: opts.agentPublicId,
        pageUrl: opts.pageUrl,
        query: opts.query,
        hostState: opts.hostState,
        hostTools: opts.hostTools,
        hostKnowledge: opts.hostKnowledge,
        visitorId: opts.visitorId,
      }),
      signal: controller.signal,
    });

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      throw new Error(`Agent run failed: ${res.status} ${text}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        resetWatchdog();

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) handleLine(line);
      }
      if (buffer.trim()) handleLine(buffer);
    } finally {
      reader.releaseLock();
    }

    if (!endReceived) {
      throw new Error("stream closed without an end frame (connection lost)");
    }
  } catch (err) {
    if (timedOut) {
      throw new Error(`stream timed out: no frames for ${WATCHDOG_MS / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(watchdog);
    opts.signal?.removeEventListener("abort", onExternalAbort);
  }
}
