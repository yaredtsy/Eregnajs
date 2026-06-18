import { resolver, type ResponsesWithResolver } from 'hono-openapi'
import { z } from 'zod'

export const ErrorSchema = z.object({ error: z.string() })
export const DataSchema = z.object({ data: z.unknown() })
export const HealthSchema = z.object({ ok: z.boolean(), ts: z.string() })

export const IdParamSchema = z.object({ id: z.string().uuid() })
export const AgentIdQuerySchema = z.object({ agentId: z.string().uuid() })
export const PageIdQuerySchema = z.object({ pageId: z.string().uuid() })

export const bearerSecurity = [{ bearerAuth: [] }]

export function jsonOk(description = 'Success'): ResponsesWithResolver {
  return {
    200: {
      description,
      content: { 'application/json': { schema: resolver(DataSchema) } },
    },
  }
}

export function jsonCreated(description = 'Created'): ResponsesWithResolver {
  return {
    201: {
      description,
      content: { 'application/json': { schema: resolver(DataSchema) } },
    },
  }
}

export function jsonError(status: number, description: string): ResponsesWithResolver {
  return {
    [status]: {
      description,
      content: { 'application/json': { schema: resolver(ErrorSchema) } },
    },
  }
}

export function noContent(description: string): ResponsesWithResolver {
  return { 204: { description } }
}

export const ndjsonOk: ResponsesWithResolver = {
  200: {
    description: 'NDJSON stream of agent frames',
    content: {
      'application/x-ndjson': {
        schema: resolver(z.string()),
      },
    },
  },
}
