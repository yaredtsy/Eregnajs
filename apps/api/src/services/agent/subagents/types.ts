export interface PlanReasoning {
  understanding: string;
  knowledgeAnchors: string[];
  componentMapping: string;
}

export interface PlanFrame {
  planGoal: string;
  planRationale?: string;
  thought: string;
}

export interface Plan {
  reasoning: PlanReasoning;
  planGoal: string;
  planRationale?: string;
  thought: string;
  chapters: PlanChapter[];
}

export interface PlanChapter {
  title: string;
  description: string;
  elementId: string;
  intent: "show" | "click" | "fill" | "compare";
  expectedSteps: number;
}

export interface StepList {
  thought: string;
  steps: StepSpec[];
}

export interface StepSpec {
  actions: ActionSpec[];
  popoverTitle?: string;
  popoverElementId?: string;
}

export type ActionSpec =
  | { type: "scroll-to"; elementId: string }
  | { type: "highlight"; elementId: string }
  | { type: "wait"; ms: number }
  | { type: "wait-for-click"; elementId: string; timeoutMs?: number }
  | { type: "call-tool"; toolName: string; args: Record<string, unknown> };
