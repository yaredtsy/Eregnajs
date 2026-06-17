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

export const app = new Hono()

app.use('*', logger())

// Two CORS surfaces (docs/v2/2-system/01 §2): the dashboard surface can be
// pinned to known origins; the embed surface must accept any browser origin —
// per-agent origin *authorization* happens inside the public route.
const corsOrigins = process.env.EREGNA_CORS_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean)
app.use(
  '/v1/*',
  cors({
    origin: corsOrigins?.length ? corsOrigins : '*',
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
  return c.json({ error: 'Internal server error' }, 500)
})

app.notFound((c) => c.json({ error: 'Not found' }, 404))
