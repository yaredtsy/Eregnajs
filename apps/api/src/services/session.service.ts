import { createServerClient } from '@repo/db/client'
import type { Json, Tables } from '@repo/db/types'
import { agentService } from './agent.service.js'

type SessionRow = Tables<'walkthrough_sessions'>

type CreateSessionInput = {
  agent_id: string
  visitor_id?: string | null
  page_url?: string | null
  visitor_meta?: Record<string, unknown> | null
}

export const sessionService = {
  async listForAgent(userId: string, agentId: string): Promise<SessionRow[]> {
    if (!(await agentService.assertOwnedByUser(userId, agentId))) return []

    const db = createServerClient()
    const { data, error } = await db
      .from('walkthrough_sessions')
      .select('*')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) throw error
    return data ?? []
  },

  async create(input: CreateSessionInput): Promise<SessionRow> {
    const db = createServerClient()
    const { data, error } = await db
      .from('walkthrough_sessions')
      .insert({
        agent_id: input.agent_id,
        visitor_id: input.visitor_id ?? null,
        visitor_meta: (input.visitor_meta ?? null) as Json | null,
        page_url: input.page_url ?? null,
      })
      .select()
      .single()

    if (error) throw error
    return data
  },

  async getById(sessionId: string): Promise<SessionRow | null> {
    const db = createServerClient()
    const { data, error } = await db
      .from('walkthrough_sessions')
      .select('*')
      .eq('id', sessionId)
      .maybeSingle()

    if (error) throw error
    return data
  },

  async touch(sessionId: string): Promise<void> {
    const db = createServerClient()
    await db
      .from('walkthrough_sessions')
      .update({ last_active_at: new Date().toISOString() })
      .eq('id', sessionId)
  },
}
