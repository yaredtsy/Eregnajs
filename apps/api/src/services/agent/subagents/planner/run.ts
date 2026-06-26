import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { z } from "zod";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { nanoid } from "nanoid";
import type { AgentContext } from "../../context/types.js";
import { composeSystemPrompt, PLANNER_SECTIONS } from "../../prompts/index.js";
import type { Patcher } from "../../patcher/createPatcher.js";
import type { TokenLedger } from "../../telemetry/index.js";
import { trackStructuredInvoke } from "../../telemetry/index.js";
import * as h from "../../patcher/helpers.js";
import {
  buildChaptersPrompt,
  buildFramePrompt,
  buildReasoningPrompt,
  formatFrameAsPrior,
  formatReasoningAsPrior,
} from "./prompt.js";
import { ChaptersSchema, PlanFrameSchema, PlanReasoningSchema } from "./schema.js";
import type { Plan, PlanFrame, PlanReasoning } from "../types.js";
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
  patcher?: Patcher;
  msgIndex?: number;
  partIndex?: number;
}

async function invokeStructured<T>(
  model: BaseChatModel,
  schema: z.ZodType<T>,
  messages: (SystemMessage | HumanMessage | AIMessage)[],
  opts: PlannerRunOpts | undefined,
  label: string,
  modelName: string,
  meta?: Record<string, unknown>,
): Promise<T> {
  if (opts?.ledger) {
    return (await trackStructuredInvoke(model, schema, messages, {
      ledger: opts.ledger,
      label,
      model: modelName,
      meta,
    })) as T;
  }
  return (await model.withStructuredOutput(schema).invoke(messages)) as T;
}

function emitPlanThought(
  opts: PlannerRunOpts | undefined,
  label: string,
): void {
  if (!opts?.patcher || opts.msgIndex === undefined || opts.partIndex === undefined) return;
  h.addThought(opts.patcher.conversation, opts.msgIndex, opts.partIndex, {
    id: nanoid(8),
    phase: "plan",
    label,
    ts: Date.now(),
  });
}

export async function runPlanner(
  model: BaseChatModel,
  ctx: AgentContext,
  goal: string,
  opts?: PlannerRunOpts,
): Promise<Plan> {
  return (await runPlannerDetailed(model, ctx, goal, opts)).plan;
}

export async function runPlannerDetailed(
  model: BaseChatModel,
  ctx: AgentContext,
  goal: string,
  opts?: PlannerRunOpts,
): Promise<PlannerRunResult> {
  const systemPrompt = composeSystemPrompt(ctx, PLANNER_SECTIONS);
  const keys = validElementKeys(ctx);
  const systemMessage = new SystemMessage(systemPrompt);

  let repairAttempted = false;
  let droppedChapterKeys: string[] = [];

  emitPlanThought(opts, "Reading your goal…");
  if (opts?.patcher) await opts.patcher.emit();

  emitPlanThought(opts, "Thinking through your goal…");
  if (opts?.patcher) await opts.patcher.emit();

  const reasoningMessages = [
    systemMessage,
    new HumanMessage(buildReasoningPrompt(ctx, goal)),
  ];
  const reasoning = (await invokeStructured<PlanReasoning>(
    model,
    PlanReasoningSchema,
    reasoningMessages,
    opts,
    "planner-reason",
    ctx.agent.model,
    { stage: 1 },
  )) as PlanReasoning;

  if (opts?.patcher && opts.msgIndex !== undefined && opts.partIndex !== undefined) {
    h.setWalkthroughReasoning(opts.patcher.conversation, opts.msgIndex, opts.partIndex, reasoning);
    await opts.patcher.emit();
  }

  const frameMessages = [
    systemMessage,
    new HumanMessage(buildReasoningPrompt(ctx, goal)),
    new AIMessage(formatReasoningAsPrior(reasoning)),
    new HumanMessage(buildFramePrompt(goal)),
  ];
  const frame = (await invokeStructured<PlanFrame>(
    model,
    PlanFrameSchema,
    frameMessages,
    opts,
    "planner-frame",
    ctx.agent.model,
    { stage: 2 },
  )) as PlanFrame;

  if (opts?.patcher && opts.msgIndex !== undefined && opts.partIndex !== undefined) {
    h.setPlanGoal(
      opts.patcher.conversation,
      opts.msgIndex,
      opts.partIndex,
      frame.planGoal,
      frame.planRationale,
    );
    h.addThought(opts.patcher.conversation, opts.msgIndex, opts.partIndex, {
      id: nanoid(8),
      phase: "plan",
      label: frame.thought,
      ts: Date.now(),
    });
    await opts.patcher.emit();
  }

  emitPlanThought(opts, "Mapping out chapters…");
  if (opts?.patcher) await opts.patcher.emit();

  const invokeChapters = async (repairHint?: string, attempt = 1) => {
    const chaptersMessages = [
      systemMessage,
      new HumanMessage(buildReasoningPrompt(ctx, goal)),
      new AIMessage(formatReasoningAsPrior(reasoning)),
      new AIMessage(formatFrameAsPrior(frame)),
      new HumanMessage(buildChaptersPrompt(ctx, goal, repairHint)),
    ];
    const result = await invokeStructured<{ chapters: Plan["chapters"] }>(
      model,
      ChaptersSchema,
      chaptersMessages,
      opts,
      "planner-chapters",
      ctx.agent.model,
      { stage: 3, attempt, repair: Boolean(repairHint) },
    );
    return result.chapters;
  };

  let chapters = await invokeChapters();
  let plan: Plan = { reasoning, ...frame, chapters };
  let validationError = validatePlanKeys(plan, keys);

  if (validationError) {
    repairAttempted = true;
    chapters = await invokeChapters(validationError, 2);
    plan = { reasoning, ...frame, chapters };
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

  if (opts?.patcher && opts.msgIndex !== undefined && opts.partIndex !== undefined) {
    const conv = opts.patcher.conversation;
    const part = conv.messages[opts.msgIndex]?.parts[opts.partIndex];
    if (part?.type === "walkthrough") {
      part.chapters = [];
    }
    for (const chapter of plan.chapters) {
      h.addChapter(conv, opts.msgIndex, opts.partIndex, {
        title: chapter.title,
        description: chapter.description,
        elementId: chapter.elementId,
        intent: chapter.intent,
        expectedSteps: chapter.expectedSteps,
        stepIndex: -1,
        status: "pending",
      });
    }
    h.setWalkthroughStatus(conv, opts.msgIndex, opts.partIndex, "planned");
    await opts.patcher.emit();
  }

  return {
    plan,
    systemPrompt,
    userPrompt: buildReasoningPrompt(ctx, goal),
    repairAttempted,
    droppedChapterKeys,
  };
}
