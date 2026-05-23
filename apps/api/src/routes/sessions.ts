import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { jsonError } from '../lib/http.js'
import { sessionService } from '../services/session.service.js'

const listQuery = z.object({
  agentId: z.string().uuid(),
})

const createBody = z.object({
  agent_id: z.string().uuid(),
  visitor_id: z.string().optional().nullable(),
  page_url: z.string().url().optional().nullable(),
  visitor_meta: z.record(z.unknown()).optional().nullable(),
})

export const sessionsRouter = new Hono()

sessionsRouter.get('/', zValidator('query', listQuery), async (c) => {
  const userId = c.get('userId')
  const { agentId } = c.req.valid('query')
  const data = await sessionService.listForAgent(userId, agentId)
  return c.json({ data })
})

sessionsRouter.post('/', zValidator('json', createBody), async (c) => {
  const body = c.req.valid('json')
  try {
    const data = await sessionService.create(body)
    return c.json({ data }, 201)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Create failed'
    return jsonError(c, 400, msg)
  }
})

sessionsRouter.get('/:id', async (c) => {
  const id = c.req.param('id')
  const data = await sessionService.getById(id)
  if (!data) return jsonError(c, 404, 'Not found')
  return c.json({ data })
})

sessionsRouter.post('/:id/touch', async (c) => {
  const id = c.req.param('id')
  await sessionService.touch(id)
  return c.body(null, 204)
})
