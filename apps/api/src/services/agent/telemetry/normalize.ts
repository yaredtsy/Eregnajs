import type { TokenUsageCounts } from "@repo/walkthrough-core";
import { ZERO_TOKEN_USAGE } from "@repo/walkthrough-core";

type RawUsage = Record<string, number | undefined>;

/** Normalize OpenAI / LangChain token fields into a single shape. */
export function normalizeTokenUsage(raw: RawUsage): TokenUsageCounts {
  const input =
    raw.inputTokens ??
    raw.input_tokens ??
    raw.promptTokens ??
    raw.prompt_tokens ??
    0;
  const output =
    raw.outputTokens ??
    raw.output_tokens ??
    raw.completionTokens ??
    raw.completion_tokens ??
    0;
  const total = raw.totalTokens ?? raw.total_tokens ?? input + output;
  return { inputTokens: input, outputTokens: output, totalTokens: total };
}

export function sumTokenUsage(a: TokenUsageCounts, b: TokenUsageCounts): TokenUsageCounts {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    totalTokens: a.totalTokens + b.totalTokens,
  };
}

export function isNonZeroUsage(usage: TokenUsageCounts): boolean {
  return usage.inputTokens > 0 || usage.outputTokens > 0 || usage.totalTokens > 0;
}

export function emptyUsage(): TokenUsageCounts {
  return { ...ZERO_TOKEN_USAGE };
}
