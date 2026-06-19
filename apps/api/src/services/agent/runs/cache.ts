import type { ChatAgent } from "../workflow/chatAgent.js";
import type { Patcher } from "../patcher/createPatcher.js";
import type { AgentContext } from "../context/types.js";
import type { ToolDescriptor } from "../tools/types.js";
import { TokenLedger } from "../telemetry/index.js";

export interface CachedRun {
  runId: string;
  threadId: string;
  agent: ChatAgent;
  specs: ToolDescriptor[];
  ctx: AgentContext;
  patcher: Patcher;
  assistantMsgIndex: number;
  textPartIndex: number;
  messageId: string;
  usageLedger: TokenLedger;
  pendingToolCallId?: string;
  startedAt: number;
  agentId: string;
  ownerId: string;
  query: string;
  visitorId?: string;
  pageUrl: string;
}

const cache = new Map<string, CachedRun>();

const TTL_MS = 24 * 60 * 60 * 1000;

export function rememberRun(entry: CachedRun): void {
  cache.set(entry.runId, entry);
}

export function lookupRun(runId: string): CachedRun | undefined {
  const entry = cache.get(runId);
  if (!entry) return undefined;
  if (Date.now() - entry.startedAt > TTL_MS) {
    cache.delete(runId);
    return undefined;
  }
  return entry;
}

export function forgetRun(runId: string): void {
  cache.delete(runId);
}

export function setPendingToolCall(runId: string, toolCallId: string): void {
  const entry = cache.get(runId);
  if (entry) entry.pendingToolCallId = toolCallId;
}

export function clearPendingToolCall(runId: string): void {
  const entry = cache.get(runId);
  if (entry) delete entry.pendingToolCallId;
}

/** Test helper — not for production use. */
export function _clearRunCache(): void {
  cache.clear();
}
