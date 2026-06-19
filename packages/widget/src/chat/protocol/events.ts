/** Chat-agent NDJSON events (mirrors apps/api chat/events.ts). */
export type ChatEvent =
  | { kind: "run-started"; runId: string }
  | { kind: "run-resumed"; runId: string; toolCallId: string; elapsedMs?: number }
  | { kind: "message-started"; messageId: string }
  | { kind: "text-delta"; text: string }
  | {
      kind: "pending-tool-call";
      toolCallId: string;
      name: string;
      args: Record<string, unknown>;
    }
  | { kind: "message-complete"; messageId: string }
  | { kind: "error"; code: string; message: string };

const CHAT_EVENT_KINDS = new Set([
  "run-started",
  "run-resumed",
  "message-started",
  "text-delta",
  "pending-tool-call",
  "message-complete",
  "error",
]);

export function isChatEvent(value: unknown): value is ChatEvent {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    typeof (value as { kind: unknown }).kind === "string" &&
    CHAT_EVENT_KINDS.has((value as { kind: string }).kind)
  );
}
