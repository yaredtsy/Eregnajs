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
import { agentService } from '../services/agent.service.js'
import { pageService } from '../services/page.service.js'

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

pagesRouter.get(
  '/',
  describeRoute({
    tags: ['Pages'],
    security: bearerSecurity,
    responses: {
      ...jsonOk('List pages'),
      ...jsonError(401, 'Unauthorized'),
      ...jsonError(404, 'Not found'),
    },
  }),
  validator('query', AgentIdQuerySchema),
  async (c) => {
    const userId = c.get('userId')
    const { agentId } = c.req.valid('query')
    if (!(await agentService.assertOwnedByUser(userId, agentId))) {
      return respondError(c, 404, 'Not found')
    }
    const data = await pageService.listForAgent(agentId)
    return c.json({ data })
  },
)

pagesRouter.post(
  '/',
  describeRoute({
    tags: ['Pages'],
    security: bearerSecurity,
    responses: {
      ...jsonCreated(),
      ...jsonError(401, 'Unauthorized'),
      ...jsonError(404, 'Not found'),
    },
  }),
  validator('json', createBody),
  async (c) => {
    const userId = c.get('userId')
    const body = c.req.valid('json')
    try {
      const data = await pageService.create(userId, body)
      return c.json({ data }, 201)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Create failed'
      if (msg === 'Agent not found') return respondError(c, 404, 'Not found')
      throw e
    }
  },
)

pagesRouter.patch(
  '/:id',
  describeRoute({
    tags: ['Pages'],
    security: bearerSecurity,
    responses: {
      ...jsonOk('Update page'),
      ...jsonError(401, 'Unauthorized'),
      ...jsonError(404, 'Not found'),
    },
  }),
  validator('param', IdParamSchema),
  validator('json', patchBody),
  async (c) => {
    const userId = c.get('userId')
    const { id } = c.req.valid('param')
    const body = c.req.valid('json')
    const data = await pageService.updateForUser(userId, id, body)
    if (!data) return respondError(c, 404, 'Not found')
    return c.json({ data })
  },
)

pagesRouter.delete(
  '/:id',
  describeRoute({
    tags: ['Pages'],
    security: bearerSecurity,
    responses: {
      ...noContent('Delete page'),
      ...jsonError(401, 'Unauthorized'),
      ...jsonError(404, 'Not found'),
    },
  }),
  validator('param', IdParamSchema),
  async (c) => {
    const userId = c.get('userId')
    const { id } = c.req.valid('param')
    const ok = await pageService.deleteForUser(userId, id)
    if (!ok) return respondError(c, 404, 'Not found')
    return c.body(null, 204)
  },
)
