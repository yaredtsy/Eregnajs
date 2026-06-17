import type { WalkthroughAction } from "./actions.js";
import type { Thought } from "./thoughts.js";
import type { ElementManifest } from "./manifest.js";

export type WalkthroughStatus = "planning" | "playing" | "complete" | "error";
export type StepStatus = "pending" | "running" | "done" | "skipped";
// Optional until the player renders it (docs/v2 Phase 2 makes it required).
export type ChapterStatus = "pending" | "active" | "done" | "failed";

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
  status?: ChapterStatus;
};

// Outcome of a call-tool action, recorded by the engine. Three consumers,
// one shape: the popover result card, run telemetry, and (later) the
// tool-result round-trip (docs/v2 flows/01 §5).
export type StepToolResult = {
  name: string;
  status: "ok" | "error";
  summary: string;   // ≤300 chars, display-ready
  hint?: string;     // visitor-facing fix, from the tool's structured error
};

export type WalkthroughStep = {
  id: string;
  actions: WalkthroughAction[];
  popover?: PopoverConfig;
  status: StepStatus;
  skipReason?: string;
  toolResult?: StepToolResult;
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
  // Optional until the server emits them (docs/v2 Phase 4); the player
  // renders them whenever present.
  thoughts?: Thought[];
  manifest?: ElementManifest;
};
