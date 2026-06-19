export const DISPLAY_TRUNCATE_CHARS = 80;

const SENSITIVE_KEY = /password|token|secret/i;

/** Mask sensitive argument keys before rendering. */
export function maskSensitiveArgs(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    out[key] = SENSITIVE_KEY.test(key) ? "••••••" : value;
  }
  return out;
}

/** Compact JSON-ish preview for tool results. */
export function summarizeValue(value: unknown, maxLen = DISPLAY_TRUNCATE_CHARS): string {
  if (value === undefined || value === null) return "";
  try {
    const s = typeof value === "string" ? value : JSON.stringify(value, null, 2);
    if (s.length <= maxLen) return s;
    return `${s.slice(0, maxLen)}…`;
  } catch {
    return String(value);
  }
}

export function isTruncated(full: string, maxLen = DISPLAY_TRUNCATE_CHARS): boolean {
  return full.length > maxLen;
}
