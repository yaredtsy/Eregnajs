import { nanoid } from "nanoid";
import { composeContext } from "../context/compose.js";
import { extractHistory } from "../context/extractHistory.js";
import { createPatcher } from "../patcher/createPatcher.js";
import * as h from "../patcher/helpers.js";
import { pickModel } from "../llm/provider.js";
import { TokenLedger } from "../telemetry/index.js";
import { WIRE_PROTOCOL } from "@repo/walkthrough-core";
import type { Conversation } from "@repo/walkthrough-core";
import { isAbortError } from "../../../lib/abort.js";
import type { RunOpts } from "../run.js";
import { buildChatAgent, buildChatAgentMessages } from "../workflow/chatAgent.js";
import { extractToolSpecs, type HostToolInput } from "../tools/parseHostTools.js";
import { streamAgent } from "./streamAgent.js";
import type { ChatEvent } from "./events.js";
import {
  rememberRun,
  setPendingToolCall,
  forgetRun,
  type CachedRun,
} from "../runs/cache.js";
import * as runs from "../runs/index.js";

export interface ChatRunOpts extends RunOpts {
  runId: string;
  startedAt: number;
  onChatEvent?: (event: ChatEvent) => Promise<void>;
}

async function emitChat(
  onChatEvent: ChatRunOpts["onChatEvent"],
  event: ChatEvent,
): Promise<void> {
  if (onChatEvent) await onChatEvent(event);
}

export async function runChatAgent(opts: ChatRunOpts): Promise<"paused" | "complete"> {
  const { runId, startedAt } = opts;
  const toolSpecs = extractToolSpecs(opts.hostTools as HostToolInput[] | undefined);

  const initialConv: Conversation = opts.conversation
    ? structuredClone(opts.conversation)
    : {
        sessionId: runId,
        agentName: "Eregna Agent",
        messages: [],
      };

  const patcher = createPatcher(initialConv, (frame) =>
    opts.onFrame({ kind: "patch", ...frame }),
  );

  await opts.onFrame({
    kind: "hello",
    runId,
    protocol: WIRE_PROTOCOL,
    conversation: initialConv,
  });
  await emitChat(opts.onChatEvent, { kind: "run-started", runId });

  const ctx = await composeContext({
    agentPublicId: opts.agentPublicId,
    pageUrl: opts.pageUrl,
    hostState: opts.hostState ?? {},
    hostTools: opts.hostTools ?? [],
    hostKnowledge: opts.hostKnowledge ?? [],
  });
  const fullCtx = {
    ...ctx,
    conversationHistory: extractHistory(initialConv),
  };
  initialConv.agentName = fullCtx.agent.name ?? initialConv.agentName;

  h.addUserMessage(initialConv, nanoid(10), opts.query);
  await patcher.emit();

  const messageId = nanoid(10);
  h.addAssistantMessage(initialConv, messageId);
  const assistantMsgIndex = initialConv.messages.length - 1;
  await patcher.emit();
  await emitChat(opts.onChatEvent, { kind: "message-started", messageId });

  const textPartIndex = h.addTextPart(initialConv, assistantMsgIndex);
  await patcher.emit();

  const model = pickModel(fullCtx.agent.model);
  const agent = buildChatAgent(model, fullCtx, toolSpecs);
  const usageLedger = new TokenLedger();
  const threadId = runId;
  const config = { configurable: { thread_id: threadId } };
  const messages = buildChatAgentMessages(fullCtx, opts.query);

  const cached: CachedRun = {
    runId,
    threadId,
    agent,
    specs: toolSpecs,
    ctx: fullCtx,
    patcher,
    assistantMsgIndex,
    textPartIndex,
    messageId,
    usageLedger,
    startedAt,
    agentId: fullCtx.agent.id,
    ownerId: fullCtx.agent.owner_id,
    query: opts.query,
    visitorId: opts.visitorId,
    pageUrl: opts.pageUrl,
  };
  rememberRun(cached);

  try {
    const result = await streamAgent({
      agent,
      input: { messages },
      config,
      emit: (e) => emitChat(opts.onChatEvent, e),
      patcher,
      assistantMsgIndex,
      textPartIndex,
      signal: opts.signal,
    });

    if (result.paused && result.interrupt) {
      setPendingToolCall(runId, result.interrupt.toolCallId);
      return "paused";
    }

    h.setMessageStatus(patcher.conversation, assistantMsgIndex, "complete");
    await patcher.emit();
    await emitChat(opts.onChatEvent, { kind: "message-complete", messageId });

    forgetRun(runId);
    runs.save({
      id: runId,
      agentId: fullCtx.agent.id,
      ownerId: fullCtx.agent.owner_id,
      query: opts.query,
      status: "complete",
      conversation: patcher.conversation,
      patchLog: patcher.getLog(),
      visitorId: opts.visitorId,
      pageUrl: opts.pageUrl,
      startedAt,
      tokenUsage: usageLedger.report(),
    });

    await opts.onFrame({ kind: "end", seq: patcher.getLog().length, status: "complete" });
    return "complete";
  } catch (err) {
    if (opts.signal?.aborted ?? isAbortError(err)) {
      for (const msg of patcher.conversation.messages) {
        if (msg.status === "streaming") msg.status = "complete";
      }
      throw err;
    }

    const message = err instanceof Error ? err.message : String(err);
    h.setMessageStatus(patcher.conversation, assistantMsgIndex, "error");
    await patcher.emit();
    await emitChat(opts.onChatEvent, { kind: "error", code: "agent-error", message });

    forgetRun(runId);
    runs.save({
      id: runId,
      agentId: fullCtx.agent.id,
      ownerId: fullCtx.agent.owner_id,
      query: opts.query,
      status: "error",
      conversation: patcher.conversation,
      patchLog: patcher.getLog(),
      visitorId: opts.visitorId,
      pageUrl: opts.pageUrl,
      errorMessage: message,
      startedAt,
      tokenUsage: usageLedger.report(),
    });

    await opts.onFrame({
      kind: "end",
      seq: patcher.getLog().length,
      status: "error",
      message,
    });
    throw err;
  }
}
