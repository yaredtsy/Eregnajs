export interface RetryOpts {
  tries?: number;        // total attempts, not retries
  baseDelayMs?: number;
  label?: string;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOpts = {},
): Promise<T> {
  const tries = opts.tries ?? 2;
  const base = opts.baseDelayMs ?? 500;
  let lastErr: unknown;

  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === tries - 1) break;
      const delay = base * 2 ** attempt + Math.random() * 100;
      console.warn(
        `[agent] ${opts.label ?? "llm call"} failed (attempt ${attempt + 1}/${tries}); retrying in ${Math.round(delay)}ms`,
        err instanceof Error ? err.message : err,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastErr;
}
