import { describe, expect, test, beforeEach } from "bun:test";
import { validateResumeRequest } from "./validateResume.js";
import { ResumeError } from "./errors.js";
import { rememberRun, setPendingToolCall, _clearRunCache } from "../runs/cache.js";
import { toPendingToolCallEvent } from "./events.js";

describe("validateResumeRequest", () => {
  beforeEach(() => _clearRunCache());

  test("no-such-run when cache miss", () => {
    expect(() =>
      validateResumeRequest({ runId: "missing", toolCallId: "c1" }),
    ).toThrow(ResumeError);
    try {
      validateResumeRequest({ runId: "missing", toolCallId: "c1" });
    } catch (err) {
      expect((err as ResumeError).code).toBe("no-such-run");
    }
  });

  test("no-matching-pause on toolCallId mismatch", () => {
    rememberRun({
      runId: "R1",
      threadId: "R1",
      agent: {} as never,
      specs: [],
      ctx: {} as never,
      patcher: {} as never,
      assistantMsgIndex: 0,
      textPartIndex: 0,
      messageId: "m1",
      usageLedger: { report: () => undefined } as never,
      startedAt: Date.now(),
      agentId: "a",
      ownerId: "o",
      query: "q",
      pageUrl: "https://example.com",
    });
    setPendingToolCall("R1", "call_expected");
    expect(() =>
      validateResumeRequest({ runId: "R1", toolCallId: "call_wrong" }),
    ).toThrow(ResumeError);
  });
});

describe("toPendingToolCallEvent", () => {
  test("maps interrupt payload to wire event", () => {
    expect(
      toPendingToolCallEvent({
        kind: "client-tool-call",
        toolCallId: "c1",
        name: "testTool",
        args: { x: 1 },
      }),
    ).toEqual({
      kind: "pending-tool-call",
      toolCallId: "c1",
      name: "testTool",
      args: { x: 1 },
    });
  });
});
