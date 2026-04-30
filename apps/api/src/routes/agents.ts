import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { jsonError } from '../lib/http.js'
import { agentService } from '../services/agent.service.js'

const createBody = z.object({
  name: z.string().min(2).max(80),
  website_url: z.string().url(),
  description: z.string().max(500).optional().nullable(),
  model: z.enum(['gpt-4o-mini', 'gpt-4o', 'claude-3-5-haiku']).optional(),
  system_prompt: z.string().max(2000).optional().nullable(),
})

const patchBody = z
  .object({
    name: z.string().min(2).max(80).optional(),
    description: z.string().max(500).optional().nullable(),
    model: z.enum(['gpt-4o-mini', 'gpt-4o', 'claude-3-5-haiku']).optional(),
    system_prompt: z.string().max(2000).optional().nullable(),
    is_active: z.boolean().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: 'At least one field required' })

export const agentsRouter = new Hono()

agentsRouter.get('/', async (c) => {
  const userId = c.get('userId')
  const data = await agentService.listForUser(userId)
  return c.json({ data })
})

agentsRouter.post('/', zValidator('json', createBody), async (c) => {
  const userId = c.get('userId')
  const body = c.req.valid('json')
  const data = await agentService.create(userId, body)
  return c.json({ data: { ...data, page_count: 0 } }, 201)
})

agentsRouter.get('/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const data = await agentService.getByIdForUserWithPageCount(userId, id)
  if (!data) return jsonError(c, 404, 'Not found')
  return c.json({ data })
})

agentsRouter.patch('/:id', zValidator('json', patchBody), async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const body = c.req.valid('json')
  const data = await agentService.updateForUser(userId, id, body)
  if (!data) return jsonError(c, 404, 'Not found')
  return c.json({ data })
})

agentsRouter.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const ok = await agentService.deleteForUser(userId, id)
  if (!ok) return jsonError(c, 404, 'Not found')
  return c.body(null, 204)
})
