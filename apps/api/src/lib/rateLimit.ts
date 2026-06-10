// In-memory token bucket, per key. Good for a single API instance (MVP);
// the seam to swap for Redis is this module's interface (docs/v2/3-server/06 §2).

interface Bucket {
  tokens: number;
  lastRefill: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSec: number;
}

const SWEEP_THRESHOLD = 10_000;

export function createRateLimiter(opts: { capacity: number; refillPerMinute: number }) {
  const { capacity, refillPerMinute } = opts;
  const refillPerMs = refillPerMinute / 60_000;
  const buckets = new Map<string, Bucket>();

  function sweep(now: number): void {
    if (buckets.size < SWEEP_THRESHOLD) return;
    for (const [key, b] of buckets) {
      // A bucket untouched long enough to be full again carries no state.
      if ((now - b.lastRefill) * refillPerMs >= capacity) buckets.delete(key);
    }
  }

  return {
    check(key: string, now: number = Date.now()): RateLimitResult {
      sweep(now);
      const bucket = buckets.get(key) ?? { tokens: capacity, lastRefill: now };
      bucket.tokens = Math.min(capacity, bucket.tokens + (now - bucket.lastRefill) * refillPerMs);
      bucket.lastRefill = now;

      if (bucket.tokens >= 1) {
        bucket.tokens -= 1;
        buckets.set(key, bucket);
        return { allowed: true, limit: capacity, remaining: Math.floor(bucket.tokens), retryAfterSec: 0 };
      }

      buckets.set(key, bucket);
      const retryAfterSec = Math.ceil((1 - bucket.tokens) / refillPerMs / 1000);
      return { allowed: false, limit: capacity, remaining: 0, retryAfterSec };
    },
  };
}

export type RateLimiter = ReturnType<typeof createRateLimiter>;
