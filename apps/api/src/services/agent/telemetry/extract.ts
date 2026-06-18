import type { BaseMessage } from "@langchain/core/messages";
import type { LLMResult } from "@langchain/core/outputs";
import type { TokenUsageCounts } from "@repo/walkthrough-core";
import { emptyUsage, isNonZeroUsage, normalizeTokenUsage } from "./normalize.js";

type UsageMessage = BaseMessage & {
  usage_metadata?: Record<string, number>;
  response_metadata?: { token_usage?: Record<string, number> };
};

export function extractTokenUsage(message: BaseMessage): TokenUsageCounts {
  const msg = message as UsageMessage;
  if (msg.usage_metadata && isNonZeroUsage(normalizeTokenUsage(msg.usage_metadata))) {
    return normalizeTokenUsage(msg.usage_metadata);
  }
  if (msg.response_metadata?.token_usage) {
    return normalizeTokenUsage(msg.response_metadata.token_usage);
  }
  return emptyUsage();
}

export function extractFromLlmResult(output: LLMResult): TokenUsageCounts {
  const llmOutput = output.llmOutput as Record<string, unknown> | undefined;
  if (llmOutput?.tokenUsage) {
    return normalizeTokenUsage(llmOutput.tokenUsage as Record<string, number>);
  }

  const generation = output.generations?.[0]?.[0];
  if (generation && "message" in generation && generation.message) {
    return extractTokenUsage(generation.message as BaseMessage);
  }

  return emptyUsage();
}
