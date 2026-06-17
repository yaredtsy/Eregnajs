export type {
  ChatRole,
  MessageStatus,
  TextPart,
  MessagePart,
  Message,
  Conversation,
  WalkthroughStatus,
  StepStatus,
  PopoverConfig,
  StepToolResult,
  WalkthroughChapter,
  WalkthroughStep,
  WalkthroughPosition,
  WalkthroughPart,
  WalkthroughAction,
  ChapterStatus,
  Thought,
  ThoughtPhase,
  SelectorQuery,
  ManifestEntry,
  ElementManifest,
  JsonPatchOp,
  StringAppendOp,
  WireOp,
  PatchFrame,
  HelloFrame,
  PatchRunFrame,
  EndFrame,
  RunFrame,
} from "@repo/walkthrough-core";

export {
  TYPEWRITER_MS_PER_CHAR,
  POST_POPOVER_PAUSE_MS,
  ACTION_DURATION_MS,
  computeStepDuration,
  applyOps,
  applyPatchFrame,
} from "@repo/walkthrough-core";

// Legacy alias: existing code imports MessageRole; ChatRole is the canonical name now
export type MessageRole = import("@repo/walkthrough-core").ChatRole;

export type PlaybackStatus = "idle" | "playing" | "paused" | "complete";
export type PlaybackSpeed = 0.75 | 1 | 1.5 | 2;
