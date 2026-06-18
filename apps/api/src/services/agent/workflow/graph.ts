import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import type { AgentContext } from "../context/types.js";
import type { Plan } from "../subagents/types.js";
import type { Patcher } from "../patcher/createPatcher.js";
import { TokenLedger } from "../telemetry/index.js";
import { streamTextNode } from "./nodes/streamText.js";

// Walkthrough nodes — wire back in when leaving text-chat-only test mode:
// enrichNode, planNode, streamChapterNode, streamBodyNode, completeNode

// ---------------------------------------------------------------------------
// State definition — Annotation API (LangGraph 0.2+)
// ---------------------------------------------------------------------------

// LangGraph calls default() when the channel is created (module load), so these
// must not throw. Real values are always passed in graph.invoke() in run.ts.
const graphPlaceholder = <T>(): T => null as unknown as T;

export const GraphAnnotation = Annotation.Root({
  query:                Annotation<string>({ reducer: (_, n) => n, default: () => "" }),
  ctx:                  Annotation<AgentContext>({ reducer: (_, n) => n, default: graphPlaceholder }),
  patcher:              Annotation<Patcher>({ reducer: (_, n) => n, default: graphPlaceholder }),
  assistantMsgIndex:    Annotation<number>({ reducer: (_, n) => n, default: () => -1 }),
  walkthroughPartIndex: Annotation<number>({ reducer: (_, n) => n, default: () => -1 }),
  plan:                 Annotation<Plan | null>({ reducer: (_, n) => n, default: () => null }),
  chapterIndex:         Annotation<number>({ reducer: (_, n) => n, default: () => 0 }),
  stepIndexInChapter:   Annotation<number>({ reducer: (_, n) => n, default: () => 0 }),
  globalStepOffset:     Annotation<number>({ reducer: (_, n) => n, default: () => 0 }),
  usageLedger:          Annotation<TokenLedger>({ reducer: (_, n) => n, default: () => new TokenLedger() }),
});

export type GraphState = typeof GraphAnnotation.State;

// ---------------------------------------------------------------------------
// Graph assembly
// ---------------------------------------------------------------------------

export function buildGraph() {
  // LangGraph requires every .addNode() to be reachable from START.
  // Text-chat test: only register nodes on the active path.
  return new StateGraph(GraphAnnotation)
    .addNode("streamText", streamTextNode)
    .addEdge(START, "streamText")
    .addEdge("streamText", END)
    .compile();
}
