import type { WalkthroughPart } from "../types/conversation";
import { playStep } from "./playStep.js";
import { waitForStep } from "./waitLiveAdvance.js";
import { clearHighlight } from "./actions/highlight.js";

export interface LiveEngineHandle {
  stop(): void;
}

export function startLiveEngine(
  walkthroughId: string,
  getWt: () => WalkthroughPart | null,
  onStepStart: (stepIndex: number) => void,
  onStepDone: (stepIndex: number) => void,
): LiveEngineHandle {
  let stopped = false;

  async function run() {
    let stepIndex = 0;
    while (!stopped) {
      const ready = await waitForStep(getWt, stepIndex);
      if (!ready || stopped) break;

      const wt = getWt();
      const step = wt?.steps[stepIndex];
      if (!step) break;

      onStepStart(stepIndex);
      await playStep(step);
      onStepDone(stepIndex);

      const nextWt = getWt();
      if (!nextWt || stepIndex >= nextWt.steps.length - 1) {
        // Wait for more steps or completion
        const deadline = Date.now() + 60_000;
        while (Date.now() < deadline && !stopped) {
          const current = getWt();
          if (!current) break;
          if (current.status === "complete" || current.status === "error") break;
          if (current.steps.length > stepIndex + 1) break;
          await new Promise((r) => setTimeout(r, 50));
        }
        const updated = getWt();
        if (!updated || updated.steps.length <= stepIndex + 1) break;
      }

      stepIndex++;
    }
    clearHighlight();
  }

  void run();

  return {
    stop() {
      stopped = true;
      clearHighlight();
    },
  };
}
