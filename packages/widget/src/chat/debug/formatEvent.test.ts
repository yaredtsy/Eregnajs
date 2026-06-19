import { describe, expect, test } from "bun:test";
import { formatDebugEvent } from "./formatEvent.js";

describe("formatDebugEvent", () => {
  test("formats pending-tool-call", () => {
    const line = formatDebugEvent({
      kind: "pending-tool-call",
      toolCallId: "tc1",
      name: "addToCart",
      args: { productId: "sku-12" },
    });
    expect(line).toContain("pending-tool-call addToCart");
    expect(line).toContain("productId");
  });

  test("formats run-resumed", () => {
    const line = formatDebugEvent({
      kind: "run-resumed",
      runId: "r1",
      toolCallId: "tc1",
      elapsedMs: 197,
    });
    expect(line).toContain("/resume → ok");
    expect(line).toContain("197");
  });
});
