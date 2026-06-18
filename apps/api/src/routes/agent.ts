import { Hono } from 'hono'
import { describeRoute, validator } from 'hono-openapi'
import { z } from 'zod'
import {
  bearerSecurity,
  IdParamSchema,
  jsonError,
  jsonOk,
  ndjsonOk,
} from '../lib/openapi.js'
import { createNdjsonStream } from '../services/agent/transport/ndjson.js'
import { runAgent } from '../services/agent/run.js'
import * as runs from '../services/agent/runs/index.js'
import { debugRouter } from './debug.js'

const RunBodySchema = z.object({
  agentPublicId: z.string(),
  pageUrl: z.string().url(),
  query: z.string().min(1),
  hostState: z.record(z.unknown()).optional(),
  hostTools: z
    .array(
      z.object({
        name: z.string(),
        description: z.string(),
        parameters: z.record(z.unknown()).optional(),
      }),
    )
    .optional(),
  visitorId: z.string().optional(),
})

const RunsQuerySchema = z.object({
  agentId: z.string().uuid(),
  limit: z.coerce.number().int().optional(),
  offset: z.coerce.number().int().optional(),
})

export const agentRouter = new Hono()

agentRouter.route('/debug', debugRouter)

agentRouter.post(
  '/run',
  describeRoute({
    tags: ['Agent runs'],
    security: bearerSecurity,
    responses: ndjsonOk,
  }),
  validator('json', RunBodySchema),
  async (c) => {
    const body = c.req.valid('json')
    const stream = createNdjsonStream(c)
    const controller = new AbortController()

    c.req.raw.signal?.addEventListener('abort', () => controller.abort())

    void runAgent({
      agentPublicId: body.agentPublicId,
      pageUrl: body.pageUrl,
      query: body.query,
      hostState: body.hostState,
      hostTools: body.hostTools,
      visitorId: body.visitorId,
      signal: controller.signal,
      onFrame: (frame) => stream.writeFrame(frame),
    })
      .catch((err) => {
        if (!(err as Error)?.message?.includes('AbortError')) {
          console.error('[agent] run error', err)
        }
      })
      .finally(() => stream.close())

    return stream.response
  },
)

agentRouter.get(
  '/runs',
  describeRoute({
    tags: ['Agent runs'],
    security: bearerSecurity,
    responses: { ...jsonOk('List runs'), ...jsonError(400, 'agentId required') },
  }),
  validator('query', RunsQuerySchema),
  async (c) => {
    const { agentId, limit = 50, offset = 0 } = c.req.valid('query')
    return c.json({ data: runs.listByAgent(agentId, c.get('userId'), limit, offset) })
  },
)

agentRouter.get(
  '/runs/:id',
  describeRoute({
    tags: ['Agent runs'],
    security: bearerSecurity,
    responses: { ...jsonOk('Get run'), ...jsonError(404, 'Not found') },
  }),
  validator('param', IdParamSchema),
  async (c) => {
    const { id } = c.req.valid('param')
    const row = runs.load(id, c.get('userId'))
    if (!row) return c.json({ error: 'not found' }, 404)
    return c.json({ data: row })
  },
)
