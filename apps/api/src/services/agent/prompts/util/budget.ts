// Rough char caps per docs/v2/3-server/01-context-engineering.md §5 (~4 chars/token).

export function truncateText(
  text: string,
  maxChars: number,
  marker = "…truncated",
): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false };
  const budget = Math.max(0, maxChars - marker.length - 1);
  return { text: `${text.slice(0, budget)}\n${marker}`, truncated: true };
}

export function estimateTokens(chars: number): number {
  return Math.ceil(chars / 4);
}
