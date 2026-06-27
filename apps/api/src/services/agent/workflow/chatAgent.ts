import { createAgent, tool } from "langchain";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatOpenAI } from "@langchain/openai";
import { AIMessage, HumanMessage, type BaseMessage } from "@langchain/core/messages";
import type { AgentContext } from "../context/types.js";
import { composeSystemPrompt, CHAT_SECTIONS } from "../prompts/index.js";
import { bindOrchestratorOptions } from "../llm/openai.js";
import { getCheckpointer } from "./checkpointer.js";
import type { ToolDescriptor } from "../tools/types.js";
import { jsonSchemaToZod } from "../tools/jsonSchemaToZod.js";
import { createClientToolInterruptMiddleware } from "./middleware/clientToolInterrupt.js";
import { createWalkthroughContextMiddleware } from "./middleware/walkthroughContext.js";
import { startWalkthroughTool } from "../tools/builtin/startWalkthrough.js";
import type { Patcher } from "../patcher/createPatcher.js";

const CHAT_MODE_SUFFIX = `
## This turn
Answer the visitor below using only the context above.
When a registered tool can help, call exactly one tool at a time and wait for the result before continuing.
`.trim();

export function buildChatAgentMessages(ctx: AgentContext, query: string): BaseMessage[] {
  const messages: BaseMessage[] = [];

  for (const turn of ctx.conversationHistory) {
    if (turn.role === "user") messages.push(new HumanMessage(turn.text));
    else messages.push(new AIMessage(turn.text));
  }

  messages.push(
    new HumanMessage(`Visitor (untrusted) says:\n\n<<<\n${query}\n>>>`),
  );

  return messages;
}

export function buildChatAgent(
  model: BaseChatModel,
  ctx: AgentContext,
  specs: ToolDescriptor[] = [],
  patcher?: Patcher,
  getAssistantMsgIndex?: () => number,
) {
  const hostTools = specs.map((spec) =>
    tool(
      async () => JSON.stringify({ ok: false, error: "server-tools-not-wired-yet" }),
      {
        name: spec.name,
        description: spec.description,
        schema: jsonSchemaToZod(spec.parameters),
      },
    ),
  );

  const tools = [
    ...hostTools,
    ...(patcher && getAssistantMsgIndex
      // Raw model — planner structured-output calls must not carry
      // parallel_tool_calls (see docs/v2/11-walkthrough/fixes/03).
      ? [startWalkthroughTool(model, ctx, patcher, getAssistantMsgIndex)]
      : []),
  ];

  const middleware = [
    ...(patcher ? [createWalkthroughContextMiddleware(patcher)] : []),
    ...(specs.some((s) => s.runsIn === "client")
      ? [createClientToolInterruptMiddleware(specs)]
      : []),
  ];


  const systemPrompt =
    composeSystemPrompt(ctx, CHAT_SECTIONS) + "\n\n" + CHAT_MODE_SUFFIX;

  // parallel_tool_calls only on orchestrator turns (tools present); planner uses raw model.
  const orchestratorModel =
    model instanceof ChatOpenAI ? bindOrchestratorOptions(model) : model;

  return createAgent({
    model: orchestratorModel,
    tools,
    systemPrompt,
    middleware,
    checkpointer: getCheckpointer(),
  });
}

export type ChatAgent = ReturnType<typeof buildChatAgent>;
