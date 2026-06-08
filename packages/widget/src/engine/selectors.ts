const RETRY_INTERVAL_MS = 100;
const MAX_RETRIES = 30; // 3 seconds total

export async function resolveElement(elementId: string): Promise<Element | null> {
  return document.getElementById(elementId);
}

export async function resolveElementWithRetry(elementId: string): Promise<Element | null> {
  for (let i = 0; i < MAX_RETRIES; i++) {
    const el = document.getElementById(elementId);
    if (el) return el;
    await new Promise((r) => setTimeout(r, RETRY_INTERVAL_MS));
  }
  return null;
}
