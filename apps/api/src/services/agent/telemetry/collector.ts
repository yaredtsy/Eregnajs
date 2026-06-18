import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import type { LLMResult } from "@langchain/core/outputs";
import type { TokenUsageCounts } from "@repo/walkthrough-core";
import { extractFromLlmResult } from "./extract.js";
import { emptyUsage, isNonZeroUsage } from "./normalize.js";

/** Collects token usage from LangChain LLM callbacks (one entry per handleLLMEnd). */
export class UsageCollector extends BaseCallbackHandler {
  name = "eregna-usage-collector";
  private usages: TokenUsageCounts[] = [];

  async handleLLMEnd(output: LLMResult): Promise<void> {
    const usage = extractFromLlmResult(output);
    if (isNonZeroUsage(usage)) {
      this.usages.push(usage);
    }
  }

  drain(): TokenUsageCounts[] {
    const out = [...this.usages];
    this.usages = [];
    return out;
  }

  aggregate(): TokenUsageCounts {
    return this.usages.reduce(
      (acc, u) => ({
        inputTokens: acc.inputTokens + u.inputTokens,
        outputTokens: acc.outputTokens + u.outputTokens,
        totalTokens: acc.totalTokens + u.totalTokens,
      }),
      emptyUsage(),
    );
  }
}
