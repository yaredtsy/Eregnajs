export type {
  ChatRole,
  MessageStatus,
  TextPart,
  MessagePart,
  MessageMetadata,
  Message,
  Conversation,
} from "./conversation/types.js";

export type {
  TokenUsageCounts,
  TokenUsageCall,
  TokenUsageByLabel,
  TokenUsageReport,
} from "./telemetry/types.js";
export { ZERO_TOKEN_USAGE } from "./telemetry/types.js";

export type {
  WalkthroughStatus,
  StepStatus,
  ChapterStatus,
  PopoverConfig,
  StepToolResult,
  WalkthroughChapter,
  WalkthroughStep,
  WalkthroughPosition,
  WalkthroughPart,
} from "./walkthrough/types.js";

export type { WalkthroughAction } from "./walkthrough/actions.js";
export type { Thought, ThoughtPhase } from "./walkthrough/thoughts.js";
export type { SelectorQuery, ManifestEntry, ElementManifest } from "./walkthrough/manifest.js";

export type {
  JsonPatchOp,
  StringAppendOp,
  WireOp,
  PatchFrame,
  HelloFrame,
  PatchRunFrame,
  EndFrame,
  RunFrame,
} from "./patch/types.js";
export { isStringAppend, WIRE_PROTOCOL } from "./patch/types.js";

export { applyOps, applyPatchFrame } from "./conversation/applyPatch.js";

export { observe, generate } from "./lib/fastJsonPatch.js";
export type { Operation, Observer } from "./lib/fastJsonPatch.js";

export { toLangChain, textFromChunk } from "./conversation/langchain.js";

export {
  TYPEWRITER_MS_PER_CHAR,
  POST_POPOVER_PAUSE_MS,
  ACTION_DURATION_MS,
  computeStepDuration,
} from "./walkthrough/timing.js";
