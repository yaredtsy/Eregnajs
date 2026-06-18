import { nanoid } from "nanoid";
import type { GraphState } from "../graph.js";
import { runChat } from "../../subagents/chat/run.js";
import { pickModel } from "../../llm/provider.js";
import { syncMessageTokenUsage } from "../../telemetry/index.js";
import { isAbortError } from "../../../../lib/abort.js";
import * as h from "../../patcher/helpers.js";

// Streams a plain-text assistant reply into a text part on the conversation.
export async function streamTextNode(state: GraphState): Promise<Partial<GraphState>> {
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
  let streamed = false;
  const narrate = async () => {
    for await (const chunk of runChat(model, ctx, query, {
      ledger: usageLedger,
      model: ctx.agent.model,
    })) {
      streamed = true;
      h.appendTextChunk(conv, msgIndex, textPartIndex, chunk);
      await patcher.emit();
    }
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
      console.warn("[agent] chat broke mid-stream; keeping partial body", err);
    } else {
      try {
        await narrate();
      } catch (retryErr) {
        const message = retryErr instanceof Error ? retryErr.message : String(retryErr);
        h.appendTextChunk(conv, msgIndex, textPartIndex, `Sorry, I couldn't answer that. (${message})`);
        await patcher.emit();
        console.error("[agent] chat stream failed", retryErr);
      }
    }
  }

  h.setMessageStatus(conv, msgIndex, "complete");
  await patcher.emit();

  return { assistantMsgIndex: msgIndex };
}
