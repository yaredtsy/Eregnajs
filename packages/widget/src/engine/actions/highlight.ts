import { resolveElementWithRetry } from "../selectors.js";

const HIGHLIGHT_CLASS = "eregna-engine-highlight";

let lastHighlighted: Element | null = null;

// Returns false when the target never resolved — the step skips (not-found path).
export async function highlight(elementId: string): Promise<boolean> {
  if (lastHighlighted) {
    lastHighlighted.classList.remove(HIGHLIGHT_CLASS);
    lastHighlighted = null;
  }
  const el = await resolveElementWithRetry(elementId);
  if (!el) return false;
  el.classList.add(HIGHLIGHT_CLASS);
  lastHighlighted = el;
  return true;
}

export function clearHighlight(): void {
  if (lastHighlighted) {
    lastHighlighted.classList.remove(HIGHLIGHT_CLASS);
    lastHighlighted = null;
  }
}
