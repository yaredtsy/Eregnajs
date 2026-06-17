import type { ElementManifest, SelectorQuery } from "@repo/walkthrough-core";
import type { ElementRow } from "../types.js";

// The component key is the LLM's symbol for an element (docs/v2/2-system/02 §4).
// Fallback chain tolerates rows that predate the knowledge_v2 migration.
export function elementKey(el: ElementRow): string {
  return el.key ?? el.dom_id ?? el.id.slice(0, 8);
}

function isSelectorQuery(s: unknown): s is SelectorQuery {
  if (typeof s !== "object" || s === null) return false;
  const q = s as { kind?: unknown; value?: unknown };
  return (
    (q.kind === "dom-id" || q.kind === "css" || q.kind === "text") &&
    typeof q.value === "string" &&
    q.value.length > 0
  );
}

// Ordered selector queries for an element: the stored jsonb when present,
// otherwise built from the legacy columns, with a visible-text match on the
// label as the resilient last resort.
export function elementSelectors(el: ElementRow): SelectorQuery[] {
  const stored = Array.isArray(el.selectors)
    ? (el.selectors as unknown[]).filter(isSelectorQuery)
    : [];
  if (stored.length > 0) return stored;

  const built: SelectorQuery[] = [];
  if (el.dom_id) built.push({ kind: "dom-id", value: el.dom_id });
  if (el.css_selector) built.push({ kind: "css", value: el.css_selector });
  if (built.length === 0 && el.label) built.push({ kind: "text", value: el.label });
  return built;
}

export function buildManifest(elements: ElementRow[]): ElementManifest {
  const manifest: ElementManifest = {};
  for (const el of elements) {
    manifest[elementKey(el)] = {
      label: el.label,
      selectors: elementSelectors(el),
    };
  }
  return manifest;
}
