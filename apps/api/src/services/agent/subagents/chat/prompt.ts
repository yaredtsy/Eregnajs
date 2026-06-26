import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { AgentContext } from "../../context/types.js";
import { composeSystemPrompt, CHAT_SECTIONS } from "../../prompts/index.js";

const CHAT_MODE_SUFFIX = `
## This turn
Answer the visitor below using only the context above.
Stay in chat mode — prose, not steps.
`.trim();

export function buildChatMessages(ctx: AgentContext, query: string): BaseMessage[] {
  const system = composeSystemPrompt(ctx, CHAT_SECTIONS) + "\n\n" + CHAT_MODE_SUFFIX;
  const messages: BaseMessage[] = [new SystemMessage(system)];

  for (const turn of ctx.conversationHistory) {
    messages.push(
      turn.role === "user" ? new HumanMessage(turn.text) : new AIMessage(turn.text),
    );
  }

  messages.push(
    new HumanMessage(`Visitor (untrusted) says:\n\n<<<\n${query}\n>>>`),
  );

  return messages;
}
