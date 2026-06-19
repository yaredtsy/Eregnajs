import { nanoid } from "nanoid";
import { composeContext } from "./context/compose.js";
import { extractHistory } from "./context/extractHistory.js";
import { createPatcher } from "./patcher/createPatcher.js";
import * as h from "./patcher/helpers.js";
import { buildGraph } from "./workflow/graph.js";
import { TokenLedger } from "./telemetry/index.js";
import * as runs from "./runs/index.js";
import { WIRE_PROTOCOL } from "@repo/walkthrough-core";
import type { Conversation, RunFrame } from "@repo/walkthrough-core";
import type { ChatEvent } from "./chat/events.js";
import { isAbortError } from "../../lib/abort.js";
import { useChatAgent } from "./workflow/flags.js";

export interface RunOpts {
  agentPublicId: string;
  pageUrl: string;
  query: string;
  hostState?: Record<string, unknown>;
  hostTools?: Array<{ name: string; description: string; parameters?: Record<string, unknown> }>;
  hostKnowledge?: Array<{ title: string; content: string }>;
  visitorId?: string;
  conversation?: Conversation;
  signal?: AbortSignal;
  onFrame: (frame: RunFrame) => Promise<void>;
  onChatEvent?: (event: ChatEvent) => Promise<void>;
}

export async function runAgent(opts: RunOpts): Promise<void> {
  const startedAt = Date.now();
  const runId = nanoid(10);

  if (useChatAgent()) {
    const { runChatAgent } = await import("./chat/run.js");
    const status = await runChatAgent({ ...opts, runId, startedAt });
    if (status === "paused") return;
    return;
  }

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

  let ctx: AgentContext | null = null;
  try {
    ctx = await composeContext({
      agentPublicId: opts.agentPublicId,
      pageUrl: opts.pageUrl,
      hostState: opts.hostState ?? {},
      hostTools: opts.hostTools ?? [],
      hostKnowledge: opts.hostKnowledge ?? [],
    });
    ctx = {
      ...ctx,
      conversationHistory: extractHistory(initialConv),
    };
    initialConv.agentName = ctx.agent.name ?? initialConv.agentName;

    const usageLedger = new TokenLedger();
    const graph = buildGraph();
    await graph.invoke(
      {
        query: opts.query,
        ctx,
        patcher,
        assistantMsgIndex: -1,
        walkthroughPartIndex: -1,
        plan: null,
        chapterIndex: 0,
        stepIndexInChapter: 0,
        globalStepOffset: 0,
        usageLedger,
      },
      { signal: opts.signal },
    );

    const tokenUsage = usageLedger.report();

    runs.save({
      id: runId,
      agentId: ctx.agent.id,
      ownerId: ctx.agent.owner_id,
      query: opts.query,
      status: "complete",
      conversation: patcher.conversation,
      patchLog: patcher.getLog(),
      visitorId: opts.visitorId,
      pageUrl: opts.pageUrl,
      startedAt,
      tokenUsage,
    });

    await opts.onFrame({ kind: "end", seq: patcher.getLog().length, status: "complete" });
  } catch (err) {
    const aborted = opts.signal?.aborted ?? isAbortError(err);
    const message = err instanceof Error ? err.message : String(err);

    if (aborted) {
      finalizeStreamingMessages(patcher.conversation);
    }

    // Surface the failure in the document, then always terminate the stream.
    // Both are best-effort: the connection may already be gone.
    if (!aborted) {
      try {
        markRunError(patcher.conversation, message);
        await patcher.emit();
      } catch {}
      try {
        await opts.onFrame({
          kind: "end",
          seq: patcher.getLog().length,
          status: "error",
          message,
        });
      } catch {}
    }

    if (ctx) {
      runs.save({
        id: runId,
        agentId: ctx.agent.id,
        ownerId: ctx.agent.owner_id,
        query: opts.query,
        status: aborted ? "aborted" : "error",
        conversation: patcher.conversation,
        patchLog: patcher.getLog(),
        visitorId: opts.visitorId,
        pageUrl: opts.pageUrl,
        errorMessage: message,
        startedAt,
        tokenUsage: extractMessageTokenUsage(patcher.conversation),
      });
    }
    throw err;
  }
}

function extractMessageTokenUsage(conv: Conversation) {
  for (let i = conv.messages.length - 1; i >= 0; i--) {
    const usage = conv.messages[i]?.metadata?.tokenUsage;
    if (usage) return usage;
  }
  return undefined;
}

function markRunError(conv: Conversation, message: string): void {
  let msgIndex = -1;
  for (let i = conv.messages.length - 1; i >= 0; i--) {
    if (conv.messages[i]!.role === "assistant") { msgIndex = i; break; }
  }
  if (msgIndex === -1) return;
  const partIndex = conv.messages[msgIndex]!.parts.findIndex(
    (p) => p.type === "walkthrough",
  );
  if (partIndex === -1) {
    h.setMessageStatus(conv, msgIndex, "error");
    return;
  }
  h.failWalkthrough(conv, msgIndex, partIndex, message);
}

function finalizeStreamingMessages(conv: Conversation): void {
  for (const msg of conv.messages) {
    if (msg.status === "streaming") msg.status = "complete";
  }
}
