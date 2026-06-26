import { nanoid } from "nanoid";
import { textFromChunk } from "@repo/walkthrough-core";
import type { GraphState } from "../graph.js";
import { buildChatAgent, buildChatAgentMessages } from "../chatAgent.js";
import { pickModel } from "../../llm/provider.js";
import { UsageCollector, recordStreamUsage, syncMessageTokenUsage } from "../../telemetry/index.js";
import { isAbortError } from "../../../../lib/abort.js";
import * as h from "../../patcher/helpers.js";

// Streams a plain-text assistant reply via createReactAgent (M1 skeleton, no tools yet).
export async function chatAgentNode(state: GraphState): Promise<Partial<GraphState>> {
  const { patcher, ctx, query, assistantMsgIndex, usageLedger } = state;
  const conv = patcher.conversation;

  h.addUserMessage(conv, nanoid(10), query);
  await patcher.emit();

  let msgIndex = assistantMsgIndex;
  if (msgIndex < 0) {
    h.addAssistantMessage(conv, nanoid(10));
    msgIndex = conv.messages.length - 1;
    await patcher.emit();
  }

  const textPartIndex = h.addTextPart(conv, msgIndex);
  await patcher.emit();

  const model = pickModel(ctx.agent.model);
  const agent = buildChatAgent(model, ctx, [], patcher, () => msgIndex);
  const messages = buildChatAgentMessages(ctx, query);
  const collector = new UsageCollector();

  let streamed = false;
  const narrate = async () => {
    const stream = await agent.stream(
      { messages },
      { streamMode: "messages", callbacks: [collector] },
    );

    for await (const chunk of stream) {
      const msg = Array.isArray(chunk) ? chunk[0] : chunk;
      const text = textFromChunk(msg);
      if (!text) continue;
      streamed = true;
      h.appendTextChunk(conv, msgIndex, textPartIndex, text);
      await patcher.emit();
    }

    const usages = collector.drain();
    const usage = usages.length > 0 ? usages[usages.length - 1]! : collector.aggregate();
    recordStreamUsage(usageLedger, "chat", usage, { model: ctx.agent.model });
    syncMessageTokenUsage(conv, msgIndex, usageLedger);
  };

  try {
    await narrate();
  } catch (err) {
    if (isAbortError(err)) {
      if (streamed) {
        h.setMessageStatus(conv, msgIndex, "complete");
        try {
          await patcher.emit();
        } catch {}
      }
      throw err;
    }
    if (streamed) {
      console.warn("[agent] chat agent broke mid-stream; keeping partial body", err);
    } else {
      try {
        await narrate();
      } catch (retryErr) {
        const message = retryErr instanceof Error ? retryErr.message : String(retryErr);
        h.appendTextChunk(conv, msgIndex, textPartIndex, `Sorry, I couldn't answer that. (${message})`);
        await patcher.emit();
        console.error("[agent] chat agent stream failed", retryErr);
      }
    }
  }

  h.setMessageStatus(conv, msgIndex, "complete");
  await patcher.emit();

  return { assistantMsgIndex: msgIndex };
}
