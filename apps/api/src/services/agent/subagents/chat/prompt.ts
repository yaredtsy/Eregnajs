import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { AgentContext } from "../../context/types.js";
import { composeSystemPrompt } from "../../prompts/index.js";

export function buildChatMessages(ctx: AgentContext, query: string): BaseMessage[] {
  const messages: BaseMessage[] = [new SystemMessage(composeSystemPrompt(ctx))];

  for (const turn of ctx.conversationHistory) {
    if (turn.role === "user") messages.push(new HumanMessage(turn.text));
    else messages.push(new AIMessage(turn.text));
  }

  messages.push(
    new HumanMessage(
      `Answer the visitor's question in plain text. Be concise and helpful. Do not plan a walkthrough unless they explicitly ask for step-by-step guidance on the page.

Question: ${query}`,
    ),
  );

  return messages;
}
