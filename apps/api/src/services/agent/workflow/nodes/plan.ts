import type { GraphState } from "../graph.js";
import { runPlanner } from "../../subagents/planner/run.js";
import { pickModel } from "../../llm/provider.js";
import { withRetry } from "../../llm/withRetry.js";
import * as h from "../../patcher/helpers.js";

export async function planNode(state: GraphState): Promise<Partial<GraphState>> {
  const { patcher, ctx, query, assistantMsgIndex, walkthroughPartIndex } = state;
  const conv = patcher.conversation;

  const model = pickModel(ctx.agent.model);
  // Planner failure after retries is fatal for the run: there is nothing to
  // degrade to. run.ts turns the throw into an error patch + end frame.
  const plan = await withRetry(() => runPlanner(model, ctx, query), { label: "planner" });

  // Update walkthrough goal now that we have it
  const part = conv.messages[assistantMsgIndex]?.parts[walkthroughPartIndex];
  if (part?.type === "walkthrough") {
    part.planGoal = plan.planGoal;
    if (plan.planRationale) part.planRationale = plan.planRationale;
  }

  // Add all chapters (checklist visible to user immediately)
  for (const chapter of plan.chapters) {
    h.addChapter(conv, assistantMsgIndex, walkthroughPartIndex, {
      title: chapter.title,
      description: chapter.description,
      elementId: chapter.elementId,
      stepIndex: -1,
      status: "pending",
    });
  }

  await patcher.emit();
  return { plan };
}
