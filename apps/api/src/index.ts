import { app } from './app.js'

const port = Number(process.env.PORT ?? 4000)

Bun.serve({
  port,
  fetch: app.fetch,
})

console.log(`API listening on http://localhost:${port}`)
console.log(`Swagger UI at http://localhost:${port}/docs`)
