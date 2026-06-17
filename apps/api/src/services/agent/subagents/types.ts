export interface Plan {
  planGoal: string;
  planRationale?: string;
  thought: string;
  chapters: PlanChapter[];
}

export interface PlanChapter {
  title: string;
  description: string;
  elementId: string;  // dom_id of the target element
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
