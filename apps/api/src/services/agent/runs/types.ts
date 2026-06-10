import type { Conversation } from "@repo/walkthrough-core";
import type { PatchFrame } from "@repo/walkthrough-core";

export type RunStatus = "streaming" | "complete" | "aborted" | "error";

export interface AgentRunRow {
  id: string;
  agent_id: string;
  owner_id: string | null;
  conversation_id: string | null;
  visitor_id: string | null;
  page_url: string | null;
  query: string;
  state_snapshot: Conversation;
  patch_log: PatchFrame[];
  status: RunStatus;
  error_message: string | null;
  started_at: number;
  completed_at: number | null;
}

export interface AgentRunListItem {
  id: string;
  agent_id: string;
  query: string;
  status: RunStatus;
  started_at: number;
  completed_at: number | null;
}

export interface SaveOpts {
  id: string;
  agentId: string;
  ownerId: string;
  conversationId?: string;
  visitorId?: string;
  pageUrl?: string;
  query: string;
  status: RunStatus;
  conversation: Conversation;
  patchLog: PatchFrame[];
  errorMessage?: string;
  startedAt: number;
}
