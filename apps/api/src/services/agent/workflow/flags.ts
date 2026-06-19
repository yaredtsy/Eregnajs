import { extractToolSpecs, type HostToolInput } from "../tools/parseHostTools.js";

// M1: route chat through createReactAgent instead of streamText.
// Set EREGNA_CHAT_AGENT=1 to force on; default off keeps walkthrough streamText path.
export function useChatAgent(): boolean {
  const v = process.env.EREGNA_CHAT_AGENT;
  return v === "1" || v === "true";
}

/** Use the LangGraph chat agent when the flag is on or the host sent client tools. */
export function shouldUseChatAgentPath(hostTools?: HostToolInput[]): boolean {
  if (useChatAgent()) return true;
  const specs = extractToolSpecs(hostTools);
  return specs.some((s) => s.runsIn === "client");
}
