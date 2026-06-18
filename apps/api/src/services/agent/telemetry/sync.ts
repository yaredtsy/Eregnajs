import type { Conversation, TokenUsageReport } from "@repo/walkthrough-core";
import type { TokenLedger } from "./ledger.js";

export function syncMessageTokenUsage(
  conv: Conversation,
  messageIndex: number,
  ledger: TokenLedger,
): TokenUsageReport {
  const report = ledger.report();
  const msg = conv.messages[messageIndex];
  if (msg) {
    msg.metadata = { ...msg.metadata, tokenUsage: report };
  }
  return report;
}
