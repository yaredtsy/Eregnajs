import type { Conversation, WalkthroughChapter, WalkthroughStep, WalkthroughAction, StepStatus, WalkthroughStatus, MessageStatus, ChapterStatus, ElementManifest, Thought, TokenUsageReport, PlanReasoning } from "@repo/walkthrough-core";

// Granular mutation helpers — one function per atomic change on the Conversation mirror.
// The fast-json-patch observer on `createPatcher` sees each mutation and emits an op.

export function addUserMessage(
  conv: Conversation,
  id: string,
  text: string,
): void {
  conv.messages.push({
    id,
    role: "user",
    parts: [{ type: "text", text }],
    status: "complete",
    createdAt: Date.now(),
  });
}

export function addAssistantMessage(conv: Conversation, id: string): void {
  conv.messages.push({
    id,
    role: "assistant",
    parts: [],
    status: "streaming",
    createdAt: Date.now(),
  });
}

export function appendTextChunk(
  conv: Conversation,
  messageIndex: number,
  partIndex: number,
  chunk: string,
): void {
  const part = conv.messages[messageIndex]?.parts[partIndex];
  if (part?.type === "text") {
    part.text += chunk;
  }
}

export function addTextPart(
  conv: Conversation,
  messageIndex: number,
  initialText = "",
): number {
  const msg = conv.messages[messageIndex];
  if (!msg) throw new Error(`No message at index ${messageIndex}`);
  msg.parts.push({ type: "text", text: initialText });
  return msg.parts.length - 1;
}

export function addWalkthroughPart(
  conv: Conversation,
  messageIndex: number,
  walkthroughId: string,
  planGoal: string,
  planRationale?: string,
  manifest?: ElementManifest,
): number {
  const msg = conv.messages[messageIndex];
  if (!msg) throw new Error(`No message at index ${messageIndex}`);
  msg.parts.push({
    type: "walkthrough",
    walkthroughId,
    planGoal,
    planRationale,
    status: "planning",
    chapters: [],
    steps: [],
    parentContext: null,
    thoughts: [],
    manifest,
  });
  return msg.parts.length - 1;
}

type WalkthroughPartSeed = {
  walkthroughId: string;
  planGoal: string;
  planRationale?: string;
  status: WalkthroughStatus;
  chapters: WalkthroughChapter[];
  steps: WalkthroughStep[];
  parentContext: null;
  thoughts: Thought[];
  manifest?: ElementManifest;
};

export function replaceOrAddWalkthroughPart(
  conv: Conversation,
  messageIndex: number,
  seed: WalkthroughPartSeed,
): number {
  const msg = conv.messages[messageIndex];
  if (!msg) throw new Error(`No message at index ${messageIndex}`);

  const existingIndex = msg.parts.findIndex((p) => p.type === "walkthrough");
  if (existingIndex >= 0) {
    const existing = msg.parts[existingIndex];
    if (existing?.type !== "walkthrough") return existingIndex;
    if (existing.status === "planning") {
      throw new Error(
        "replaceOrAddWalkthroughPart: another planner is mid-run on " +
          "this message; refusing to clobber its state.",
      );
    }
    // Re-plan on the same message: keep the prior walkthroughId so any
    // visitor-side UI state keyed to it (reasoning disclosure open/closed
    // in sessionStorage) survives the swap. Only one walkthrough per
    // message in phase 1; if the goal changed the planner overwrites the
    // body, but the id stays stable.
    msg.parts[existingIndex] = {
      type: "walkthrough",
      walkthroughId: existing.walkthroughId,
      planGoal: seed.planGoal,
      planRationale: seed.planRationale,
      status: seed.status,
      chapters: [],
      steps: [],
      parentContext: null,
      thoughts: [],
      manifest: seed.manifest ?? existing.manifest,
    };
    return existingIndex;
  }

  msg.parts.push({
    type: "walkthrough",
    walkthroughId: seed.walkthroughId,
    planGoal: seed.planGoal,
    planRationale: seed.planRationale,
    status: seed.status,
    chapters: seed.chapters,
    steps: seed.steps,
    parentContext: seed.parentContext,
    thoughts: seed.thoughts,
    manifest: seed.manifest,
  });
  return msg.parts.length - 1;
}

export function setWalkthroughReasoning(
  conv: Conversation,
  messageIndex: number,
  partIndex: number,
  reasoning: PlanReasoning,
): void {
  const part = conv.messages[messageIndex]?.parts[partIndex];
  if (part?.type === "walkthrough") {
    part.reasoning = reasoning;
  }
}

export function setPlanGoal(
  conv: Conversation,
  messageIndex: number,
  partIndex: number,
  planGoal: string,
  planRationale?: string,
): void {
  const part = conv.messages[messageIndex]?.parts[partIndex];
  if (part?.type === "walkthrough") {
    part.planGoal = planGoal;
    if (planRationale !== undefined) part.planRationale = planRationale;
  }
}

export function addThought(
  conv: Conversation,
  messageIndex: number,
  partIndex: number,
  thought: Thought,
): void {
  const part = conv.messages[messageIndex]?.parts[partIndex];
  if (part?.type === "walkthrough") {
    if (!part.thoughts) part.thoughts = [];
    part.thoughts.push(thought);
  }
}

export function appendThoughtDetail(
  conv: Conversation,
  messageIndex: number,
  partIndex: number,
  thoughtIndex: number,
  chunk: string,
): void {
  const part = conv.messages[messageIndex]?.parts[partIndex];
  if (part?.type === "walkthrough") {
    const thought = part.thoughts?.[thoughtIndex];
    if (thought) thought.detail = (thought.detail ?? "") + chunk;
  }
}

export function addChapter(
  conv: Conversation,
  messageIndex: number,
  partIndex: number,
  chapter: WalkthroughChapter,
): void {
  const part = conv.messages[messageIndex]?.parts[partIndex];
  if (part?.type === "walkthrough") {
    part.chapters.push(chapter);
  }
}

export function setWalkthroughStatus(
  conv: Conversation,
  messageIndex: number,
  partIndex: number,
  status: WalkthroughStatus,
): void {
  const part = conv.messages[messageIndex]?.parts[partIndex];
  if (part?.type === "walkthrough") {
    part.status = status;
  }
}

export function addStep(
  conv: Conversation,
  messageIndex: number,
  partIndex: number,
  step: WalkthroughStep,
): void {
  const part = conv.messages[messageIndex]?.parts[partIndex];
  if (part?.type === "walkthrough") {
    part.steps.push(step);
  }
}

export function setStepStatus(
  conv: Conversation,
  messageIndex: number,
  partIndex: number,
  stepIndex: number,
  status: StepStatus,
  skipReason?: string,
): void {
  const part = conv.messages[messageIndex]?.parts[partIndex];
  if (part?.type === "walkthrough") {
    const step = part.steps[stepIndex];
    if (step) {
      step.status = status;
      if (skipReason !== undefined) step.skipReason = skipReason;
    }
  }
}

export function setChapterStatus(
  conv: Conversation,
  messageIndex: number,
  partIndex: number,
  chapterIndex: number,
  status: ChapterStatus,
): void {
  const part = conv.messages[messageIndex]?.parts[partIndex];
  if (part?.type === "walkthrough") {
    const chapter = part.chapters[chapterIndex];
    if (chapter) chapter.status = status;
  }
}

export function setChapterStepIndex(
  conv: Conversation,
  messageIndex: number,
  partIndex: number,
  chapterIndex: number,
  stepIndex: number,
): void {
  const part = conv.messages[messageIndex]?.parts[partIndex];
  if (part?.type === "walkthrough") {
    const chapter = part.chapters[chapterIndex];
    if (chapter) chapter.stepIndex = stepIndex;
  }
}

export function appendPopoverChunk(
  conv: Conversation,
  messageIndex: number,
  partIndex: number,
  stepIndex: number,
  chunk: string,
): void {
  const part = conv.messages[messageIndex]?.parts[partIndex];
  if (part?.type === "walkthrough") {
    const step = part.steps[stepIndex];
    if (step?.popover) {
      step.popover.body += chunk;
    }
  }
}

export function initStepPopover(
  conv: Conversation,
  messageIndex: number,
  partIndex: number,
  stepIndex: number,
  elementId?: string,
  title?: string,
): void {
  const part = conv.messages[messageIndex]?.parts[partIndex];
  if (part?.type === "walkthrough") {
    const step = part.steps[stepIndex];
    if (step) {
      step.popover = { body: "", title, elementId };
    }
  }
}

export function setMessageStatus(
  conv: Conversation,
  messageIndex: number,
  status: MessageStatus,
): void {
  const msg = conv.messages[messageIndex];
  if (msg) msg.status = status;
}

export function setMessageTokenUsage(
  conv: Conversation,
  messageIndex: number,
  report: TokenUsageReport,
): void {
  const msg = conv.messages[messageIndex];
  if (!msg) return;
  msg.metadata = { ...msg.metadata, tokenUsage: report };
}

export function failWalkthrough(
  conv: Conversation,
  messageIndex: number,
  partIndex: number,
  errorMessage: string,
): void {
  const part = conv.messages[messageIndex]?.parts[partIndex];
  if (part?.type === "walkthrough") {
    part.status = "error";
  }
  const msg = conv.messages[messageIndex];
  if (msg) {
    msg.status = "error";
    msg.parts.push({ type: "text", text: `Error: ${errorMessage}` });
  }
}
