import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { jsonError } from '../lib/http.js'
import { agentService } from '../services/agent.service.js'
import { pageService } from '../services/page.service.js'

const listQuery = z.object({
  agentId: z.string().uuid(),
})

const createBody = z.object({
  agent_id: z.string().uuid(),
  parent_id: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(200),
  url_pattern: z.string().max(500).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  sort_order: z.number().int().optional(),
})

const patchBody = z
  .object({
    title: z.string().min(1).max(200).optional(),
    url_pattern: z.string().max(500).optional().nullable(),
    description: z.string().max(2000).optional().nullable(),
    sort_order: z.number().int().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: 'At least one field required' })

export const pagesRouter = new Hono()

pagesRouter.get('/', zValidator('query', listQuery), async (c) => {
  const userId = c.get('userId')
  const { agentId } = c.req.valid('query')
  if (!(await agentService.assertOwnedByUser(userId, agentId))) {
    return jsonError(c, 404, 'Not found')
  }
  const data = await pageService.listForAgent(agentId)
  return c.json({ data })
})

pagesRouter.post('/', zValidator('json', createBody), async (c) => {
  const userId = c.get('userId')
  const body = c.req.valid('json')
  try {
    const data = await pageService.create(userId, body)
    return c.json({ data }, 201)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Create failed'
    if (msg === 'Agent not found') return jsonError(c, 404, 'Not found')
    throw e
  }
})

pagesRouter.patch('/:id', zValidator('json', patchBody), async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const body = c.req.valid('json')
  const data = await pageService.updateForUser(userId, id, body)
  if (!data) return jsonError(c, 404, 'Not found')
  return c.json({ data })
})

pagesRouter.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const ok = await pageService.deleteForUser(userId, id)
  if (!ok) return jsonError(c, 404, 'Not found')
  return c.body(null, 204)
})
