import type { GraphState } from "../graph.js";
import { runNarrator } from "../../subagents/narrator/run.js";
import { pickModel } from "../../llm/provider.js";
import { syncMessageTokenUsage } from "../../telemetry/index.js";
import * as h from "../../patcher/helpers.js";

// Streams the popover body for the current step, then advances the step cursor.
export async function streamBodyNode(state: GraphState): Promise<Partial<GraphState>> {
  const {
    patcher,
    ctx,
    plan,
    chapterIndex,
    stepIndexInChapter,
    globalStepOffset,
    assistantMsgIndex,
    walkthroughPartIndex,
    usageLedger,
  } = state;
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

    let streamed = false;
    const narrate = async () => {
      for await (const chunk of runNarrator(model, chapter, stepSpec, stepIndexInChapter, {
        ledger: usageLedger,
        model: ctx!.agent.model,
        chapterIndex,
        stepIndex: globalStepIdx,
      })) {
        streamed = true;
        h.appendPopoverChunk(conv, assistantMsgIndex, walkthroughPartIndex, globalStepIdx, chunk);
        await patcher!.emit();
      }
      syncMessageTokenUsage(conv, assistantMsgIndex, usageLedger);
    };

    try {
      await narrate();
    } catch (err) {
      if (streamed) {
        // Mid-stream break: the partial body is still useful — keep the step.
        console.warn(`[agent] narrator broke mid-step ${globalStepIdx}; keeping partial body`, err);
      } else {
        try {
          await narrate();
        } catch (retryErr) {
          // Step-level degradation: skip this step's narration, keep the run.
          console.error(`[agent] narrator failed for step ${globalStepIdx}; skipping`, retryErr);
          h.setStepStatus(conv, assistantMsgIndex, walkthroughPartIndex, globalStepIdx, "skipped", "narration-failed");
          await patcher!.emit();
          return { stepIndexInChapter: stepIndexInChapter + 1 };
        }
      }
    }
  }

  h.setStepStatus(conv, assistantMsgIndex, walkthroughPartIndex, globalStepIdx, "done");
  await patcher!.emit();

  // Advance the cursor — routeAfterBody reads the updated value.
  return { stepIndexInChapter: stepIndexInChapter + 1 };
}
