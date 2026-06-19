import { Command } from "@langchain/langgraph";
import { isAbortError } from "../../../lib/abort.js";
import type { RunFrame } from "@repo/walkthrough-core";
import { streamAgent } from "./streamAgent.js";
import type { ChatEvent } from "./events.js";
import { validateResumeRequest } from "./validateResume.js";
export { ResumeError } from "./errors.js";
import {
  lookupRun,
  forgetRun,
  setPendingToolCall,
  clearPendingToolCall,
} from "../runs/cache.js";
import * as h from "../patcher/helpers.js";
import * as runs from "../runs/index.js";

export interface ResumeOpts {
  runId: string;
  toolCallId: string;
  result?: unknown;
  error?: string;
  elapsedMs?: number;
  signal?: AbortSignal;
  onFrame: (frame: RunFrame) => Promise<void>;
  onChatEvent?: (event: ChatEvent) => Promise<void>;
}

async function emitChat(
  onChatEvent: ResumeOpts["onChatEvent"],
  event: ChatEvent,
): Promise<void> {
  if (onChatEvent) await onChatEvent(event);
}

export async function resumeChatAgent(opts: ResumeOpts): Promise<"paused" | "complete"> {
  validateResumeRequest(opts);
  const cached = lookupRun(opts.runId)!;

  // Re-point the patcher at this request's stream — the /run closure writes to a closed pipe.
  cached.patcher.setOnFrame((frame) => opts.onFrame({ kind: "patch", ...frame }));

  const resumeValue = opts.error
    ? { ok: false, error: opts.error }
    : { ok: true, value: opts.result };

  await emitChat(opts.onChatEvent, {
    kind: "run-resumed",
    runId: opts.runId,
    toolCallId: opts.toolCallId,
    elapsedMs: opts.elapsedMs,
  });

  clearPendingToolCall(opts.runId);
  const config = { configurable: { thread_id: cached.threadId } };

  try {
    const result = await streamAgent({
      agent: cached.agent,
      input: new Command({ resume: resumeValue }),
      config,
      emit: (e) => emitChat(opts.onChatEvent, e),
      patcher: cached.patcher,
      assistantMsgIndex: cached.assistantMsgIndex,
      textPartIndex: cached.textPartIndex,
      signal: opts.signal,
    });

    if (result.paused && result.interrupt) {
      setPendingToolCall(opts.runId, result.interrupt.toolCallId);
      return "paused";
    }

    h.setMessageStatus(cached.patcher.conversation, cached.assistantMsgIndex, "complete");
    await cached.patcher.emit();
    await emitChat(opts.onChatEvent, { kind: "message-complete", messageId: cached.messageId });

    forgetRun(opts.runId);
    runs.save({
      id: opts.runId,
      agentId: cached.agentId,
      ownerId: cached.ownerId,
      query: cached.query,
      status: "complete",
      conversation: cached.patcher.conversation,
      patchLog: cached.patcher.getLog(),
      visitorId: cached.visitorId,
      pageUrl: cached.pageUrl,
      startedAt: cached.startedAt,
      tokenUsage: cached.usageLedger.report(),
    });

    await opts.onFrame({
      kind: "end",
      seq: cached.patcher.getLog().length,
      status: "complete",
    });
    return "complete";
  } catch (err) {
    if (opts.signal?.aborted ?? isAbortError(err)) throw err;

    const message = err instanceof Error ? err.message : String(err);
    await emitChat(opts.onChatEvent, { kind: "error", code: "agent-error", message });
    forgetRun(opts.runId);
    throw err;
  }
}
