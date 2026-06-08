import { HumanMessage } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { AgentContext } from "../../context/types.js";
import { focusChapter } from "../../context/focusChapter.js";
import { buildStepperPrompt } from "./prompt.js";
import { StepListSchema } from "./schema.js";
import type { PlanChapter, StepList } from "../types.js";

export async function runStepper(
  model: BaseChatModel,
  ctx: AgentContext,
  chapter: PlanChapter,
): Promise<StepList> {
  const chapterCtx = focusChapter(ctx, chapter.elementId);
  const structured = model.withStructuredOutput(StepListSchema);

  const result = await structured.invoke([
    new HumanMessage(buildStepperPrompt(ctx, chapter, chapterCtx)),
  ]);

  return { steps: result.steps };
}
