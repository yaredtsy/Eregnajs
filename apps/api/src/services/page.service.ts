import { createServerClient } from '@repo/db/client'
import type { Tables, TablesInsert, TablesUpdate } from '@repo/db/types'
import { slugifyLtreeSegment } from '../lib/ltree.js'
import { agentService } from './agent.service.js'

type PageRow = Tables<'pages'>

async function nextUniquePath(
  agentId: string,
  basePath: string,
): Promise<string> {
  const db = createServerClient()
  let candidate = basePath
  for (let i = 0; i < 20; i += 1) {
    const { data, error } = await db.from('pages').select('id').eq('agent_id', agentId).eq('path', candidate).maybeSingle()
    if (error) throw error
    if (!data) return candidate
    const suffix = Math.random().toString(36).slice(2, 6)
    candidate = `${basePath}_${suffix}`
  }
  throw new Error('Could not allocate unique page path')
}

export async function computePagePath(agentId: string, parentId: string | null, title: string): Promise<string> {
  const db = createServerClient()
  const label = slugifyLtreeSegment(title)

  if (!parentId) {
    const { count, error: countError } = await db
      .from('pages')
      .select('*', { count: 'exact', head: true })
      .eq('agent_id', agentId)

    if (countError) throw countError
    const base = (count ?? 0) === 0 ? 'root' : `root_${label}`
    return nextUniquePath(agentId, base)
  }

  const { data: parent, error } = await db.from('pages').select('path').eq('id', parentId).eq('agent_id', agentId).maybeSingle()

  if (error) throw error
  if (!parent) throw new Error('Parent page not found')
  const base = `${String(parent.path)}.${label}`
  return nextUniquePath(agentId, base)
}

export const pageService = {
  /** Caller must ensure the user owns `agentId`. */
  async listForAgent(agentId: string): Promise<PageRow[]> {
    const db = createServerClient()
    const { data, error } = await db
      .from('pages')
      .select('*')
      .eq('agent_id', agentId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (error) throw error
    return data ?? []
  },

  async getByIdForUser(userId: string, pageId: string): Promise<PageRow | null> {
    const db = createServerClient()
    const { data: page, error } = await db.from('pages').select('*').eq('id', pageId).maybeSingle()
    if (error) throw error
    if (!page) return null
    if (!(await agentService.assertOwnedByUser(userId, page.agent_id))) return null
    return page
  },

  async create(
    userId: string,
    input: Pick<TablesInsert<'pages'>, 'agent_id' | 'parent_id' | 'title' | 'url_pattern' | 'description' | 'sort_order'>,
  ): Promise<PageRow> {
    if (!(await agentService.assertOwnedByUser(userId, input.agent_id))) {
      throw new Error('Agent not found')
    }

    const path = await computePagePath(input.agent_id, input.parent_id ?? null, input.title)
    const db = createServerClient()

    const { data, error } = await db
      .from('pages')
      .insert({
        agent_id: input.agent_id,
        parent_id: input.parent_id ?? null,
        title: input.title,
        url_pattern: input.url_pattern ?? null,
        description: input.description ?? null,
        sort_order: input.sort_order ?? 0,
        path,
      })
      .select()
      .single()

    if (error) throw error
    return data
  },

  async updateForUser(
    userId: string,
    pageId: string,
    patch: Pick<TablesUpdate<'pages'>, 'title' | 'url_pattern' | 'description' | 'sort_order'>,
  ): Promise<PageRow | null> {
    const existing = await this.getByIdForUser(userId, pageId)
    if (!existing) return null

    const db = createServerClient()
    const { data, error } = await db
      .from('pages')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', pageId)
      .select()
      .maybeSingle()

    if (error) throw error
    return data
  },

  async deleteForUser(userId: string, pageId: string): Promise<boolean> {
    const existing = await this.getByIdForUser(userId, pageId)
    if (!existing) return false

    const db = createServerClient()
    const { error, count } = await db.from('pages').delete({ count: 'exact' }).eq('id', pageId)

    if (error) throw error
    return (count ?? 0) > 0
  },
}
