import { createAgent } from "langchain";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage, HumanMessage, type BaseMessage } from "@langchain/core/messages";
import type { AgentContext } from "../context/types.js";
import { composeSystemPrompt } from "../prompts/index.js";
import { getCheckpointer } from "./checkpointer.js";

export function buildChatAgentMessages(ctx: AgentContext, query: string): BaseMessage[] {
  const messages: BaseMessage[] = [];

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

export function buildChatAgent(model: BaseChatModel, ctx: AgentContext) {
  return createAgent({
    model,
    tools: [],
    systemPrompt: composeSystemPrompt(ctx),
    checkpointer: getCheckpointer(),
  });
}
