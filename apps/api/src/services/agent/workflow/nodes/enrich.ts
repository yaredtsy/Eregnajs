import { nanoid } from "nanoid";
import type { GraphState } from "../graph.js";
import * as h from "../../patcher/helpers.js";

// Sets up the conversation mirror with the user message, assistant message,
// and an empty walkthrough part. Emits two frames.
export async function enrichNode(state: GraphState): Promise<Partial<GraphState>> {
  const { patcher, query } = state;
  const conv = patcher.conversation;

  h.addUserMessage(conv, nanoid(10), query);
  await patcher.emit();

  const asstMsgId = nanoid(10);
  h.addAssistantMessage(conv, asstMsgId);
  await patcher.emit();

  const assistantMsgIndex = conv.messages.length - 1;

  const wtId = nanoid(10);
  const wtPartIdx = h.addWalkthroughPart(conv, assistantMsgIndex, wtId, "");
  await patcher.emit();

  return { assistantMsgIndex, walkthroughPartIndex: wtPartIdx };
}
