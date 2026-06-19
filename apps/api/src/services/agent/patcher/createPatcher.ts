import { observe, generate, type Observer } from "@repo/walkthrough-core";
import type { Conversation } from "@repo/walkthrough-core";
import type { PatchFrame } from "@repo/walkthrough-core";
import { makeTransformer, type WireOp } from "./transformStringAppend.js";

export interface Patcher {
  conversation: Conversation;
  emit(): Promise<void>;
  getLog(): PatchFrame[];
  setOnFrame(fn: (frame: PatchFrame) => Promise<void>): void;
}

export function createPatcher(
  initialConversation: Conversation,
  onFrame: (frame: PatchFrame) => Promise<void>,
): Patcher {
  const conv = structuredClone(initialConversation) as Conversation;
  const observer: Observer<Conversation> = observe(conv);
  const transform = makeTransformer(conv as object);
  const log: PatchFrame[] = [];
  let seq = 0;
  let send = onFrame;

  async function emit(): Promise<void> {
    const rawOps = generate(observer);
    if (rawOps.length === 0) return;

    const wireOps: WireOp[] = rawOps.map((op) => transform(op));
    const frame: PatchFrame = { seq: seq++, ops: wireOps as PatchFrame["ops"] };
    log.push(frame);
    await send(frame);
  }

  return {
    conversation: conv,
    emit,
    getLog: () => log,
    setOnFrame: (fn) => {
      send = fn;
    },
  };
}
