import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { authMiddleware } from './middleware/auth.js'
import { agentsRouter } from './routes/agents.js'
import { agentRouter } from './routes/agent.js'
import { elementsRouter } from './routes/elements.js'
import { pagesRouter } from './routes/pages.js'
import { sessionsRouter } from './routes/sessions.js'
import { factsRouter } from './routes/facts.js'
import { publicRouter } from './routes/public.js'
import { applyCorsHeaders, resolveV1CorsOrigin } from './lib/cors.js'

export const app = new Hono()

app.use('*', logger())

// Dashboard CORS — use a callback so localhost:3000 vs 127.0.0.1:3000 both work.
app.use(
  '/v1/*',
  cors({
    origin: (origin) => resolveV1CorsOrigin(origin),
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  }),
)

app.use(
  '/public/*',
  cors({
    origin: (origin) => origin ?? '*',
    allowHeaders: ['Content-Type'],
    allowMethods: ['POST', 'OPTIONS'],
  }),
)

app.get('/health', (c) => c.json({ ok: true, ts: new Date().toISOString() }))

const v1 = new Hono()
v1.use('*', authMiddleware)
v1.route('/agents', agentsRouter)
v1.route('/agent', agentRouter)
v1.route('/pages', pagesRouter)
v1.route('/elements', elementsRouter)
v1.route('/sessions', sessionsRouter)
v1.route('/facts', factsRouter)

app.route('/v1', v1)
app.route('/public', publicRouter)

app.onError((err, c) => {
  console.error(err)
  applyCorsHeaders(c)
  return c.json({ error: 'Internal server error' }, 500)
})

app.notFound((c) => {
  applyCorsHeaders(c)
  return c.json({ error: 'Not found' }, 404)
})
