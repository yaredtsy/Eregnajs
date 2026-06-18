export interface TokenUsageCounts {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export const ZERO_TOKEN_USAGE: TokenUsageCounts = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
};

export interface TokenUsageCall extends TokenUsageCounts {
  label: string;
  at: number;
  model?: string;
  meta?: Record<string, unknown>;
}

export interface TokenUsageByLabel extends TokenUsageCounts {
  calls: number;
}

/** Aggregated usage for a message or agent run. */
export interface TokenUsageReport {
  calls: TokenUsageCall[];
  totals: TokenUsageCounts;
  byLabel: Record<string, TokenUsageByLabel>;
}
