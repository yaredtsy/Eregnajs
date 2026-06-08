import type { GraphState } from "../graph.js";
import { runNarrator } from "../../subagents/narrator/run.js";
import { pickModel } from "../../llm/provider.js";
import * as h from "../../patcher/helpers.js";

// Streams the popover body for the current step, then advances the step cursor.
export async function streamBodyNode(state: GraphState): Promise<Partial<GraphState>> {
  const { patcher, ctx, plan, chapterIndex, stepIndexInChapter, globalStepOffset, assistantMsgIndex, walkthroughPartIndex } = state;
  const conv = patcher!.conversation;
  const chapter = plan!.chapters[chapterIndex]!;
  const part = conv.messages[assistantMsgIndex]?.parts[walkthroughPartIndex];
  if (part?.type !== "walkthrough") return { stepIndexInChapter: stepIndexInChapter + 1 };

  const globalStepIdx = globalStepOffset + stepIndexInChapter;
  const step = part.steps[globalStepIdx];
  if (!step) return { stepIndexInChapter: stepIndexInChapter + 1 };

  h.setStepStatus(conv, assistantMsgIndex, walkthroughPartIndex, globalStepIdx, "running");
  if (!step.popover) {
    h.initStepPopover(conv, assistantMsgIndex, walkthroughPartIndex, globalStepIdx, chapter.elementId);
  }
  await patcher!.emit();

  if (step.popover !== undefined) {
    const model = pickModel(ctx!.agent.model);
    const stepSpec = {
      actions: step.actions,
      popoverElementId: step.popover.elementId,
      popoverTitle: step.popover.title,
    };

    for await (const chunk of runNarrator(model, chapter, stepSpec, stepIndexInChapter)) {
      h.appendPopoverChunk(conv, assistantMsgIndex, walkthroughPartIndex, globalStepIdx, chunk);
      await patcher!.emit();
    }
  }

  h.setStepStatus(conv, assistantMsgIndex, walkthroughPartIndex, globalStepIdx, "done");
  await patcher!.emit();

  // Advance the cursor — routeAfterBody reads the updated value.
  return { stepIndexInChapter: stepIndexInChapter + 1 };
}
