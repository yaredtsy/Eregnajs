export function Timing({ elapsedMs }: { elapsedMs?: number }) {
  if (elapsedMs == null) return null;
  return <span className="eregna-tool-call-card__timing">{elapsedMs} ms</span>;
}
