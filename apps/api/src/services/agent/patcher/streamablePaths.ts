// Streamability is decided by the terminal field name, not the full path shape.
// Full-path regexes rotted silently whenever the document shape shifted (they
// missed step popovers at /messages/N/parts/N/steps/N/popover/body entirely).
// Any string field named one of these leaves grows by appending, so converting
// its "replace" ops to "string-append" is always safe.
const STREAMABLE_LEAVES: ReadonlySet<string> = new Set(["text", "body", "detail"]);

export function isStreamablePath(path: string): boolean {
  const leaf = path.slice(path.lastIndexOf("/") + 1);
  return STREAMABLE_LEAVES.has(leaf);
}
