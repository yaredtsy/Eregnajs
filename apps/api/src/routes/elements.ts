import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { jsonError } from '../lib/http.js'
import { elementService } from '../services/element.service.js'
import { pageService } from '../services/page.service.js'

const listQuery = z.object({
  pageId: z.string().uuid(),
})

const createBody = z
  .object({
    page_id: z.string().uuid(),
    parent_id: z.string().uuid().nullable().optional(),
    label: z.string().min(1).max(200),
    dom_id: z.string().max(500).optional().nullable(),
    css_selector: z.string().max(500).optional().nullable(),
    description: z.string().max(8000).optional().nullable(),
    notes: z.string().max(8000).optional().nullable(),
    sort_order: z.number().int().optional(),
  })
  .refine((b) => !!(b.dom_id?.trim() || b.css_selector?.trim()), {
    message: 'Provide dom_id or css_selector',
    path: ['dom_id'],
  })

const patchBody = z
  .object({
    label: z.string().min(1).max(200).optional(),
    dom_id: z.string().max(500).optional().nullable(),
    css_selector: z.string().max(500).optional().nullable(),
    description: z.string().max(8000).optional().nullable(),
    notes: z.string().max(8000).optional().nullable(),
    sort_order: z.number().int().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: 'At least one field required' })

export const elementsRouter = new Hono()

elementsRouter.get('/', zValidator('query', listQuery), async (c) => {
  const userId = c.get('userId')
  const { pageId } = c.req.valid('query')
  const page = await pageService.getByIdForUser(userId, pageId)
  if (!page) return jsonError(c, 404, 'Not found')
  const data = await elementService.listForPage(pageId)
  return c.json({ data })
})

elementsRouter.post('/', zValidator('json', createBody), async (c) => {
  const userId = c.get('userId')
  const body = c.req.valid('json')
  try {
    const data = await elementService.create(userId, body)
    return c.json({ data }, 201)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Create failed'
    if (msg === 'Page not found') return jsonError(c, 404, 'Not found')
    throw e
  }
})

elementsRouter.patch('/:id', zValidator('json', patchBody), async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const body = c.req.valid('json')
  const data = await elementService.updateForUser(userId, id, body)
  if (!data) return jsonError(c, 404, 'Not found')
  return c.json({ data })
})

elementsRouter.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const ok = await elementService.deleteForUser(userId, id)
  if (!ok) return jsonError(c, 404, 'Not found')
  return c.body(null, 204)
})
