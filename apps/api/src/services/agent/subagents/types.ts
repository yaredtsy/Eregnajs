export interface PlanReasoning {
  understanding: string;
  knowledgeAnchors: string[];
  componentMapping: string;
}

export interface PlanFrame {
  planGoal: string;
  // null (not undefined) because the planner schema uses .nullable() for
  // OpenAI strict structured-output compatibility. The model writes null
  // when no rationale is warranted; convert to undefined at the patcher
  // boundary.
  planRationale: string | null;
  thought: string;
}

export interface Plan {
  reasoning: PlanReasoning;
  planGoal: string;
  planRationale: string | null;
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
