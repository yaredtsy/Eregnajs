import type { PatchFrame } from "../types/conversation";

export interface RunStreamOptions {
  apiBase: string;
  agentPublicId: string;
  pageUrl: string;
  query: string;
  hostState?: Record<string, unknown>;
  hostTools?: Array<{ name: string; description: string; parameters?: Record<string, unknown> }>;
  visitorId?: string;
  signal?: AbortSignal;
  onFrame: (frame: PatchFrame) => void;
}

export async function runStream(opts: RunStreamOptions): Promise<void> {
  const res = await fetch(`${opts.apiBase}/v1/agent/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      agentPublicId: opts.agentPublicId,
      pageUrl: opts.pageUrl,
      query: opts.query,
      hostState: opts.hostState,
      hostTools: opts.hostTools,
      visitorId: opts.visitorId,
    }),
    signal: opts.signal,
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

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const frame = JSON.parse(trimmed) as PatchFrame;
        opts.onFrame(frame);
      }
    }

    // Flush remaining buffer
    if (buffer.trim()) {
      const frame = JSON.parse(buffer.trim()) as PatchFrame;
      opts.onFrame(frame);
    }
  } finally {
    reader.releaseLock();
  }
}
