import { describe, expect, test, beforeEach } from "bun:test";
import { registerClientTool, clearClientTools } from "./registry.js";
import { executeClientTool } from "./executor.js";

describe("executeClientTool", () => {
  beforeEach(() => clearClientTools());

  test("runs handler and returns ok", async () => {
    registerClientTool({
      name: "echo",
      description: "echo",
      parameters: { type: "object", properties: {} },
      handler: (args) => args,
    });
    const result = await executeClientTool("echo", { msg: "hi" });
    expect(result.ok).toBe(true);
    expect(result.value).toEqual({ msg: "hi" });
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  test("returns error for unknown tool", async () => {
    const result = await executeClientTool("missing", {});
    expect(result.ok).toBe(false);
    expect(result.error).toContain("unknown");
  });

  test("catches handler throws", async () => {
    registerClientTool({
      name: "boom",
      description: "boom",
      parameters: { type: "object", properties: {} },
      handler: () => {
        throw new Error("kaboom");
      },
    });
    const result = await executeClientTool("boom", {});
    expect(result.ok).toBe(false);
    expect(result.error).toBe("kaboom");
  });
});
