import type { WalkthroughStep, WalkthroughAction } from "../types/conversation";
import { scrollTo, highlight, waitMs, waitForClick, callTool } from "./actions/index.js";

async function runAction(action: WalkthroughAction): Promise<void> {
  switch (action.type) {
    case "scroll-to":
      await scrollTo(action.elementId);
      break;
    case "highlight":
      await highlight(action.elementId);
      break;
    case "wait":
      await waitMs(action.ms);
      break;
    case "wait-for-click":
      await waitForClick(action.elementId, action.timeoutMs);
      break;
    case "call-tool":
      await callTool(action.toolName, action.args);
      break;
  }
}

export async function playStep(step: WalkthroughStep): Promise<void> {
  for (const action of step.actions) {
    await runAction(action);
  }
}
