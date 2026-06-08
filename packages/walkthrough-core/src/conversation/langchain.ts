import { HumanMessage, AIMessage, BaseMessage } from "@langchain/core/messages";
import type { Message } from "./types.js";
import type { TextPart } from "./types.js";

export function toLangChain(messages: Message[]): BaseMessage[] {
  return messages.map((m) => {
    const text = m.parts
      .filter((p): p is TextPart => p.type === "text")
      .map((p) => p.text)
      .join("\n");

    if (m.role === "user") return new HumanMessage(text);
    return new AIMessage(text);
  });
}

export function textFromChunk(chunk: BaseMessage): string {
  const content = chunk.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((c): c is { type: "text"; text: string } => typeof c === "object" && c !== null && "text" in c)
      .map((c) => c.text)
      .join("");
  }
  return "";
}
