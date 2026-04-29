/** Normalise a title or label into a single ltree-safe segment (Postgres ltree labels). */
export function slugifyLtreeSegment(raw: string): string {
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
  if (!s.length) return 'node'
  if (/^[0-9]/.test(s)) return `n_${s}`
  return s.slice(0, 63)
}

export function generatePublicId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 20)
  const base = slug.length ? slug : 'agent'
  const rand = Math.random().toString(36).slice(2, 8)
  return `${base}-${rand}`
}
