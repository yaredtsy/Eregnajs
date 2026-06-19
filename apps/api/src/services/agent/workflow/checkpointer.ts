import { MemorySaver } from "@langchain/langgraph-checkpoint";

// Shared in-process checkpointer for chat-agent runs (dev).
// M7 swaps this for PostgresSaver in production.
let instance: MemorySaver | null = null;

export function getCheckpointer(): MemorySaver {
  if (!instance) {
    instance = new MemorySaver();
  }
  return instance;
}
