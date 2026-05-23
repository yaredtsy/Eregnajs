export type MessageRole = "user" | "assistant";

export type TextPart = { type: "text"; text: string };

export type WalkthroughAction =
  | { type: "scroll-to"; elementId: string }
  | { type: "highlight"; elementId: string }
  | { type: "wait"; ms: number };

export type WalkthroughStep = {
  id: string;
  actions: WalkthroughAction[];
  popover?: {
    title?: string;
    body: string;
    /** undefined = viewport-center anchor */
    elementId?: string;
  };
};

export type WalkthroughChapter = {
  title: string;
  stepIndex: number;
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
  chapters: WalkthroughChapter[];
  steps: WalkthroughStep[];
  parentContext?: WalkthroughPosition | null;
};

export type MessagePart = TextPart | WalkthroughPart;

export type Message = {
  id: string;
  role: MessageRole;
  parts: MessagePart[];
  createdAt: number;
};

export type Conversation = {
  sessionId: string;
  agentName: string;
  messages: Message[];
};

export type PlaybackStatus = "idle" | "playing" | "paused" | "complete";
export type PlaybackSpeed = 0.75 | 1 | 1.5 | 2;

// Timing constants
export const TYPEWRITER_MS_PER_CHAR = 22;
export const POST_POPOVER_PAUSE_MS = 900;
export const ACTION_DURATION_MS = 1600;

export function computeStepDuration(step: WalkthroughStep): number {
  if (!step.popover) return ACTION_DURATION_MS;
  return step.popover.body.length * TYPEWRITER_MS_PER_CHAR + POST_POPOVER_PAUSE_MS;
}
