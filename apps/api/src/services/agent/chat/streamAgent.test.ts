import { describe, expect, test } from "bun:test";
import { isAssistantStreamChunk, isPlannerInternalChunk } from "./streamAgent.js";

describe("isAssistantStreamChunk", () => {
  test("accepts ai messages", () => {
    expect(isAssistantStreamChunk({ _getType: () => "ai", content: "hi" })).toBe(true);
  });

  test("rejects tool messages", () => {
    expect(
      isAssistantStreamChunk({
        _getType: () => "tool",
        content: '{"ok":true}',
      }),
    ).toBe(false);
  });

  test("rejects human messages", () => {
    expect(isAssistantStreamChunk({ _getType: () => "human" })).toBe(false);
  });
});

describe("isPlannerInternalChunk", () => {
  test("drops chunks tagged planner-internal", () => {
    expect(isPlannerInternalChunk({ tags: ["planner-internal"] })).toBe(true);
    expect(isPlannerInternalChunk({ tags: [] })).toBe(false);
    expect(isPlannerInternalChunk({ tags: ["other"] })).toBe(false);
    expect(isPlannerInternalChunk(null)).toBe(false);
    expect(isPlannerInternalChunk(undefined)).toBe(false);
  });
});
