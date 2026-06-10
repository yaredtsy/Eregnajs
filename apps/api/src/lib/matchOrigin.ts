// Per-agent origin allowlist matching (docs/v2/3-server/06 §2).
//
// Pattern forms:
//   "https://acme.com"   exact origin (scheme + host + optional port)
//   "acme.com"           host match, any scheme, no port
//   "*.acme.com"         any subdomain, any scheme
//   "localhost:*"        localhost or 127.0.0.1, any port, any scheme

export function matchOrigin(patterns: string[], origin: string): boolean {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  const host = url.host.toLowerCase(); // includes :port when present
  const hostname = url.hostname.toLowerCase();
  const normalizedOrigin = `${url.protocol}//${host}`;

  return patterns.some((raw) => {
    const pattern = raw.trim().toLowerCase().replace(/\/+$/, "");
    if (!pattern) return false;

    if (pattern.includes("://")) {
      return pattern === normalizedOrigin;
    }
    if (pattern === "localhost:*") {
      return hostname === "localhost" || hostname === "127.0.0.1";
    }
    if (pattern.startsWith("*.")) {
      return hostname.endsWith(pattern.slice(1)); // ".acme.com"
    }
    return hostname === pattern;
  });
}
