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
  PageIdQuerySchema,
} from '../lib/openapi.js'
import { jsonError as respondError } from '../lib/http.js'
import { elementService } from '../services/element.service.js'
import { pageService } from '../services/page.service.js'

const selectorQuery = z.object({
  kind: z.enum(['dom-id', 'css', 'text']),
  value: z.string().min(1).max(500),
  tag: z.string().max(50).optional(),
})

const createBody = z
  .object({
    page_id: z.string().uuid(),
    parent_id: z.string().uuid().nullable().optional(),
    label: z.string().min(1).max(200),
    key: z.string().min(1).max(80).regex(/^[a-z0-9][a-z0-9.-]*$/).optional(),
    selectors: z.array(selectorQuery).max(10).optional(),
    dom_id: z.string().max(500).optional().nullable(),
    css_selector: z.string().max(500).optional().nullable(),
    description: z.string().max(8000).optional().nullable(),
    notes: z.string().max(8000).optional().nullable(),
    sort_order: z.number().int().optional(),
  })
  .refine(
    (b) =>
      (b.selectors?.length ?? 0) > 0 || !!(b.dom_id?.trim() || b.css_selector?.trim()),
    { message: 'Provide selectors or dom_id/css_selector', path: ['selectors'] },
  )

const patchBody = z
  .object({
    label: z.string().min(1).max(200).optional(),
    key: z.string().min(1).max(80).regex(/^[a-z0-9][a-z0-9.-]*$/).optional(),
    selectors: z.array(selectorQuery).max(10).optional(),
    dom_id: z.string().max(500).optional().nullable(),
    css_selector: z.string().max(500).optional().nullable(),
    description: z.string().max(8000).optional().nullable(),
    notes: z.string().max(8000).optional().nullable(),
    sort_order: z.number().int().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: 'At least one field required' })

export const elementsRouter = new Hono()

elementsRouter.get(
  '/',
  describeRoute({
    tags: ['Elements'],
    security: bearerSecurity,
    responses: {
      ...jsonOk('List elements'),
      ...jsonError(401, 'Unauthorized'),
      ...jsonError(404, 'Not found'),
    },
  }),
  validator('query', PageIdQuerySchema),
  async (c) => {
    const userId = c.get('userId')
    const { pageId } = c.req.valid('query')
    const page = await pageService.getByIdForUser(userId, pageId)
    if (!page) return respondError(c, 404, 'Not found')
    const data = await elementService.listForPage(pageId)
    return c.json({ data })
  },
)

elementsRouter.post(
  '/',
  describeRoute({
    tags: ['Elements'],
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
      const data = await elementService.create(userId, body)
      return c.json({ data }, 201)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Create failed'
      if (msg === 'Page not found') return respondError(c, 404, 'Not found')
      throw e
    }
  },
)

elementsRouter.patch(
  '/:id',
  describeRoute({
    tags: ['Elements'],
    security: bearerSecurity,
    responses: {
      ...jsonOk('Update element'),
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
    const data = await elementService.updateForUser(userId, id, body)
    if (!data) return respondError(c, 404, 'Not found')
    return c.json({ data })
  },
)

elementsRouter.delete(
  '/:id',
  describeRoute({
    tags: ['Elements'],
    security: bearerSecurity,
    responses: {
      ...noContent('Delete element'),
      ...jsonError(401, 'Unauthorized'),
      ...jsonError(404, 'Not found'),
    },
  }),
  validator('param', IdParamSchema),
  async (c) => {
    const userId = c.get('userId')
    const { id } = c.req.valid('param')
    const ok = await elementService.deleteForUser(userId, id)
    if (!ok) return respondError(c, 404, 'Not found')
    return c.body(null, 204)
  },
)
