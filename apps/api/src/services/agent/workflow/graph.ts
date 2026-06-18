import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import type { AgentContext } from "../context/types.js";
import type { Plan } from "../subagents/types.js";
import type { Patcher } from "../patcher/createPatcher.js";
import { TokenLedger } from "../telemetry/index.js";
import { enrichNode } from "./nodes/enrich.js";
import { planNode } from "./nodes/plan.js";
import { streamChapterNode } from "./nodes/streamChapter.js";
import { streamBodyNode } from "./nodes/streamBody.js";
import { completeNode } from "./nodes/complete.js";

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

  // Close out the finished chapter ("failed" set by streamChapter survives).
  if (part?.type === "walkthrough") {
    const chapter = part.chapters[state.chapterIndex];
    if (chapter && chapter.status !== "failed") {
      chapter.status = "done";
      await state.patcher!.emit();
    }
  }

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
  // Node is named "makePlan" because "plan" is already a state channel name,
  // and LangGraph forbids a node sharing a channel's name.
  const graph = new StateGraph(GraphAnnotation)
    .addNode("enrich",         enrichNode)
    .addNode("makePlan",       planNode)
    .addNode("streamChapter",  streamChapterNode)
    .addNode("streamBody",     streamBodyNode)
    .addNode("advanceChapter", advanceChapterNode)
    .addNode("complete",       completeNode)
    .addEdge(START,           "enrich")
    .addEdge("enrich",        "makePlan")
    .addEdge("makePlan",      "streamChapter")
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
