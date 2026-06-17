/** CORS origin resolver for dashboard ↔ API in dev and production. */
export function resolveV1CorsOrigin(requestOrigin: string | undefined): string {
  const configured =
    process.env.EREGNA_CORS_ORIGINS?.split(',')
      .map((s) => s.trim())
      .filter(Boolean) ?? []

  if (requestOrigin) {
    try {
      const { hostname } = new URL(requestOrigin)
      // Local dashboard dev — always allow any localhost / 127.0.0.1 port.
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return requestOrigin
      }
    } catch {
      /* ignore malformed Origin */
    }
    if (configured.includes(requestOrigin)) return requestOrigin
  }

  if (configured.length > 0) return configured[0]!
  return '*'
}

export function applyCorsHeaders(c: { req: { header: (n: string) => string | undefined }; header: (n: string, v: string) => void }) {
  const origin = resolveV1CorsOrigin(c.req.header('Origin'))
  c.header('Access-Control-Allow-Origin', origin)
  c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  c.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  c.header('Vary', 'Origin')
}
