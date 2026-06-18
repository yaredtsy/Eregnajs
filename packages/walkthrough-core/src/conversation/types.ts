import type { WalkthroughPart } from "../walkthrough/types.js";
import type { TokenUsageReport } from "../telemetry/types.js";

export type ChatRole = "user" | "assistant";
export type MessageStatus = "streaming" | "complete" | "error";

export type TextPart = { type: "text"; text: string };

export type MessagePart = TextPart | WalkthroughPart;

export type MessageMetadata = {
  tokenUsage?: TokenUsageReport;
};

export type Message = {
  id: string;
  role: ChatRole;
  parts: MessagePart[];
  status: MessageStatus;
  createdAt: number;
  metadata?: MessageMetadata;
};

export type Conversation = {
  sessionId: string;
  agentName: string;
  messages: Message[];
};
