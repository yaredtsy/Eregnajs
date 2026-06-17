import type { StepToolResult, WalkthroughStep } from "../types/conversation";
import { scrollTo, highlight, waitMs, waitForClick, callTool } from "./actions/index.js";

export type StepPlayResult =
  | { status: "done"; toolResult?: StepToolResult }
  | { status: "skipped"; reason: string; hint?: string; toolResult?: StepToolResult };

const MAX_WAIT_MS = 10_000;

// Plays one step's actions sequentially. Every failure becomes a visible
// state (skip + reason), never an exception (docs/v2/4-client/03 §4).
export async function playStep(step: WalkthroughStep): Promise<StepPlayResult> {
  let toolResult: StepToolResult | undefined;

  for (const action of step.actions) {
    switch (action.type) {
      case "scroll-to":
        // Soft: a missing scroll target alone doesn't kill the step —
        // the highlight decides.
        await scrollTo(action.elementId);
        break;

      case "highlight": {
        const found = await highlight(action.elementId);
        if (!found) {
          return {
            status: "skipped",
            reason: `element-not-found:${action.elementId}`,
            toolResult,
          };
        }
        break;
      }

      case "wait":
        await waitMs(Math.min(action.ms, MAX_WAIT_MS));
        break;

      case "wait-for-click": {
        const result = await waitForClick(action.elementId, action.timeoutMs);
        if (result === "timeout") {
          return {
            status: "skipped",
            reason: `click-timeout:${action.elementId}`,
            toolResult,
          };
        }
        break;
      }

      case "call-tool": {
        toolResult = await callTool(action.toolName, action.args);
        if (toolResult.status === "error") {
          return {
            status: "skipped",
            reason: `tool-error:${action.toolName}`,
            hint: toolResult.hint,
            toolResult,
          };
        }
        break;
      }
    }
  }

  return { status: "done", toolResult };
}
