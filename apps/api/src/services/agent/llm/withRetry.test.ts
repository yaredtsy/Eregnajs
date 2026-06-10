import { describe, expect, test } from "bun:test";
import { withRetry } from "./withRetry.js";

describe("withRetry", () => {
  test("returns immediately on success", async () => {
    let calls = 0;
    const result = await withRetry(async () => { calls++; return "ok"; });
    expect(result).toBe("ok");
    expect(calls).toBe(1);
  });

  test("retries after a failure and succeeds", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls === 1) throw new Error("flaky");
        return "ok";
      },
      { baseDelayMs: 1 },
    );
    expect(result).toBe("ok");
    expect(calls).toBe(2);
  });

  test("throws the last error once attempts are exhausted", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw new Error(`fail ${calls}`);
        },
        { tries: 3, baseDelayMs: 1 },
      ),
    ).rejects.toThrow("fail 3");
    expect(calls).toBe(3);
  });
});
