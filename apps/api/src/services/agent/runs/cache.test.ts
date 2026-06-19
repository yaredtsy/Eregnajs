import { describe, expect, test, beforeEach } from "bun:test";
import {
  rememberRun,
  lookupRun,
  forgetRun,
  setPendingToolCall,
  clearPendingToolCall,
  _clearRunCache,
  type CachedRun,
} from "./cache.js";

function stubCachedRun(runId: string): CachedRun {
  return {
    runId,
    threadId: runId,
    agent: {} as CachedRun["agent"],
    specs: [],
    ctx: {} as CachedRun["ctx"],
    patcher: {} as CachedRun["patcher"],
    assistantMsgIndex: 0,
    textPartIndex: 0,
    messageId: "m1",
    usageLedger: { report: () => undefined } as CachedRun["usageLedger"],
    startedAt: Date.now(),
    agentId: "a1",
    ownerId: "o1",
    query: "hi",
    pageUrl: "https://example.com",
  };
}

describe("runs cache", () => {
  beforeEach(() => _clearRunCache());

  test("remember and lookup", () => {
    rememberRun(stubCachedRun("R1"));
    expect(lookupRun("R1")?.runId).toBe("R1");
  });

  test("forget removes entry", () => {
    rememberRun(stubCachedRun("R1"));
    forgetRun("R1");
    expect(lookupRun("R1")).toBeUndefined();
  });

  test("pending tool call id tracks pause state", () => {
    rememberRun(stubCachedRun("R1"));
    setPendingToolCall("R1", "call_1");
    expect(lookupRun("R1")?.pendingToolCallId).toBe("call_1");
    clearPendingToolCall("R1");
    expect(lookupRun("R1")?.pendingToolCallId).toBeUndefined();
  });
});
