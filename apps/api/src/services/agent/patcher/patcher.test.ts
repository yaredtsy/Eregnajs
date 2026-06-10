import { describe, expect, test } from "bun:test";
import type { Conversation, PatchFrame } from "@repo/walkthrough-core";
import { applyPatchFrame, isStringAppend } from "@repo/walkthrough-core";
import { createPatcher } from "./createPatcher.js";
import { isStreamablePath } from "./streamablePaths.js";
import * as h from "./helpers.js";

const initial = (): Conversation => ({
  sessionId: "s1",
  agentName: "Test Agent",
  messages: [],
});

async function simulateRun() {
  const frames: PatchFrame[] = [];
  const patcher = createPatcher(initial(), async (f) => {
    frames.push(structuredClone(f));
  });
  const conv = patcher.conversation;

  h.addUserMessage(conv, "u1", "how do I export invoices?");
  await patcher.emit();

  h.addAssistantMessage(conv, "a1");
  await patcher.emit();
  const msgIdx = conv.messages.length - 1;

  const partIdx = h.addWalkthroughPart(conv, msgIdx, "wt1", "");
  await patcher.emit();

  h.addChapter(conv, msgIdx, partIdx, {
    title: "Open billing",
    description: "Navigate to the billing page",
    elementId: "billing-link",
    stepIndex: -1,
  });
  await patcher.emit();

  h.setChapterStepIndex(conv, msgIdx, partIdx, 0, 0);
  h.addStep(conv, msgIdx, partIdx, {
    id: "st1",
    status: "pending",
    actions: [{ type: "highlight", elementId: "billing-link" }],
    popover: undefined,
  });
  h.setWalkthroughStatus(conv, msgIdx, partIdx, "playing");
  await patcher.emit();

  h.setStepStatus(conv, msgIdx, partIdx, 0, "running");
  h.initStepPopover(conv, msgIdx, partIdx, 0, "billing-link", "Billing");
  await patcher.emit();

  for (const chunk of ["Click ", "the billing ", "link to begin."]) {
    h.appendPopoverChunk(conv, msgIdx, partIdx, 0, chunk);
    await patcher.emit();
  }

  h.setStepStatus(conv, msgIdx, partIdx, 0, "done");
  h.setWalkthroughStatus(conv, msgIdx, partIdx, "complete");
  h.setMessageStatus(conv, msgIdx, "complete");
  await patcher.emit();

  return { frames, finalServerDoc: patcher.conversation };
}

describe("patcher replay", () => {
  test("client replay of frames reproduces the server document exactly", async () => {
    const { frames, finalServerDoc } = await simulateRun();

    let clientDoc = initial();
    for (const frame of frames) {
      clientDoc = applyPatchFrame(clientDoc, frame);
    }

    expect(clientDoc).toEqual(finalServerDoc);
  });

  test("popover body chunks arrive as string-append ops", async () => {
    const { frames } = await simulateRun();

    const appendOps = frames
      .flatMap((f) => f.ops)
      .filter(isStringAppend)
      .filter((op) => op.path.endsWith("/popover/body"));

    expect(appendOps.map((op) => op.value)).toEqual([
      "Click ",
      "the billing ",
      "link to begin.",
    ]);
  });

  test("seq increments without gaps", async () => {
    const { frames } = await simulateRun();
    expect(frames.map((f) => f.seq)).toEqual(frames.map((_, i) => i));
  });
});

describe("isStreamablePath", () => {
  test("matches streamable leaves anywhere in the document", () => {
    expect(isStreamablePath("/messages/0/parts/0/text")).toBe(true);
    expect(isStreamablePath("/messages/12/parts/3/steps/4/popover/body")).toBe(true);
    expect(isStreamablePath("/messages/0/parts/1/thoughts/2/detail")).toBe(true);
  });

  test("ignores non-streamable fields", () => {
    expect(isStreamablePath("/messages/0/parts/0/steps/0/popover/title")).toBe(false);
    expect(isStreamablePath("/messages/0/status")).toBe(false);
    expect(isStreamablePath("/sessionId")).toBe(false);
  });
});
