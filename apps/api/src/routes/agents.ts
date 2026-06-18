import { Hono } from 'hono'
import { describeRoute, validator } from 'hono-openapi'
import { z } from 'zod'
import {
  bearerSecurity,
  IdParamSchema,
  jsonCreated,
  jsonError,
  jsonOk,
  noContent,
} from '../lib/openapi.js'
import { jsonError as respondError } from '../lib/http.js'
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
    allowed_origins: z.array(z.string().trim().min(1).max(255)).max(20).optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: 'At least one field required' })

export const agentsRouter = new Hono()

agentsRouter.get(
  '/',
  describeRoute({
    tags: ['Agents'],
    security: bearerSecurity,
    responses: { ...jsonOk('List agents'), ...jsonError(401, 'Unauthorized') },
  }),
  async (c) => {
    const userId = c.get('userId')
    const data = await agentService.listForUser(userId)
    return c.json({ data })
  },
)

agentsRouter.post(
  '/',
  describeRoute({
    tags: ['Agents'],
    security: bearerSecurity,
    responses: { ...jsonCreated(), ...jsonError(401, 'Unauthorized') },
  }),
  validator('json', createBody),
  async (c) => {
    const userId = c.get('userId')
    const body = c.req.valid('json')
    const data = await agentService.create(userId, body)
    return c.json({ data: { ...data, page_count: 0 } }, 201)
  },
)

agentsRouter.get(
  '/:id',
  describeRoute({
    tags: ['Agents'],
    security: bearerSecurity,
    responses: {
      ...jsonOk('Get agent'),
      ...jsonError(401, 'Unauthorized'),
      ...jsonError(404, 'Not found'),
    },
  }),
  validator('param', IdParamSchema),
  async (c) => {
    const userId = c.get('userId')
    const { id } = c.req.valid('param')
    const data = await agentService.getByIdForUserWithPageCount(userId, id)
    if (!data) return respondError(c, 404, 'Not found')
    return c.json({ data })
  },
)

agentsRouter.patch(
  '/:id',
  describeRoute({
    tags: ['Agents'],
    security: bearerSecurity,
    responses: {
      ...jsonOk('Update agent'),
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
    const data = await agentService.updateForUser(userId, id, body)
    if (!data) return respondError(c, 404, 'Not found')
    return c.json({ data })
  },
)

agentsRouter.delete(
  '/:id',
  describeRoute({
    tags: ['Agents'],
    security: bearerSecurity,
    responses: {
      ...noContent('Delete agent'),
      ...jsonError(401, 'Unauthorized'),
      ...jsonError(404, 'Not found'),
    },
  }),
  validator('param', IdParamSchema),
  async (c) => {
    const userId = c.get('userId')
    const { id } = c.req.valid('param')
    const ok = await agentService.deleteForUser(userId, id)
    if (!ok) return respondError(c, 404, 'Not found')
    return c.body(null, 204)
  },
)
