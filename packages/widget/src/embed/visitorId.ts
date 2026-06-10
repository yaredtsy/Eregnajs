// Anonymous, trust-free visitor identity (docs/v2/3-server/06 §5): exists only
// as a rate-limit key and a future multi-turn join key.

const STORAGE_KEY = "eregna:visitor-id";

let memoryFallback: string | undefined;

export function getVisitorId(): string | undefined {
  try {
    let id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  } catch {
    // localStorage can throw (sandboxed iframes, privacy modes) — the widget
    // must never break the host page over an optional id.
    if (!memoryFallback) {
      try {
        memoryFallback = crypto.randomUUID();
      } catch {
        return undefined;
      }
    }
    return memoryFallback;
  }
}
