// Paths in the Conversation document where string-append semantics apply.
// When fast-json-patch observes a mutation on one of these paths, the patcher
// uses the custom "string-append" op instead of "replace" to enable incremental
// rendering on the client.
export const STREAMABLE_PATHS: ReadonlySet<string> = new Set([
  /messages\/\d+\/parts\/\d+\/text/,
  /messages\/\d+\/parts\/\d+\/popover\/body/,
].map((r) => r.source));

// Returns true when the given JSON Pointer path matches a streamable field.
export function isStreamablePath(path: string): boolean {
  return (
    /^\/messages\/\d+\/parts\/\d+\/text$/.test(path) ||
    /^\/messages\/\d+\/parts\/\d+\/popover\/body$/.test(path)
  );
}
