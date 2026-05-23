import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { authMiddleware } from './middleware/auth.js'
import { agentsRouter } from './routes/agents.js'
import { elementsRouter } from './routes/elements.js'
import { pagesRouter } from './routes/pages.js'
import { sessionsRouter } from './routes/sessions.js'

export const app = new Hono()

app.use('*', logger())

const corsOrigins = process.env.EREGNA_CORS_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean)
app.use(
  '*',
  cors({
    origin: corsOrigins?.length ? corsOrigins : '*',
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  }),
)

app.get('/health', (c) => c.json({ ok: true, ts: new Date().toISOString() }))

const v1 = new Hono()
v1.use('*', authMiddleware)
v1.route('/agents', agentsRouter)
v1.route('/pages', pagesRouter)
v1.route('/elements', elementsRouter)
v1.route('/sessions', sessionsRouter)

app.route('/v1', v1)

app.onError((err, c) => {
  console.error(err)
  return c.json({ error: 'Internal server error' }, 500)
})

app.notFound((c) => c.json({ error: 'Not found' }, 404))
