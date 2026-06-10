import { describe, expect, test } from "bun:test";
import { createRateLimiter } from "./rateLimit.js";

describe("rateLimit", () => {
  test("allows up to capacity, then blocks", () => {
    const limiter = createRateLimiter({ capacity: 3, refillPerMinute: 3 });
    const t0 = 1_000_000;
    expect(limiter.check("a", t0).allowed).toBe(true);
    expect(limiter.check("a", t0).allowed).toBe(true);
    expect(limiter.check("a", t0).allowed).toBe(true);
    const blocked = limiter.check("a", t0);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  test("keys are independent", () => {
    const limiter = createRateLimiter({ capacity: 1, refillPerMinute: 1 });
    const t0 = 0;
    expect(limiter.check("a", t0).allowed).toBe(true);
    expect(limiter.check("a", t0).allowed).toBe(false);
    expect(limiter.check("b", t0).allowed).toBe(true);
  });

  test("refills over time", () => {
    const limiter = createRateLimiter({ capacity: 2, refillPerMinute: 60 }); // 1/sec
    const t0 = 0;
    expect(limiter.check("a", t0).allowed).toBe(true);
    expect(limiter.check("a", t0).allowed).toBe(true);
    expect(limiter.check("a", t0).allowed).toBe(false);
    expect(limiter.check("a", t0 + 1_100).allowed).toBe(true); // ~1 token back
    expect(limiter.check("a", t0 + 1_100).allowed).toBe(false);
  });

  test("remaining reflects bucket state", () => {
    const limiter = createRateLimiter({ capacity: 5, refillPerMinute: 5 });
    const r = limiter.check("a", 0);
    expect(r.limit).toBe(5);
    expect(r.remaining).toBe(4);
  });
});
