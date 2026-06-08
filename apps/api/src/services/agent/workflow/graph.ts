import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import type { AgentContext } from "../context/types.js";
import type { Plan } from "../subagents/types.js";
import type { Patcher } from "../patcher/createPatcher.js";
import { enrichNode } from "./nodes/enrich.js";
import { planNode } from "./nodes/plan.js";
import { streamChapterNode } from "./nodes/streamChapter.js";
import { streamBodyNode } from "./nodes/streamBody.js";
import { completeNode } from "./nodes/complete.js";

// ---------------------------------------------------------------------------
// State definition — Annotation API (LangGraph 0.2+)
// ---------------------------------------------------------------------------

// ctx and patcher are always provided in the invoke() call — the defaults
// are unreachable at runtime. The Annotation types are non-null so nodes
// don't need null guards.
const unreachable = (): never => { throw new Error("must be provided in invoke()"); };

export const GraphAnnotation = Annotation.Root({
  query:                Annotation<string>({ reducer: (_, n) => n, default: () => "" }),
  ctx:                  Annotation<AgentContext>({ reducer: (_, n) => n, default: unreachable }),
  patcher:              Annotation<Patcher>({ reducer: (_, n) => n, default: unreachable }),
  assistantMsgIndex:    Annotation<number>({ reducer: (_, n) => n, default: () => -1 }),
  walkthroughPartIndex: Annotation<number>({ reducer: (_, n) => n, default: () => -1 }),
  plan:                 Annotation<Plan | null>({ reducer: (_, n) => n, default: () => null }),
  chapterIndex:         Annotation<number>({ reducer: (_, n) => n, default: () => 0 }),
  stepIndexInChapter:   Annotation<number>({ reducer: (_, n) => n, default: () => 0 }),
  globalStepOffset:     Annotation<number>({ reducer: (_, n) => n, default: () => 0 }),
});

export type GraphState = typeof GraphAnnotation.State;

// ---------------------------------------------------------------------------
// Routing helpers
// ---------------------------------------------------------------------------

function countStepsInCurrentChapter(state: GraphState): number {
  const part = state.patcher!.conversation.messages[state.assistantMsgIndex]
    ?.parts[state.walkthroughPartIndex];
  if (part?.type !== "walkthrough") return 0;
  return part.steps.length - state.globalStepOffset;
}

function routeAfterBody(state: GraphState): "streamBody" | "routeChapter" {
  // stepIndexInChapter was already incremented by streamBody before this runs
  return state.stepIndexInChapter < countStepsInCurrentChapter(state)
    ? "streamBody"
    : "routeChapter";
}

function routeAfterChapter(state: GraphState): "streamChapter" | "complete" {
  return state.chapterIndex < (state.plan?.chapters.length ?? 0)
    ? "streamChapter"
    : "complete";
}

// ---------------------------------------------------------------------------
// Inline chapter-advance node (keeps the step counter correct between chapters)
// ---------------------------------------------------------------------------

async function advanceChapterNode(state: GraphState): Promise<Partial<GraphState>> {
  const part = state.patcher!.conversation.messages[state.assistantMsgIndex]
    ?.parts[state.walkthroughPartIndex];
  const totalSteps = part?.type === "walkthrough" ? part.steps.length : state.globalStepOffset;
  return {
    chapterIndex: state.chapterIndex + 1,
    stepIndexInChapter: 0,
    globalStepOffset: totalSteps,
  };
}

// ---------------------------------------------------------------------------
// Graph assembly
// ---------------------------------------------------------------------------

export function buildGraph() {
  const graph = new StateGraph(GraphAnnotation)
    .addNode("enrich",         enrichNode)
    .addNode("plan",           planNode)
    .addNode("streamChapter",  streamChapterNode)
    .addNode("streamBody",     streamBodyNode)
    .addNode("advanceChapter", advanceChapterNode)
    .addNode("complete",       completeNode)
    .addEdge(START,           "enrich")
    .addEdge("enrich",        "plan")
    .addEdge("plan",          "streamChapter")
    .addEdge("streamChapter", "streamBody")
    .addConditionalEdges("streamBody", routeAfterBody, {
      streamBody:    "streamBody",
      routeChapter:  "advanceChapter",
    })
    .addConditionalEdges("advanceChapter", routeAfterChapter, {
      streamChapter: "streamChapter",
      complete:      "complete",
    })
    .addEdge("complete", END);

  return graph.compile();
}
