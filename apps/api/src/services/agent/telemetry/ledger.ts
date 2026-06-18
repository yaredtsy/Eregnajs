import type {
  TokenUsageByLabel,
  TokenUsageCall,
  TokenUsageCounts,
  TokenUsageReport,
} from "@repo/walkthrough-core";
import { ZERO_TOKEN_USAGE } from "@repo/walkthrough-core";
import { emptyUsage } from "./normalize.js";

export interface RecordOpts {
  model?: string;
  meta?: Record<string, unknown>;
}

/** Mutable ledger for one agent run — record labeled LLM calls, produce rollups. */
export class TokenLedger {
  private calls: TokenUsageCall[] = [];

  record(
    label: string,
    usage: Partial<TokenUsageCounts>,
    opts?: RecordOpts,
  ): TokenUsageCall {
    const inputTokens = usage.inputTokens ?? 0;
    const outputTokens = usage.outputTokens ?? 0;
    const call: TokenUsageCall = {
      label,
      at: Date.now(),
      inputTokens,
      outputTokens,
      totalTokens: usage.totalTokens ?? inputTokens + outputTokens,
      model: opts?.model,
      meta: opts?.meta,
    };
    this.calls.push(call);
    return call;
  }

  report(): TokenUsageReport {
    const totals = this.calls.reduce(
      (acc, c) => ({
        inputTokens: acc.inputTokens + c.inputTokens,
        outputTokens: acc.outputTokens + c.outputTokens,
        totalTokens: acc.totalTokens + c.totalTokens,
      }),
      { ...ZERO_TOKEN_USAGE },
    );

    const byLabel: Record<string, TokenUsageByLabel> = {};
    for (const c of this.calls) {
      const bucket =
        byLabel[c.label] ??
        ({ ...ZERO_TOKEN_USAGE, calls: 0 } satisfies TokenUsageByLabel);
      bucket.inputTokens += c.inputTokens;
      bucket.outputTokens += c.outputTokens;
      bucket.totalTokens += c.totalTokens;
      bucket.calls += 1;
      byLabel[c.label] = bucket;
    }

    return { calls: [...this.calls], totals, byLabel };
  }

  merge(report: TokenUsageReport): void {
    this.calls.push(...report.calls);
  }

  static fromReport(report: TokenUsageReport): TokenLedger {
    const ledger = new TokenLedger();
    ledger.merge(report);
    return ledger;
  }
}
