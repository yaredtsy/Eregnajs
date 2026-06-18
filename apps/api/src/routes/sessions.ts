import { Hono } from 'hono'
import { describeRoute, validator } from 'hono-openapi'
import { z } from 'zod'
import {
  AgentIdQuerySchema,
  bearerSecurity,
  IdParamSchema,
  jsonCreated,
  jsonError,
  jsonOk,
  noContent,
} from '../lib/openapi.js'
import { jsonError as respondError } from '../lib/http.js'
import { sessionService } from '../services/session.service.js'

const createBody = z.object({
  agent_id: z.string().uuid(),
  visitor_id: z.string().optional().nullable(),
  page_url: z.string().url().optional().nullable(),
  visitor_meta: z.record(z.unknown()).optional().nullable(),
})

export const sessionsRouter = new Hono()

sessionsRouter.get(
  '/',
  describeRoute({
    tags: ['Sessions'],
    security: bearerSecurity,
    responses: { ...jsonOk('List sessions'), ...jsonError(401, 'Unauthorized') },
  }),
  validator('query', AgentIdQuerySchema),
  async (c) => {
    const userId = c.get('userId')
    const { agentId } = c.req.valid('query')
    const data = await sessionService.listForAgent(userId, agentId)
    return c.json({ data })
  },
)

sessionsRouter.post(
  '/',
  describeRoute({
    tags: ['Sessions'],
    security: bearerSecurity,
    responses: {
      ...jsonCreated(),
      ...jsonError(400, 'Bad request'),
      ...jsonError(401, 'Unauthorized'),
    },
  }),
  validator('json', createBody),
  async (c) => {
    const body = c.req.valid('json')
    try {
      const data = await sessionService.create(body)
      return c.json({ data }, 201)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Create failed'
      return respondError(c, 400, msg)
    }
  },
)

sessionsRouter.get(
  '/:id',
  describeRoute({
    tags: ['Sessions'],
    security: bearerSecurity,
    responses: { ...jsonOk('Get session'), ...jsonError(404, 'Not found') },
  }),
  validator('param', IdParamSchema),
  async (c) => {
    const { id } = c.req.valid('param')
    const data = await sessionService.getById(id)
    if (!data) return respondError(c, 404, 'Not found')
    return c.json({ data })
  },
)

sessionsRouter.post(
  '/:id/touch',
  describeRoute({
    tags: ['Sessions'],
    security: bearerSecurity,
    responses: noContent('Touch session'),
  }),
  validator('param', IdParamSchema),
  async (c) => {
    const { id } = c.req.valid('param')
    await sessionService.touch(id)
    return c.body(null, 204)
  },
)
