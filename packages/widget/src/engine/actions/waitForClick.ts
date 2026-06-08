import { resolveElementWithRetry } from "../selectors.js";

export async function waitForClick(
  elementId: string,
  timeoutMs = 30_000,
): Promise<"clicked" | "timeout"> {
  const el = await resolveElementWithRetry(elementId);
  if (!el) return "timeout";

  const resolved = el;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolved.removeEventListener("click", onClick);
      resolve("timeout");
    }, timeoutMs);

    function onClick() {
      clearTimeout(timer);
      resolved.removeEventListener("click", onClick);
      resolve("clicked");
    }

    resolved.addEventListener("click", onClick, { once: true });
  });
}
