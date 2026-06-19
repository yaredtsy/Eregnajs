import { describe, expect, test } from "bun:test";
import { parseScriptDataFlag } from "./parseDataAttr.js";

describe("parseScriptDataFlag", () => {
  test("accepts common truthy values", () => {
    expect(parseScriptDataFlag("true")).toBe(true);
    expect(parseScriptDataFlag("1")).toBe(true);
    expect(parseScriptDataFlag("")).toBe(true);
    expect(parseScriptDataFlag("yes")).toBe(true);
  });

  test("rejects missing or false values", () => {
    expect(parseScriptDataFlag(undefined)).toBe(false);
    expect(parseScriptDataFlag("false")).toBe(false);
    expect(parseScriptDataFlag("0")).toBe(false);
  });
});
