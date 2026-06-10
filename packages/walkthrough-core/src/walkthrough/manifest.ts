// The element manifest (docs/v2/2-system/02-contracts.md §4): the LLM speaks
// component keys; the engine resolves them to DOM elements through ordered
// selector queries. Emitted once per run by the enrich node.

export type SelectorQuery =
  | { kind: "dom-id"; value: string }
  | { kind: "css"; value: string }
  | { kind: "text"; value: string; tag?: string };

export interface ManifestEntry {
  label: string;
  selectors: SelectorQuery[];
}

export type ElementManifest = Record<string, ManifestEntry>;
