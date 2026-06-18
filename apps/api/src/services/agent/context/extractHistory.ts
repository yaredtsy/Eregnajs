import type { Conversation } from "@repo/walkthrough-core";
import type { HistoryTurn } from "./types.js";

const MAX_HISTORY_TURNS = 20;

/** Plain-text turns from prior messages — used to seed the chat model. */
export function extractHistory(conv: Conversation): HistoryTurn[] {
  const turns: HistoryTurn[] = [];

  for (const msg of conv.messages) {
    if (msg.status === "streaming") continue;

    const text = msg.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("\n")
      .trim();

    if (!text) continue;
    turns.push({ role: msg.role, text });
  }

  return turns.slice(-MAX_HISTORY_TURNS);
}
