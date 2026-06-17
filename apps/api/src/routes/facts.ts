import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { createServerClient } from '@repo/db/client'
import { jsonError } from '../lib/http.js'
import { agentService } from '../services/agent.service.js'

const listQuery = z.object({
  agentId: z.string().uuid(),
})

const createBody = z.object({
  agent_id: z.string().uuid(),
  title: z.string().min(1).max(120),
  content: z.string().min(1).max(4000),
  sort_order: z.number().int().optional(),
})

const patchBody = z
  .object({
    title: z.string().min(1).max(120).optional(),
    content: z.string().min(1).max(4000).optional(),
    sort_order: z.number().int().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: 'At least one field required' })

// Every fact operation is scoped through agent ownership.
async function factAgentId(factId: string): Promise<string | null> {
  const db = createServerClient()
  const { data } = await db.from('site_facts').select('agent_id').eq('id', factId).single()
  return data?.agent_id ?? null
}

export const factsRouter = new Hono()

factsRouter.get('/', zValidator('query', listQuery), async (c) => {
  const userId = c.get('userId')
  const { agentId } = c.req.valid('query')
  if (!(await agentService.assertOwnedByUser(userId, agentId))) {
    return jsonError(c, 404, 'Not found')
  }
  const db = createServerClient()
  const { data, error } = await db
    .from('site_facts')
    .select('*')
    .eq('agent_id', agentId)
    .order('sort_order')
  if (error) throw error
  return c.json({ data })
})

factsRouter.post('/', zValidator('json', createBody), async (c) => {
  const userId = c.get('userId')
  const body = c.req.valid('json')
  if (!(await agentService.assertOwnedByUser(userId, body.agent_id))) {
    return jsonError(c, 404, 'Not found')
  }
  const db = createServerClient()
  const { data, error } = await db.from('site_facts').insert(body).select().single()
  if (error) throw error
  return c.json({ data }, 201)
})

factsRouter.patch('/:id', zValidator('json', patchBody), async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const agentId = await factAgentId(id)
  if (!agentId || !(await agentService.assertOwnedByUser(userId, agentId))) {
    return jsonError(c, 404, 'Not found')
  }
  const db = createServerClient()
  const { data, error } = await db
    .from('site_facts')
    .update({ ...c.req.valid('json'), updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return c.json({ data })
})

factsRouter.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const agentId = await factAgentId(id)
  if (!agentId || !(await agentService.assertOwnedByUser(userId, agentId))) {
    return jsonError(c, 404, 'Not found')
  }
  const db = createServerClient()
  const { error } = await db.from('site_facts').delete().eq('id', id)
  if (error) throw error
  return c.body(null, 204)
})
