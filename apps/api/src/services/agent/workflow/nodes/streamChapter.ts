import { nanoid } from "nanoid";
import type { GraphState } from "../graph.js";
import { runStepper } from "../../subagents/stepper/run.js";
import { pickModel } from "../../llm/provider.js";
import { withRetry } from "../../llm/withRetry.js";
import * as h from "../../patcher/helpers.js";

// Runs the Stepper for the current chapter and adds its steps to the conversation.
// Also updates chapter.stepIndex to point at the first step of this chapter.
export async function streamChapterNode(state: GraphState): Promise<Partial<GraphState>> {
  const { patcher, ctx, plan, chapterIndex, globalStepOffset, assistantMsgIndex, walkthroughPartIndex } = state;
  const conv = patcher.conversation;
  const chapter = plan!.chapters[chapterIndex]!;

  const model = pickModel(ctx.agent.model);

  let stepList;
  try {
    stepList = await withRetry(() => runStepper(model, ctx, chapter), {
      label: `stepper(chapter ${chapterIndex})`,
    });
  } catch (err) {
    // Chapter-level degradation: this chapter is lost, the run is not.
    // With zero steps added, routeAfterBody falls straight through to the
    // next chapter.
    console.error(`[agent] stepper failed for chapter ${chapterIndex}; degrading`, err);
    h.setChapterStatus(conv, assistantMsgIndex, walkthroughPartIndex, chapterIndex, "failed");
    if (chapterIndex === 0) {
      h.setWalkthroughStatus(conv, assistantMsgIndex, walkthroughPartIndex, "playing");
    }
    await patcher.emit();
    return { stepIndexInChapter: 0 };
  }

  // Mark chapter as starting at this global step offset
  h.setChapterStepIndex(conv, assistantMsgIndex, walkthroughPartIndex, chapterIndex, globalStepOffset);
  h.setChapterStatus(conv, assistantMsgIndex, walkthroughPartIndex, chapterIndex, "active");

  // Add each step (popover body starts empty; Narrator fills it)
  for (const spec of stepList.steps) {
    h.addStep(conv, assistantMsgIndex, walkthroughPartIndex, {
      id: nanoid(10),
      status: "pending",
      actions: spec.actions,
      popover: spec.popoverElementId || spec.popoverTitle
        ? { body: "", elementId: spec.popoverElementId, title: spec.popoverTitle }
        : undefined,
    });
  }

  // Flip to "playing" once first chapter's steps are known
  if (chapterIndex === 0) {
    h.setWalkthroughStatus(conv, assistantMsgIndex, walkthroughPartIndex, "playing");
  }

  await patcher.emit();

  return {
    stepIndexInChapter: 0,
    // globalStepOffset grows by the number of steps added
    // (updated after streamBody loop; we return unchanged here — streamBody tracks it)
  };
}
