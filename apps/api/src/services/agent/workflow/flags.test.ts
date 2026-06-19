import { describe, expect, test, afterEach } from "bun:test";
import { shouldUseChatAgentPath, useChatAgent } from "./flags.js";

const v2ClientTool = {
  name: "openPricingDialog",
  description: "Opens pricing",
  parameters: { type: "object" as const, properties: {} },
  runsIn: "client" as const,
};

describe("shouldUseChatAgentPath", () => {
  const prev = process.env.EREGNA_CHAT_AGENT;

  afterEach(() => {
    if (prev !== undefined) process.env.EREGNA_CHAT_AGENT = prev;
    else delete process.env.EREGNA_CHAT_AGENT;
  });

  test("returns true when env flag is set", () => {
    process.env.EREGNA_CHAT_AGENT = "1";
    expect(shouldUseChatAgentPath()).toBe(true);
    expect(shouldUseChatAgentPath([])).toBe(true);
  });

  test("returns true when host sends client v2 tools", () => {
    delete process.env.EREGNA_CHAT_AGENT;
    expect(shouldUseChatAgentPath([v2ClientTool])).toBe(true);
  });

  test("returns false for legacy prompt-only tools", () => {
    delete process.env.EREGNA_CHAT_AGENT;
    expect(
      shouldUseChatAgentPath([{ name: "export", description: "Export data" }]),
    ).toBe(false);
  });

  test("useChatAgent respects env", () => {
    delete process.env.EREGNA_CHAT_AGENT;
    expect(useChatAgent()).toBe(false);
    process.env.EREGNA_CHAT_AGENT = "true";
    expect(useChatAgent()).toBe(true);
  });
});
