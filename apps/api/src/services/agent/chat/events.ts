/** Chat-agent NDJSON events (docs/v2/9-chat-with-tools/06-events.md). */
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

export interface ClientToolInterruptPayload {
  kind: "client-tool-call";
  toolCallId: string;
  name: string;
  args: Record<string, unknown>;
}

export function toPendingToolCallEvent(
  payload: ClientToolInterruptPayload,
): Extract<ChatEvent, { kind: "pending-tool-call" }> {
  return {
    kind: "pending-tool-call",
    toolCallId: payload.toolCallId,
    name: payload.name,
    args: payload.args,
  };
}
