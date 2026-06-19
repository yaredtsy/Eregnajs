import type { RunFrame } from "../../types/conversation.js";
import type { ChatEvent } from "../protocol/events.js";
import { consumeAgentStream } from "../protocol/consumeStream.js";
import { executeClientTool } from "../tools/executor.js";
import { resumeStream } from "./resume.js";
import type { ToolCallUiState } from "../tools/types.js";

export interface RunStreamOptions {
  apiBase: string;
  agentPublicId: string;
  pageUrl: string;
  query: string;
  conversation?: import("../../types/conversation.js").Conversation;
  hostState?: Record<string, unknown>;
  hostTools?: Array<{
    name: string;
    description: string;
    parameters?: Record<string, unknown>;
    runsIn?: "client" | "server";
    display?: Record<string, unknown>;
  }>;
  hostKnowledge?: Array<{ title: string; content: string }>;
  visitorId?: string;
  signal?: AbortSignal;
  onFrame: (frame: RunFrame) => void;
  onChatEvent?: (event: ChatEvent) => void;
  /** Resolve the assistant message id tool cards attach to. */
  getMessageId?: () => string | null;
  onToolCallUpdate?: (toolCall: ToolCallUiState) => void;
}

async function runStreamOnce(
  url: string,
  body: Record<string, unknown>,
  opts: Pick<RunStreamOptions, "signal" | "onFrame" | "onChatEvent">,
) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: opts.signal,
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`Agent request failed: ${res.status} ${text}`);
  }

  return consumeAgentStream(res.body, {
    onFrame: opts.onFrame,
    onChatEvent: opts.onChatEvent,
    signal: opts.signal,
  });
}

/** Run a full agent turn, including client-tool pause/resume loops. */
export async function runStream(opts: RunStreamOptions): Promise<void> {
  const runBody = {
    agentPublicId: opts.agentPublicId,
    pageUrl: opts.pageUrl,
    query: opts.query,
    conversation: opts.conversation,
    hostState: opts.hostState,
    hostTools: opts.hostTools,
    hostKnowledge: opts.hostKnowledge,
    visitorId: opts.visitorId,
  };

  let outcome = await runStreamOnce(
    `${opts.apiBase}/public/agent/run`,
    runBody,
    opts,
  );

  let runId = outcome.runId;

  while (outcome.paused && outcome.pendingToolCall) {
    if (!runId) {
      throw new Error("pending-tool-call without runId");
    }

    const pending = outcome.pendingToolCall;
    const messageId = opts.getMessageId?.() ?? "unknown";

    opts.onToolCallUpdate?.({
      toolCallId: pending.toolCallId,
      messageId,
      name: pending.name,
      args: pending.args,
      status: "pending",
    });

    opts.onToolCallUpdate?.({
      toolCallId: pending.toolCallId,
      messageId,
      name: pending.name,
      args: pending.args,
      status: "running",
    });

    const exec = await executeClientTool(pending.name, pending.args);

    opts.onToolCallUpdate?.({
      toolCallId: pending.toolCallId,
      messageId,
      name: pending.name,
      args: pending.args,
      status: exec.ok ? "done" : "error",
      result: exec.ok ? exec.value : undefined,
      error: exec.ok ? undefined : exec.error,
      elapsedMs: exec.elapsedMs,
    });

    outcome = await resumeStream({
      apiBase: opts.apiBase,
      runId,
      toolCallId: pending.toolCallId,
      result: exec.ok ? exec.value : undefined,
      error: exec.ok ? undefined : exec.error,
      elapsedMs: exec.elapsedMs,
      signal: opts.signal,
      onFrame: opts.onFrame,
      onChatEvent: opts.onChatEvent,
    });

    if (outcome.runId) runId = outcome.runId;
  }

  if (!outcome.endReceived && !outcome.paused) {
    throw new Error("stream closed without an end frame (connection lost)");
  }
}
