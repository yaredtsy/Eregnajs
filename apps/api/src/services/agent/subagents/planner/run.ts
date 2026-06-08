import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { AgentContext } from "../../context/types.js";
import { composeSystemPrompt } from "../../prompts/index.js";
import { buildPlannerPrompt } from "./prompt.js";
import { PlanSchema } from "./schema.js";
import type { Plan } from "../types.js";

export async function runPlanner(
  model: BaseChatModel,
  ctx: AgentContext,
  query: string,
): Promise<Plan> {
  const structured = model.withStructuredOutput(PlanSchema);

  const systemPrompt = composeSystemPrompt(ctx);
  const userPrompt = buildPlannerPrompt(ctx, query);

  const result = await structured.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(userPrompt),
  ]);

  return {
    planGoal: result.planGoal,
    planRationale: result.planRationale,
    chapters: result.chapters,
  };
}
