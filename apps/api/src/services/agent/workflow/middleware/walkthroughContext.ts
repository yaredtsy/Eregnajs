import { createMiddleware } from "langchain";
import { SystemMessage } from "@langchain/core/messages";
import type { Conversation, WalkthroughPart } from "@repo/walkthrough-core";
import type { Patcher } from "../../patcher/createPatcher.js";
import { renderActiveWalkthroughMarkdown } from "./walkthroughProjection.js";

function findActiveWalkthroughPart(
  conv: Conversation,
): { msgIndex: number; partIndex: number; part: WalkthroughPart } | null {
  for (let i = conv.messages.length - 1; i >= 0; i--) {
    const msg = conv.messages[i];
    if (msg?.role !== "assistant") continue;
    for (let j = msg.parts.length - 1; j >= 0; j--) {
      const p = msg.parts[j];
      if (p?.type === "walkthrough") {
        return { msgIndex: i, partIndex: j, part: p };
      }
    }
  }
  return null;
}

export function createWalkthroughContextMiddleware(patcher: Patcher) {
  return createMiddleware({
    name: "walkthrough-context",
    wrapModelCall: async (request, handler) => {
      const active = findActiveWalkthroughPart(patcher.conversation);
      if (!active) return await handler(request);

      const projection = renderActiveWalkthroughMarkdown(active.part);
      request.messages = [new SystemMessage(projection), ...request.messages];
      return await handler(request);
    },
  });
}
