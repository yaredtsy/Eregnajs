import type { ChatEvent } from "../protocol/events.js";
import type { RunFrame } from "../../types/conversation.js";
import { summarizeValue } from "../tools/format.js";

function preview(value: unknown, max = 60): string {
  const s = summarizeValue(value, max);
  return s ? ` ${s}` : "";
}

/** One-line summary for the inspector event tail. */
export function formatDebugEvent(event: ChatEvent | RunFrame): string {
  switch (event.kind) {
    case "run-started":
      return `run-started runId=${event.runId}`;
    case "run-resumed": {
      const ms = event.elapsedMs != null ? ` elapsedMs=${event.elapsedMs}` : "";
      return `/resume → ok toolCallId=${event.toolCallId}${ms}`;
    }
    case "message-started":
      return `message-started id=${event.messageId}`;
    case "text-delta":
      return `text-delta${preview(`"${event.text}"`, 48)}`;
    case "pending-tool-call":
      return `pending-tool-call ${event.name}${preview(event.args)}`;
    case "message-complete":
      return "message-complete";
    case "error":
      return `error ${event.code}: ${event.message}`;
    case "hello":
      return `hello runId=${event.runId}`;
    case "patch":
      return `patch seq=${event.seq} ops=${event.ops.length}`;
    case "end":
      return `end status=${event.status}`;
    default:
      return "unknown event";
  }
}
