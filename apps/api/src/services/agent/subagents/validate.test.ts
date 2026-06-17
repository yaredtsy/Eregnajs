import { describe, expect, test } from "bun:test";
import { sanitizeStepList, validatePlanKeys, validElementKeys } from "./validate.js";
import type { ElementRow } from "../context/types.js";
import type { AgentContext } from "../context/types.js";
import type { Plan } from "./types.js";

function ctx(overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    agent: {} as AgentContext["agent"],
    page: null,
    elements: [
      {
        id: "1",
        page_id: "p",
        path: "1",
        parent_id: null,
        label: "Save",
        key: "save-btn",
        dom_id: null,
        css_selector: null,
        xpath: null,
        description: null,
        notes: null,
        selectors: [],
        embedding: null,
        sort_order: 0,
        created_at: "",
        updated_at: "",
      } satisfies ElementRow,
    ],
    siteFacts: [],
    hostState: {},
    hostTools: [{ name: "export", description: "Export data" }],
    hostKnowledge: [],
    conversationHistory: [],
    ...overrides,
  };
}

describe("validatePlanKeys", () => {
  test("accepts known keys", () => {
    const plan: Plan = {
      planGoal: "g",
      thought: "t",
      chapters: [{ title: "a", description: "d", elementId: "save-btn" }],
    };
    expect(validatePlanKeys(plan, validElementKeys(ctx()))).toBeNull();
  });

  test("rejects unknown keys", () => {
    const plan: Plan = {
      planGoal: "g",
      thought: "t",
      chapters: [{ title: "a", description: "d", elementId: "missing" }],
    };
    expect(validatePlanKeys(plan, validElementKeys(ctx()))).toContain("missing");
  });
});

describe("sanitizeStepList", () => {
  test("remaps unknown element ids and drops bad tools", () => {
    const result = sanitizeStepList(
      {
        thought: "Planning steps",
        steps: [
          {
            actions: [
              { type: "highlight", elementId: "ghost" },
              { type: "call-tool", toolName: "nope", args: {} },
              { type: "wait", ms: 99_999 },
            ],
            popoverElementId: "ghost",
          },
        ],
      },
      ctx(),
      { title: "c", description: "d", elementId: "save-btn" },
    );

    expect(result.steps[0]?.actions).toEqual([
      { type: "highlight", elementId: "save-btn" },
      { type: "wait", ms: 10_000 },
    ]);
    expect(result.steps[0]?.popoverElementId).toBe("save-btn");
  });
});
