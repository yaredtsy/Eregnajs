import { describe, expect, test } from "bun:test";
import { parseHostTools } from "./parseHostTools.js";
import { ToolValidationError } from "./validate.js";

describe("parseHostTools", () => {
  test("legacy tools without parameters pass through", () => {
    const tools = [{ name: "export", description: "Export data" }];
    expect(parseHostTools(tools)).toEqual(tools);
  });

  test("v2 tools with valid schema pass", () => {
    const tools = [
      {
        name: "addToCart",
        description: "Add to cart",
        runsIn: "client" as const,
        parameters: {
          type: "object",
          properties: {
            productId: { type: "string", description: "Product ID from the page." },
          },
          required: ["productId"],
        },
      },
    ];
    expect(parseHostTools(tools)).toEqual(tools);
  });

  test("v2 tools with missing property description throw", () => {
    const tools = [
      {
        name: "addToCart",
        description: "Add to cart",
        parameters: {
          type: "object",
          properties: {
            productId: { type: "string" },
          },
          required: ["productId"],
        },
      },
    ];
    expect(() => parseHostTools(tools)).toThrow(ToolValidationError);
  });
});
