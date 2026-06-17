import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { AgentContext } from "../../context/types.js";
import { composeSystemPrompt } from "../../prompts/index.js";
import { buildPlannerPrompt } from "./prompt.js";
import { PlanSchema } from "./schema.js";
import type { Plan } from "../types.js";
import {
  filterInvalidChapters,
  validElementKeys,
  validatePlanKeys,
} from "../validate.js";

export interface PlannerRunResult {
  plan: Plan;
  systemPrompt: string;
  userPrompt: string;
  repairAttempted: boolean;
  droppedChapterKeys: string[];
}

export async function runPlanner(
  model: BaseChatModel,
  ctx: AgentContext,
  query: string,
): Promise<Plan> {
  return (await runPlannerDetailed(model, ctx, query)).plan;
}

export async function runPlannerDetailed(
  model: BaseChatModel,
  ctx: AgentContext,
  query: string,
): Promise<PlannerRunResult> {
  const structured = model.withStructuredOutput(PlanSchema);
  const systemPrompt = composeSystemPrompt(ctx);
  const keys = validElementKeys(ctx);

  let repairAttempted = false;
  let droppedChapterKeys: string[] = [];

  const invoke = async (repairHint?: string) => {
    const userPrompt = buildPlannerPrompt(ctx, query, repairHint);
    const result = await structured.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt),
    ]);
    return {
      planGoal: result.planGoal,
      planRationale: result.planRationale,
      thought: result.thought,
      chapters: result.chapters,
    } as Plan;
  };

  let plan = await invoke();
  let validationError = validatePlanKeys(plan, keys);

  if (validationError) {
    repairAttempted = true;
    plan = await invoke(validationError);
    validationError = validatePlanKeys(plan, keys);
  }

  if (validationError) {
    const filtered = filterInvalidChapters(plan, keys);
    plan = filtered.plan;
    droppedChapterKeys = filtered.dropped;
    if (droppedChapterKeys.length > 0) {
      plan = {
        ...plan,
        thought: `${plan.thought} (skipped ${droppedChapterKeys.length} chapter(s) with unknown keys)`,
      };
    }
  }

  if (plan.chapters.length === 0) {
    throw new Error("Planner produced no valid chapters after key validation");
  }

  return {
    plan,
    systemPrompt,
    userPrompt: buildPlannerPrompt(ctx, query),
    repairAttempted,
    droppedChapterKeys,
  };
}
