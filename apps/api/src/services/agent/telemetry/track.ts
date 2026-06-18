import type { BaseMessage } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { textFromChunk } from "@repo/walkthrough-core";
import type { z } from "zod";
import { UsageCollector } from "./collector.js";
import { extractTokenUsage } from "./extract.js";
import type { TokenLedger } from "./ledger.js";
import type { RecordOpts } from "./ledger.js";
import { emptyUsage, isNonZeroUsage, sumTokenUsage } from "./normalize.js";
import type { TokenUsageCounts } from "@repo/walkthrough-core";

export interface TrackOpts extends RecordOpts {
  ledger: TokenLedger;
  label: string;
}

/** Invoke structured output and record each LLM end on the ledger. */
export async function trackStructuredInvoke<T>(
  model: BaseChatModel,
  schema: z.ZodType<T>,
  messages: BaseMessage[],
  opts: TrackOpts,
): Promise<T> {
  const collector = new UsageCollector();
  const structured = model.withStructuredOutput(schema);
  const result = await structured.invoke(messages, { callbacks: [collector] });

  for (const usage of collector.drain()) {
    opts.ledger.record(opts.label, usage, opts);
  }

  return result as T;
}

/** Stream text chunks; returns final usage after the generator completes. */
export async function* trackStream(
  model: BaseChatModel,
  messages: BaseMessage[],
): AsyncGenerator<string, TokenUsageCounts> {
  let usage = emptyUsage();
  const stream = await model.stream(messages);

  for await (const chunk of stream) {
    const chunkUsage = extractTokenUsage(chunk);
    if (isNonZeroUsage(chunkUsage)) {
      // Providers often emit cumulative totals on the last chunk.
      usage =
        chunkUsage.totalTokens > usage.totalTokens ? chunkUsage : sumTokenUsage(usage, chunkUsage);
    }
    const text = textFromChunk(chunk);
    if (text) yield text;
  }

  return usage;
}

export function recordStreamUsage(
  ledger: TokenLedger,
  label: string,
  usage: TokenUsageCounts,
  opts?: RecordOpts,
): void {
  if (isNonZeroUsage(usage)) {
    ledger.record(label, usage, opts);
  }
}
