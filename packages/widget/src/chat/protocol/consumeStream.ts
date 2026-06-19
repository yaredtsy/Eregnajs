import type { RunFrame } from "../../types/conversation.js";
import { isChatEvent, type ChatEvent } from "./events.js";

export interface StreamHandlers {
  onFrame: (frame: RunFrame) => void;
  onChatEvent?: (event: ChatEvent) => void;
  signal?: AbortSignal;
}

export interface StreamConsumeResult {
  endReceived: boolean;
  paused: boolean;
  pendingToolCall?: Extract<ChatEvent, { kind: "pending-tool-call" }>;
  runId?: string;
}

const WATCHDOG_MS = 60_000;

function parseLine(line: string): unknown {
  const trimmed = line.trim();
  if (!trimmed) return null;
  return JSON.parse(trimmed);
}

function toRunFrame(parsed: unknown): RunFrame | null {
  if (typeof parsed !== "object" || parsed === null) return null;
  if ("kind" in parsed) {
    const kind = (parsed as { kind: string }).kind;
    if (kind === "hello" || kind === "patch" || kind === "end") {
      return parsed as RunFrame;
    }
  }
  if ("seq" in parsed && "ops" in parsed) {
    return { kind: "patch", ...(parsed as { seq: number; ops: [] }) };
  }
  return null;
}

/** Read an NDJSON agent stream; surface patch/hello/end frames and chat events. */
export async function consumeAgentStream(
  body: ReadableStream<Uint8Array>,
  handlers: StreamHandlers,
): Promise<StreamConsumeResult> {
  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  handlers.signal?.addEventListener("abort", onExternalAbort, { once: true });
  if (handlers.signal?.aborted) controller.abort();

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
  let paused = false;
  let pendingToolCall: StreamConsumeResult["pendingToolCall"];
  let runId: string | undefined;

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    resetWatchdog();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      resetWatchdog();

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const parsed = parseLine(line);
        if (!parsed) continue;

        if (isChatEvent(parsed)) {
          handlers.onChatEvent?.(parsed);
          if (parsed.kind === "run-started") runId = parsed.runId;
          if (parsed.kind === "pending-tool-call") {
            paused = true;
            pendingToolCall = parsed;
          }
          continue;
        }

        const frame = toRunFrame(parsed);
        if (!frame) continue;
        if (frame.kind === "end") endReceived = true;
        if (frame.kind === "hello") runId = frame.runId;
        handlers.onFrame(frame);
      }
    }

    if (buffer.trim()) {
      const parsed = parseLine(buffer);
      if (parsed) {
        if (isChatEvent(parsed)) {
          handlers.onChatEvent?.(parsed);
          if (parsed.kind === "run-started") runId = parsed.runId;
          if (parsed.kind === "pending-tool-call") {
            paused = true;
            pendingToolCall = parsed;
          }
        } else {
          const frame = toRunFrame(parsed);
          if (frame) {
            if (frame.kind === "end") endReceived = true;
            if (frame.kind === "hello") runId = frame.runId;
            handlers.onFrame(frame);
          }
        }
      }
    }
  } catch (err) {
    if (timedOut) {
      throw new Error(`stream timed out: no frames for ${WATCHDOG_MS / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(watchdog);
    handlers.signal?.removeEventListener("abort", onExternalAbort);
    reader.releaseLock();
  }

  return { endReceived, paused, pendingToolCall, runId };
}
