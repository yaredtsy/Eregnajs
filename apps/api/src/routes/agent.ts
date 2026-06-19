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
import { ConversationSchema } from '../lib/conversationSchema.js'
import type { Conversation } from '@repo/walkthrough-core'
import { isAbortError } from '../lib/abort.js'
import { ToolValidationError } from '../services/agent/tools/validate.js'
import { parseHostTools } from '../services/agent/tools/parseHostTools.js'
import { resumeChatAgent, ResumeError } from '../services/agent/chat/resume.js'
import { validateResumeRequest } from '../services/agent/chat/validateResume.js'
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
        runsIn: z.enum(['client', 'server']).optional(),
        display: z
          .object({
            icon: z.string().optional(),
            label: z.string().optional(),
            showArgs: z.boolean().optional(),
            showResult: z.boolean().optional(),
          })
          .optional(),
      }),
    )
    .optional(),
  visitorId: z.string().optional(),
  conversation: ConversationSchema.optional(),
})

const ResumeBodySchema = z.object({
  runId: z.string().min(1),
  toolCallId: z.string().min(1),
  result: z.unknown().optional(),
  error: z.string().optional(),
  elapsedMs: z.coerce.number().int().nonnegative().optional(),
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

    let hostTools = body.hostTools
    try {
      hostTools = parseHostTools(body.hostTools)
    } catch (err) {
      if (err instanceof ToolValidationError) {
        return c.json({ error: err.message, path: err.path }, 400)
      }
      throw err
    }

    const stream = createNdjsonStream(c)
    const controller = new AbortController()

    c.req.raw.signal?.addEventListener('abort', () => controller.abort())

    void runAgent({
      agentPublicId: body.agentPublicId,
      pageUrl: body.pageUrl,
      query: body.query,
      hostState: body.hostState,
      hostTools,
      visitorId: body.visitorId,
      conversation: body.conversation as Conversation | undefined,
      signal: controller.signal,
      onFrame: (frame) => stream.writeFrame(frame),
      onChatEvent: (event) => stream.writeEvent(event),
    })
      .catch((err) => {
        if (!controller.signal.aborted && !isAbortError(err)) {
          console.error('[agent] run error', err)
        }
      })
      .finally(() => stream.close())

    return stream.response
  },
)

agentRouter.post(
  '/resume',
  describeRoute({
    tags: ['Agent runs'],
    security: bearerSecurity,
    responses: {
      ...ndjsonOk,
      ...jsonError(409, 'Run not found or interrupt mismatch'),
    },
  }),
  validator('json', ResumeBodySchema),
  async (c) => {
    const body = c.req.valid('json')

    try {
      validateResumeRequest(body)
    } catch (err) {
      if (err instanceof ResumeError) {
        return c.json({ error: err.code }, 409)
      }
      throw err
    }

    const stream = createNdjsonStream(c)
    const controller = new AbortController()
    c.req.raw.signal?.addEventListener('abort', () => controller.abort())

    void resumeChatAgent({
      runId: body.runId,
      toolCallId: body.toolCallId,
      result: body.result,
      error: body.error,
      elapsedMs: body.elapsedMs,
      signal: controller.signal,
      onFrame: (frame) => stream.writeFrame(frame),
      onChatEvent: (event) => stream.writeEvent(event),
    })
      .catch((err) => {
        if (!controller.signal.aborted && !isAbortError(err)) {
          console.error('[agent] resume error', err)
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
