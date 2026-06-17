/** Selector query helpers shared by the element API (docs/v2/4-client/04). */

export type SelectorQuery = {
  kind: 'dom-id' | 'css' | 'text'
  value: string
  tag?: string
}

export function slugifyComponentKey(label: string): string {
  const s = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return (s || 'component').slice(0, 80)
}

function isSelectorQuery(s: unknown): s is SelectorQuery {
  if (typeof s !== 'object' || s === null) return false
  const q = s as { kind?: unknown; value?: unknown }
  return (
    (q.kind === 'dom-id' || q.kind === 'css' || q.kind === 'text') &&
    typeof q.value === 'string' &&
    q.value.trim().length > 0
  )
}

export function normalizeSelectors(raw: unknown): SelectorQuery[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(isSelectorQuery).map((s) => ({
    kind: s.kind,
    value: s.value.trim(),
    ...(s.tag ? { tag: s.tag } : {}),
  }))
}

export function selectorsFromLegacy(
  domId: string | null | undefined,
  cssSelector: string | null | undefined,
  label?: string,
): SelectorQuery[] {
  const out: SelectorQuery[] = []
  if (domId?.trim()) out.push({ kind: 'dom-id', value: domId.trim() })
  if (cssSelector?.trim()) out.push({ kind: 'css', value: cssSelector.trim() })
  if (out.length === 0 && label?.trim()) out.push({ kind: 'text', value: label.trim() })
  return out
}

export function legacyFromSelectors(selectors: SelectorQuery[]): {
  dom_id: string | null
  css_selector: string | null
} {
  const dom = selectors.find((s) => s.kind === 'dom-id')
  const css = selectors.find((s) => s.kind === 'css')
  return {
    dom_id: dom?.value ?? null,
    css_selector: css?.value ?? null,
  }
}
