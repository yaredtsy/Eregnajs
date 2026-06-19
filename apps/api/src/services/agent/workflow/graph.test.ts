import { describe, expect, test } from "bun:test";
import { buildGraph, GraphAnnotation } from "./graph.js";
import { useChatAgent } from "./flags.js";

describe("workflow graph", () => {
  test("module imports without channel defaults throwing", () => {
    expect(GraphAnnotation).toBeDefined();
  });

  test("graph compiles (streamText path)", () => {
    const prev = process.env.EREGNA_CHAT_AGENT;
    delete process.env.EREGNA_CHAT_AGENT;
    try {
      const compiled = buildGraph();
      expect(compiled).toBeDefined();
      expect(useChatAgent()).toBe(false);
    } finally {
      if (prev !== undefined) process.env.EREGNA_CHAT_AGENT = prev;
    }
  });

  test("chatAgent flag is recognized", () => {
    const prev = process.env.EREGNA_CHAT_AGENT;
    process.env.EREGNA_CHAT_AGENT = "1";
    try {
      expect(useChatAgent()).toBe(true);
    } finally {
      if (prev !== undefined) process.env.EREGNA_CHAT_AGENT = prev;
      else delete process.env.EREGNA_CHAT_AGENT;
    }
  });
});
