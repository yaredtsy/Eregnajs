import { createServerClient } from '@repo/db/client'
import type { Tables, TablesInsert, TablesUpdate } from '@repo/db/types'
import { generatePublicId } from '../lib/ltree.js'

type AgentRow = Tables<'agents'>

export type AgentListItem = AgentRow & { page_count: number }

function mapAgentListRow(row: AgentRow & { pages?: { count: number }[] | null }): AgentListItem {
  const count = row.pages?.[0]?.count ?? 0
  const { pages: _pages, ...agent } = row
  return { ...agent, page_count: count }
}

export const agentService = {
  async listForUser(userId: string): Promise<AgentListItem[]> {
    const db = createServerClient()
    const { data, error } = await db
      .from('agents')
      .select('*, pages(count)')
      .eq('owner_id', userId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return (data ?? []).map((row) => mapAgentListRow(row as AgentRow & { pages?: { count: number }[] }))
  },

  async getByIdForUser(userId: string, id: string): Promise<AgentRow | null> {
    const db = createServerClient()
    const { data, error } = await db.from('agents').select('*').eq('id', id).eq('owner_id', userId).maybeSingle()

    if (error) throw error
    return data
  },

  async getByIdForUserWithPageCount(userId: string, id: string): Promise<AgentListItem | null> {
    const db = createServerClient()
    const { data, error } = await db
      .from('agents')
      .select('*, pages(count)')
      .eq('id', id)
      .eq('owner_id', userId)
      .maybeSingle()

    if (error) throw error
    if (!data) return null
    return mapAgentListRow(data as AgentRow & { pages?: { count: number }[] })
  },

  async create(
    userId: string,
    input: Pick<TablesInsert<'agents'>, 'name' | 'website_url' | 'description' | 'model' | 'system_prompt'>,
  ): Promise<AgentRow> {
    const db = createServerClient()
    const publicId = generatePublicId(input.name)
    const secretKey = crypto.randomUUID()

    const { data, error } = await db
      .from('agents')
      .insert({
        owner_id: userId,
        name: input.name,
        website_url: input.website_url,
        description: input.description ?? null,
        model: input.model ?? 'gpt-4o-mini',
        system_prompt: input.system_prompt ?? null,
        public_id: publicId,
        secret_key: secretKey,
        is_active: true,
      })
      .select()
      .single()

    if (error) throw error
    return data
  },

  async updateForUser(
    userId: string,
    id: string,
    patch: Pick<TablesUpdate<'agents'>, 'name' | 'description' | 'model' | 'system_prompt' | 'is_active'>,
  ): Promise<AgentRow | null> {
    const db = createServerClient()
    const { data, error } = await db
      .from('agents')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('owner_id', userId)
      .select()
      .maybeSingle()

    if (error) throw error
    return data
  },

  async deleteForUser(userId: string, id: string): Promise<boolean> {
    const db = createServerClient()
    const { error, count } = await db.from('agents').delete({ count: 'exact' }).eq('id', id).eq('owner_id', userId)

    if (error) throw error
    return (count ?? 0) > 0
  },

  async assertOwnedByUser(userId: string, agentId: string): Promise<boolean> {
    const row = await this.getByIdForUser(userId, agentId)
    return row !== null
  },
}
