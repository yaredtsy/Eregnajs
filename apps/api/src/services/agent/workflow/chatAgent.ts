import { createAgent, tool } from "langchain";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage, HumanMessage, type BaseMessage } from "@langchain/core/messages";
import type { AgentContext } from "../context/types.js";
import { composeSystemPrompt } from "../prompts/index.js";
import { getCheckpointer } from "./checkpointer.js";
import type { ToolDescriptor } from "../tools/types.js";
import { jsonSchemaToZod } from "../tools/jsonSchemaToZod.js";
import { createClientToolInterruptMiddleware } from "./middleware/clientToolInterrupt.js";

export function buildChatAgentMessages(ctx: AgentContext, query: string): BaseMessage[] {
  const messages: BaseMessage[] = [];

  for (const turn of ctx.conversationHistory) {
    if (turn.role === "user") messages.push(new HumanMessage(turn.text));
    else messages.push(new AIMessage(turn.text));
  }

  messages.push(
    new HumanMessage(
      `Answer the visitor's question in plain text. Be concise and helpful. Do not plan a walkthrough unless they explicitly ask for step-by-step guidance on the page.

When a registered tool can help, call exactly one tool at a time and wait for the result before continuing.

Question: ${query}`,
    ),
  );

  return messages;
}

export function buildChatAgent(model: BaseChatModel, ctx: AgentContext, specs: ToolDescriptor[] = []) {
  const tools = specs.map((spec) =>
    tool(
      async () => JSON.stringify({ ok: false, error: "server-tools-not-wired-yet" }),
      {
        name: spec.name,
        description: spec.description,
        schema: jsonSchemaToZod(spec.parameters),
      },
    ),
  );

  const middleware = specs.some((s) => s.runsIn === "client")
    ? [createClientToolInterruptMiddleware(specs)]
    : [];

  return createAgent({
    model,
    tools,
    systemPrompt: composeSystemPrompt(ctx),
    middleware,
    checkpointer: getCheckpointer(),
  });
}

export type ChatAgent = ReturnType<typeof buildChatAgent>;
