import type { WalkthroughStep } from "./types.js";

export const TYPEWRITER_MS_PER_CHAR = 22;
export const POST_POPOVER_PAUSE_MS = 900;
export const ACTION_DURATION_MS = 1600;

export function computeStepDuration(step: WalkthroughStep): number {
  if (!step.popover) return ACTION_DURATION_MS;
  return step.popover.body.length * TYPEWRITER_MS_PER_CHAR + POST_POPOVER_PAUSE_MS;
}
