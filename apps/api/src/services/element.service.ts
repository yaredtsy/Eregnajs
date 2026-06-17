import { createServerClient } from '@repo/db/client'
import type { Tables, TablesInsert, TablesUpdate } from '@repo/db/types'
import { slugifyLtreeSegment } from '../lib/ltree.js'
import {
  legacyFromSelectors,
  normalizeSelectors,
  selectorsFromLegacy,
  slugifyComponentKey,
  type SelectorQuery,
} from '../lib/selectors.js'
import { pageService } from './page.service.js'

type ElementRow = Tables<'elements'>

export type ElementApiRow = Omit<ElementRow, 'embedding'> & { has_embedding: boolean }

function toApiRow(row: ElementRow): ElementApiRow {
  const { embedding, ...rest } = row
  return {
    ...rest,
    has_embedding: embedding != null && embedding !== '',
  }
}

async function nextUniqueElementPath(pageId: string, basePath: string): Promise<string> {
  const db = createServerClient()
  let candidate = basePath
  for (let i = 0; i < 20; i += 1) {
    const { data, error } = await db.from('elements').select('id').eq('page_id', pageId).eq('path', candidate).maybeSingle()
    if (error) throw error
    if (!data) return candidate
    const suffix = Math.random().toString(36).slice(2, 6)
    candidate = `${basePath}_${suffix}`
  }
  throw new Error('Could not allocate unique element path')
}

async function nextUniqueKey(pageId: string, base: string): Promise<string> {
  const db = createServerClient()
  let candidate = base
  for (let i = 0; i < 20; i += 1) {
    const { data, error } = await db
      .from('elements')
      .select('id')
      .eq('page_id', pageId)
      .eq('key', candidate)
      .maybeSingle()
    if (error) throw error
    if (!data) return candidate
    candidate = `${base}-${i + 2}`
  }
  throw new Error('Could not allocate unique component key')
}

function resolveSelectors(input: {
  selectors?: unknown
  dom_id?: string | null
  css_selector?: string | null
  label: string
}): SelectorQuery[] {
  const fromJson = normalizeSelectors(input.selectors)
  if (fromJson.length > 0) return fromJson
  return selectorsFromLegacy(input.dom_id, input.css_selector, input.label)
}

async function computeElementPath(pageId: string, parentId: string | null, label: string): Promise<string> {
  const db = createServerClient()
  const seg = slugifyLtreeSegment(label)

  if (!parentId) {
    const { count, error: countError } = await db
      .from('elements')
      .select('*', { count: 'exact', head: true })
      .eq('page_id', pageId)

    if (countError) throw countError
    const base = seg
    return nextUniqueElementPath(pageId, base)
  }

  const { data: parent, error } = await db.from('elements').select('path').eq('id', parentId).eq('page_id', pageId).maybeSingle()

  if (error) throw error
  if (!parent) throw new Error('Parent element not found')
  const base = `${String(parent.path)}.${seg}`
  return nextUniqueElementPath(pageId, base)
}

export const elementService = {
  /** Caller must ensure the user can access `pageId`. */
  async listForPage(pageId: string): Promise<ElementApiRow[]> {
    const db = createServerClient()
    const { data, error } = await db
      .from('elements')
      .select('*')
      .eq('page_id', pageId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (error) throw error
    return (data ?? []).map((row) => toApiRow(row as ElementRow))
  },

  async getByIdForUser(userId: string, elementId: string): Promise<ElementApiRow | null> {
    const db = createServerClient()
    const { data: el, error } = await db.from('elements').select('*').eq('id', elementId).maybeSingle()
    if (error) throw error
    if (!el) return null
    const page = await pageService.getByIdForUser(userId, el.page_id)
    if (!page) return null
    return toApiRow(el as ElementRow)
  },

  async create(
    userId: string,
    input: Pick<
      TablesInsert<'elements'>,
      | 'page_id'
      | 'parent_id'
      | 'label'
      | 'key'
      | 'selectors'
      | 'dom_id'
      | 'css_selector'
      | 'description'
      | 'notes'
      | 'sort_order'
    >,
  ): Promise<ElementApiRow> {
    const page = await pageService.getByIdForUser(userId, input.page_id)
    if (!page) {
      throw new Error('Page not found')
    }

    const selectors = resolveSelectors(input)
    if (selectors.length === 0) {
      throw new Error('Provide at least one selector')
    }

    const legacy = legacyFromSelectors(selectors)
    const keyBase = (input.key?.trim() || slugifyComponentKey(input.label))
    const key = await nextUniqueKey(input.page_id, keyBase)
    const path = await computeElementPath(input.page_id, input.parent_id ?? null, input.label)
    const db = createServerClient()

    const { data, error } = await db
      .from('elements')
      .insert({
        page_id: input.page_id,
        parent_id: input.parent_id ?? null,
        label: input.label,
        key,
        selectors,
        dom_id: legacy.dom_id,
        css_selector: legacy.css_selector,
        description: input.description ?? null,
        notes: input.notes ?? null,
        sort_order: input.sort_order ?? 0,
        path,
      })
      .select()
      .single()

    if (error) throw error
    return toApiRow(data as ElementRow)
  },

  async updateForUser(
    userId: string,
    elementId: string,
    patch: Pick<
      TablesUpdate<'elements'>,
      'label' | 'key' | 'selectors' | 'dom_id' | 'css_selector' | 'description' | 'notes' | 'sort_order'
    >,
  ): Promise<ElementApiRow | null> {
    const existing = await this.getByIdForUser(userId, elementId)
    if (!existing) return null

    const next: TablesUpdate<'elements'> = { ...patch, updated_at: new Date().toISOString() }

    if (patch.selectors !== undefined || patch.dom_id !== undefined || patch.css_selector !== undefined) {
      const selectors = resolveSelectors({
        selectors: patch.selectors ?? existing.selectors,
        dom_id: patch.dom_id ?? existing.dom_id,
        css_selector: patch.css_selector ?? existing.css_selector,
        label: patch.label ?? existing.label,
      })
      if (selectors.length === 0) throw new Error('Provide at least one selector')
      const legacy = legacyFromSelectors(selectors)
      next.selectors = selectors
      next.dom_id = legacy.dom_id
      next.css_selector = legacy.css_selector
    }

    const db = createServerClient()
    const { data, error } = await db
      .from('elements')
      .update(next)
      .eq('id', elementId)
      .select()
      .maybeSingle()

    if (error) throw error
    return data ? toApiRow(data as ElementRow) : null
  },

  async deleteForUser(userId: string, elementId: string): Promise<boolean> {
    const existing = await this.getByIdForUser(userId, elementId)
    if (!existing) return false

    const db = createServerClient()
    const { error, count } = await db.from('elements').delete({ count: 'exact' }).eq('id', elementId)

    if (error) throw error
    return (count ?? 0) > 0
  },
}
