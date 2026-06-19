// M1: route chat through createReactAgent instead of streamText.
// Set EREGNA_CHAT_AGENT=1 to enable; default off keeps existing behavior.
export function useChatAgent(): boolean {
  const v = process.env.EREGNA_CHAT_AGENT;
  return v === "1" || v === "true";
}
