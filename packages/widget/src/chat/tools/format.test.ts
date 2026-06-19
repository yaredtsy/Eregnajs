import { describe, expect, test } from "bun:test";
import { maskSensitiveArgs, summarizeValue } from "./format.js";

describe("maskSensitiveArgs", () => {
  test("masks password, token, and secret keys", () => {
    const masked = maskSensitiveArgs({
      email: "a@b.com",
      password: "secret",
      apiToken: "tok",
      clientSecret: "s",
    });
    expect(masked.email).toBe("a@b.com");
    expect(masked.password).toBe("••••••");
    expect(masked.apiToken).toBe("••••••");
    expect(masked.clientSecret).toBe("••••••");
  });
});

describe("summarizeValue", () => {
  test("truncates long strings", () => {
    const s = summarizeValue("x".repeat(100), 80);
    expect(s.endsWith("…")).toBe(true);
    expect(s.length).toBeLessThan(100);
  });
});
