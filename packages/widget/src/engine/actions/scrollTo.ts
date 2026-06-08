import { resolveElementWithRetry } from "../selectors.js";

export async function scrollTo(elementId: string): Promise<void> {
  const el = await resolveElementWithRetry(elementId);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  // Wait for scroll animation
  await new Promise((r) => setTimeout(r, 600));
}
