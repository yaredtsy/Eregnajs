import type { GraphState } from "../graph.js";
import { syncMessageTokenUsage } from "../../telemetry/index.js";
import * as h from "../../patcher/helpers.js";

export async function completeNode(state: GraphState): Promise<Partial<GraphState>> {
  const { patcher, assistantMsgIndex, walkthroughPartIndex, usageLedger } = state;
  const conv = patcher.conversation;

  syncMessageTokenUsage(conv, assistantMsgIndex, usageLedger);
  h.setWalkthroughStatus(conv, assistantMsgIndex, walkthroughPartIndex, "complete");
  h.setMessageStatus(conv, assistantMsgIndex, "complete");
  await patcher.emit();

  return {};
}
