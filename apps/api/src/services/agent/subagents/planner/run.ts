import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { AgentContext } from "../../context/types.js";
import { composeSystemPrompt } from "../../prompts/index.js";
import type { TokenLedger } from "../../telemetry/index.js";
import { trackStructuredInvoke } from "../../telemetry/index.js";
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

export interface PlannerRunOpts {
  ledger?: TokenLedger;
}

export async function runPlanner(
  model: BaseChatModel,
  ctx: AgentContext,
  query: string,
  opts?: PlannerRunOpts,
): Promise<Plan> {
  return (await runPlannerDetailed(model, ctx, query, opts)).plan;
}

export async function runPlannerDetailed(
  model: BaseChatModel,
  ctx: AgentContext,
  query: string,
  opts?: PlannerRunOpts,
): Promise<PlannerRunResult> {
  const systemPrompt = composeSystemPrompt(ctx);
  const keys = validElementKeys(ctx);

  let repairAttempted = false;
  let droppedChapterKeys: string[] = [];

  const invoke = async (repairHint?: string, attempt = 1) => {
    const userPrompt = buildPlannerPrompt(ctx, query, repairHint);
    const messages = [new SystemMessage(systemPrompt), new HumanMessage(userPrompt)];

    const trackMeta = { attempt, repair: Boolean(repairHint) };
    const result = opts?.ledger
      ? await trackStructuredInvoke(model, PlanSchema, messages, {
          ledger: opts.ledger,
          label: "planner",
          model: ctx.agent.model,
          meta: trackMeta,
        })
      : await model.withStructuredOutput(PlanSchema).invoke(messages);

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
    plan = await invoke(validationError, 2);
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
