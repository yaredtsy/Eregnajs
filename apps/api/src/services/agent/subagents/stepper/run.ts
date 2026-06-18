import { HumanMessage } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { AgentContext } from "../../context/types.js";
import { focusChapter } from "../../context/focusChapter.js";
import type { TokenLedger } from "../../telemetry/index.js";
import { trackStructuredInvoke } from "../../telemetry/index.js";
import { buildStepperPrompt } from "./prompt.js";
import { StepListSchema } from "./schema.js";
import type { PlanChapter, StepList } from "../types.js";
import { sanitizeStepList } from "../validate.js";

export interface StepperRunResult {
  stepList: StepList;
  prompt: string;
  repairAttempted: boolean;
}

export interface StepperRunOpts {
  ledger?: TokenLedger;
  chapterIndex?: number;
}

export async function runStepper(
  model: BaseChatModel,
  ctx: AgentContext,
  chapter: PlanChapter,
  opts?: StepperRunOpts,
): Promise<StepList> {
  return (await runStepperDetailed(model, ctx, chapter, opts)).stepList;
}

export async function runStepperDetailed(
  model: BaseChatModel,
  ctx: AgentContext,
  chapter: PlanChapter,
  opts?: StepperRunOpts,
): Promise<StepperRunResult> {
  const chapterCtx = focusChapter(ctx, chapter.elementId);

  let repairAttempted = false;

  const invoke = async (repairHint?: string, attempt = 1) => {
    const prompt = buildStepperPrompt(ctx, chapter, chapterCtx, repairHint);
    const messages = [new HumanMessage(prompt)];

    const result = opts?.ledger
      ? await trackStructuredInvoke(model, StepListSchema, messages, {
          ledger: opts.ledger,
          label: "stepper",
          model: ctx.agent.model,
          meta: { chapterIndex: opts.chapterIndex, attempt, repair: Boolean(repairHint) },
        })
      : await model.withStructuredOutput(StepListSchema).invoke(messages);

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
    stepList = await invoke(`Schema parse failed: ${message}`, 2);
  }

  return {
    stepList,
    prompt: buildStepperPrompt(ctx, chapter, chapterCtx),
    repairAttempted,
  };
}
