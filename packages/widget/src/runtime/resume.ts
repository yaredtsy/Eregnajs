import type { RunFrame } from "../types/conversation.js";
import type { StreamConsumeResult } from "../agent/consumeStream.js";
import { consumeAgentStream } from "../agent/consumeStream.js";
import type { ChatEvent } from "../agent/chatEvents.js";

export interface ResumeStreamOptions {
  apiBase: string;
  runId: string;
  toolCallId: string;
  result?: unknown;
  error?: string;
  elapsedMs: number;
  signal?: AbortSignal;
  onFrame: (frame: RunFrame) => void;
  onChatEvent?: (event: ChatEvent) => void;
}

const RESUME_RETRY_MS = 800;

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

async function postResumeOnce(opts: ResumeStreamOptions): Promise<Response> {
  return fetch(`${opts.apiBase}/public/agent/resume`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      runId: opts.runId,
      toolCallId: opts.toolCallId,
      ...(opts.error ? { error: opts.error } : { result: opts.result }),
      elapsedMs: opts.elapsedMs,
    }),
    signal: opts.signal,
  });
}

/** POST /agent/resume and consume the follow-up NDJSON stream (one retry on network failure). */
export async function resumeStream(opts: ResumeStreamOptions): Promise<StreamConsumeResult> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await postResumeOnce(opts);
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "");
        throw new Error(`Agent resume failed: ${res.status} ${text}`);
      }
      return consumeAgentStream(res.body, {
        onFrame: opts.onFrame,
        onChatEvent: opts.onChatEvent,
        signal: opts.signal,
      });
    } catch (err) {
      lastErr = err;
      if ((err as DOMException).name === "AbortError") throw err;
      if (attempt === 0) {
        await sleep(RESUME_RETRY_MS, opts.signal);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}
