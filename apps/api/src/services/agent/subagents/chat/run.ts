import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { textFromChunk } from "@repo/walkthrough-core";
import type { AgentContext } from "../../context/types.js";
import type { TokenLedger } from "../../telemetry/index.js";
import { recordStreamUsage, trackStream } from "../../telemetry/index.js";
import { emptyUsage } from "../../telemetry/normalize.js";
import { buildChatMessages } from "./prompt.js";

export interface ChatRunOpts {
  ledger?: TokenLedger;
  model?: string;
}

/** Streams a direct text reply for chat-style responses. */
export async function* runChat(
  model: BaseChatModel,
  ctx: AgentContext,
  query: string,
  opts?: ChatRunOpts,
): AsyncGenerator<string> {
  const messages = buildChatMessages(ctx, query);

  if (opts?.ledger) {
    const gen = trackStream(model, messages);
    let result = await gen.next();
    while (!result.done) {
      yield result.value;
      result = await gen.next();
    }
    const usage = result.value ?? emptyUsage();
    recordStreamUsage(opts.ledger, "chat", usage, { model: opts.model });
    return;
  }

  const stream = await model.stream(messages);
  for await (const chunk of stream) {
    const text = textFromChunk(chunk);
    if (text) yield text;
  }
}
