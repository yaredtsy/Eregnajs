import { nanoid } from "nanoid";
import type { GraphState } from "../graph.js";
import * as h from "../../patcher/helpers.js";
import { buildManifest } from "../../context/util/elementKey.js";

// Sets up the conversation mirror with the user message, assistant message,
// and an empty walkthrough part carrying the element manifest — the engine
// needs key→selector addressing before any LLM output arrives.
export async function enrichNode(state: GraphState): Promise<Partial<GraphState>> {
  const { patcher, query, ctx } = state;
  const conv = patcher.conversation;

  h.addUserMessage(conv, nanoid(10), query);
  await patcher.emit();

  const asstMsgId = nanoid(10);
  h.addAssistantMessage(conv, asstMsgId);
  await patcher.emit();

  const assistantMsgIndex = conv.messages.length - 1;

  const wtId = nanoid(10);
  const manifest = buildManifest(ctx.elements);
  const wtPartIdx = h.addWalkthroughPart(conv, assistantMsgIndex, wtId, "", undefined, manifest);
  await patcher.emit();

  return { assistantMsgIndex, walkthroughPartIndex: wtPartIdx };
}
