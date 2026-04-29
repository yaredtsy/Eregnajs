import type { MiddlewareHandler } from 'hono'
import { createServerClient } from '@repo/db/client'
import { jsonError } from '../lib/http.js'

declare module 'hono' {
  interface ContextVariableMap {
    userId: string
  }
}

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const authorization = c.req.header('Authorization')
  if (!authorization?.startsWith('Bearer ')) {
    return jsonError(c, 401, 'Unauthorized')
  }

  const token = authorization.slice(7)
  const supabase = createServerClient()

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token)

  if (error || !user) {
    return jsonError(c, 401, 'Unauthorized')
  }

  c.set('userId', user.id)
  await next()
}
