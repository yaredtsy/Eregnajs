import type { GraphState } from "../graph.js";
import { runPlanner } from "../../subagents/planner/run.js";
import { pickModel } from "../../llm/provider.js";
import { withRetry } from "../../llm/withRetry.js";
import { syncMessageTokenUsage } from "../../telemetry/index.js";
import * as h from "../../patcher/helpers.js";
import { nanoid } from "nanoid";

export async function planNode(state: GraphState): Promise<Partial<GraphState>> {
  const { patcher, ctx, query, assistantMsgIndex, walkthroughPartIndex, usageLedger } = state;
  const conv = patcher.conversation;

  const model = pickModel(ctx.agent.model);
  const plan = await withRetry(
    () => runPlanner(model, ctx, query, { ledger: usageLedger }),
    { label: "planner" },
  );

  const part = conv.messages[assistantMsgIndex]?.parts[walkthroughPartIndex];
  if (part?.type === "walkthrough") {
    if (plan.reasoning) part.reasoning = plan.reasoning;
    part.planGoal = plan.planGoal;
    if (plan.planRationale) part.planRationale = plan.planRationale;
  }

  h.addThought(conv, assistantMsgIndex, walkthroughPartIndex, {
    id: nanoid(8),
    phase: "plan",
    label: plan.thought,
    ts: Date.now(),
  });

  for (const chapter of plan.chapters) {
    h.addChapter(conv, assistantMsgIndex, walkthroughPartIndex, {
      title: chapter.title,
      description: chapter.description,
      elementId: chapter.elementId,
      intent: chapter.intent,
      expectedSteps: chapter.expectedSteps,
      stepIndex: -1,
      status: "pending",
    });
  }

  syncMessageTokenUsage(conv, assistantMsgIndex, usageLedger);
  await patcher.emit();
  return { plan };
}
