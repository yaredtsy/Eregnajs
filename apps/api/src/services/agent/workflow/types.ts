import type { AgentContext } from "../context/types.js";
import type { Plan } from "../subagents/types.js";
import type { Patcher } from "../patcher/createPatcher.js";

export interface GraphState {
  // Set before graph starts
  query: string;
  ctx: AgentContext;
  patcher: Patcher;

  // Set by enrich node
  assistantMsgIndex: number;
  walkthroughPartIndex: number;

  // Set by plan node
  plan: Plan | null;

  // Loop cursors
  chapterIndex: number;
  stepIndexInChapter: number;   // position within the current chapter's steps
  globalStepOffset: number;     // steps emitted before current chapter started
}
