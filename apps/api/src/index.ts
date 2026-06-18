import { app } from './app.js'

const port = Number(process.env.PORT ?? 4000)

console.log(`API listening on http://localhost:${port}`)
console.log(`Swagger UI at http://localhost:${port}/docs`)

// Default export lets `bun --hot` swap the fetch handler without restarting the process.
export default {
  port,
  fetch: app.fetch,
}
