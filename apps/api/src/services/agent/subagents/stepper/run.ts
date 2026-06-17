import { HumanMessage } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { AgentContext } from "../../context/types.js";
import { focusChapter } from "../../context/focusChapter.js";
import { buildStepperPrompt } from "./prompt.js";
import { StepListSchema } from "./schema.js";
import type { PlanChapter, StepList } from "../types.js";
import { sanitizeStepList } from "../validate.js";

export interface StepperRunResult {
  stepList: StepList;
  prompt: string;
  repairAttempted: boolean;
}

export async function runStepper(
  model: BaseChatModel,
  ctx: AgentContext,
  chapter: PlanChapter,
): Promise<StepList> {
  return (await runStepperDetailed(model, ctx, chapter)).stepList;
}

export async function runStepperDetailed(
  model: BaseChatModel,
  ctx: AgentContext,
  chapter: PlanChapter,
): Promise<StepperRunResult> {
  const chapterCtx = focusChapter(ctx, chapter.elementId);
  const structured = model.withStructuredOutput(StepListSchema);

  let repairAttempted = false;

  const invoke = async (repairHint?: string) => {
    const prompt = buildStepperPrompt(ctx, chapter, chapterCtx, repairHint);
    const result = await structured.invoke([new HumanMessage(prompt)]);
    return sanitizeStepList(
      { thought: result.thought, steps: result.steps },
      ctx,
      chapter,
    );
  };

  let stepList: StepList;
  try {
    stepList = await invoke();
  } catch (err) {
    repairAttempted = true;
    const message = err instanceof Error ? err.message : String(err);
    stepList = await invoke(`Schema parse failed: ${message}`);
  }

  return {
    stepList,
    prompt: buildStepperPrompt(ctx, chapter, chapterCtx),
    repairAttempted,
  };
}
