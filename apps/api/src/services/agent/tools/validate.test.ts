import { describe, expect, test } from "bun:test";
import { jsonSchemaToZod } from "./jsonSchemaToZod.js";
import { ToolValidationError, validateTools } from "./validate.js";
import type { WireToolDescriptor } from "./types.js";

const validTool: WireToolDescriptor = {
  name: "addToCart",
  description: "Add a product to the cart.",
  runsIn: "client",
  parameters: {
    type: "object",
    properties: {
      productId: {
        type: "string",
        description: "Stable product ID from the page.",
      },
      quantity: {
        type: "integer",
        description: "How many units. Default 1 if not specified.",
        minimum: 1,
        default: 1,
      },
    },
    required: ["productId"],
    additionalProperties: false,
  },
};

describe("validateTools", () => {
  test("valid spec passes", () => {
    const result = validateTools([validTool]);
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("addToCart");
    expect(result[0]!.runsIn).toBe("client");
  });

  test("missing property description fails with path", () => {
    const bad: WireToolDescriptor = {
      ...validTool,
      parameters: {
        type: "object",
        properties: {
          productId: { type: "string" },
        },
        required: ["productId"],
      },
    };
    expect(() => validateTools([bad])).toThrow(ToolValidationError);
    try {
      validateTools([bad]);
    } catch (err) {
      expect(err).toBeInstanceOf(ToolValidationError);
      expect((err as ToolValidationError).path).toBe("tools[0].parameters.productId");
    }
  });

  test("invalid runsIn fails", () => {
    const bad = { ...validTool, runsIn: "browser" as "client" };
    expect(() => validateTools([bad])).toThrow(ToolValidationError);
    try {
      validateTools([bad]);
    } catch (err) {
      expect((err as ToolValidationError).path).toBe("tools[0].runsIn");
    }
  });

  test("duplicate names fail", () => {
    expect(() => validateTools([validTool, validTool])).toThrow(ToolValidationError);
  });
});

describe("jsonSchemaToZod", () => {
  test("parses valid object schema", () => {
    const schema = jsonSchemaToZod(validTool.parameters);
    const parsed = schema.parse({ productId: "sku-1" });
    expect(parsed.productId).toBe("sku-1");
  });

  test("rejects unknown keys when additionalProperties is false", () => {
    const schema = jsonSchemaToZod(validTool.parameters);
    expect(() => schema.parse({ productId: "sku-1", extra: true })).toThrow();
  });
});
