import type { WalkthroughPart } from "../types/conversation";

const POLL_INTERVAL_MS = 50;
const MAX_WAIT_MS = 60_000;

// Waits until the step at `stepIndex` exists in the walkthrough and its
// popover body is non-empty (i.e. the Narrator has started streaming).
export async function waitForStep(
  getWt: () => WalkthroughPart | null,
  stepIndex: number,
): Promise<boolean> {
  const deadline = Date.now() + MAX_WAIT_MS;
  while (Date.now() < deadline) {
    const wt = getWt();
    if (wt && wt.steps[stepIndex]) return true;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  return false;
}

// Waits until the walkthrough's status becomes "complete" or "error".
export async function waitForComplete(
  getWt: () => WalkthroughPart | null,
): Promise<void> {
  const deadline = Date.now() + MAX_WAIT_MS;
  while (Date.now() < deadline) {
    const wt = getWt();
    if (wt?.status === "complete" || wt?.status === "error") return;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}
