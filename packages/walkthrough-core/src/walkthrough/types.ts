import type { WalkthroughAction } from "./actions.js";

export type WalkthroughStatus = "planning" | "playing" | "complete" | "error";
export type StepStatus = "pending" | "running" | "done" | "skipped";

export type PopoverConfig = {
  title?: string;
  body: string;
  elementId?: string;
};

export type WalkthroughChapter = {
  title: string;
  description: string;
  elementId: string;
  stepIndex: number;
};

export type WalkthroughStep = {
  id: string;
  actions: WalkthroughAction[];
  popover?: PopoverConfig;
  status: StepStatus;
  skipReason?: string;
};

export type WalkthroughPosition = {
  messageId: string;
  walkthroughId: string;
  stepIndex: number;
  stepOffsetMs: number;
};

export type WalkthroughPart = {
  type: "walkthrough";
  walkthroughId: string;
  planGoal: string;
  planRationale?: string;
  status: WalkthroughStatus;
  chapters: WalkthroughChapter[];
  steps: WalkthroughStep[];
  parentContext: WalkthroughPosition | null;
};
