import { nanoid } from "nanoid";
import { composeContext } from "./context/compose.js";
import { createPatcher } from "./patcher/createPatcher.js";
import { buildGraph } from "./workflow/graph.js";
import * as runs from "./runs/index.js";
import type { PatchFrame } from "@repo/walkthrough-core";
import type { Conversation } from "@repo/walkthrough-core";

export interface RunOpts {
  agentPublicId: string;
  pageUrl: string;
  query: string;
  hostState?: Record<string, unknown>;
  hostTools?: Array<{ name: string; description: string; parameters?: Record<string, unknown> }>;
  visitorId?: string;
  signal?: AbortSignal;
  onFrame: (frame: PatchFrame) => Promise<void>;
}

export async function runAgent(opts: RunOpts): Promise<void> {
  const startedAt = Date.now();

  const initialConv: Conversation = {
    sessionId: nanoid(10),
    agentName: "Eregna Agent",
    messages: [],
  };

  const patcher = createPatcher(initialConv, opts.onFrame);

  // Load context before the graph starts (keeps enrich node simple).
  const ctx = await composeContext({
    agentPublicId: opts.agentPublicId,
    pageUrl: opts.pageUrl,
    hostState: opts.hostState ?? {},
    hostTools: opts.hostTools ?? [],
  });

  const graph = buildGraph();

  try {
    await graph.invoke(
      {
        query: opts.query,
        ctx,
        patcher,
        assistantMsgIndex: -1,
        walkthroughPartIndex: -1,
        plan: null,
        chapterIndex: 0,
        stepIndexInChapter: 0,
        globalStepOffset: 0,
      },
      { signal: opts.signal },
    );

    runs.save({
      agentId: ctx.agent.id,
      query: opts.query,
      status: "complete",
      conversation: patcher.conversation,
      patchLog: patcher.getLog(),
      visitorId: opts.visitorId,
      pageUrl: opts.pageUrl,
      startedAt,
    });
  } catch (err) {
    const status = (opts.signal?.aborted) ? "aborted" : "error";
    runs.save({
      agentId: ctx.agent.id,
      query: opts.query,
      status,
      conversation: patcher.conversation,
      patchLog: patcher.getLog(),
      visitorId: opts.visitorId,
      pageUrl: opts.pageUrl,
      errorMessage: String(err),
      startedAt,
    });
    throw err;
  }
}
