import { describe, expect, test } from "bun:test";
import { isAssistantStreamChunk } from "./streamAgent.js";

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
