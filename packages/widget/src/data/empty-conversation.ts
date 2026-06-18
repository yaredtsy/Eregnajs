import type { Conversation } from "../types/conversation";

/** Starting state before the first hello frame on a live agent run. */
export function createEmptyConversation(agentName = "Eregna"): Conversation {
  return {
    sessionId: `sess_${crypto.randomUUID()}`,
    agentName,
    messages: [],
  };
}
