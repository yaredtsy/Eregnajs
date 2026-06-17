import type { WalkthroughPart } from "../types/conversation";
import { playStep, type StepPlayResult } from "./playStep.js";
import { waitForStep } from "./waitLiveAdvance.js";
import { clearHighlight } from "./actions/highlight.js";

export interface LiveEngineHandle {
  stop(): void;
}

// Skipped steps dwell briefly so the notice card is readable before the
// walkthrough moves on (docs/v2/4-client/03 §3).
const SKIP_DWELL_MS = 2_500;

export function startLiveEngine(
  _walkthroughId: string,
  getWt: () => WalkthroughPart | null,
  onStepStart: (stepIndex: number) => void,
  onStepDone: (stepIndex: number, result: StepPlayResult) => void,
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
      const result = await playStep(step);
      onStepDone(stepIndex, result);
      if (result.status === "skipped" && !stopped) {
        await new Promise((r) => setTimeout(r, SKIP_DWELL_MS));
      }

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
