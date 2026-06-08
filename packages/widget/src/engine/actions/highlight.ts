import { resolveElementWithRetry } from "../selectors.js";

const HIGHLIGHT_CLASS = "eregna-engine-highlight";

let lastHighlighted: Element | null = null;

export async function highlight(elementId: string): Promise<void> {
  if (lastHighlighted) {
    lastHighlighted.classList.remove(HIGHLIGHT_CLASS);
    lastHighlighted = null;
  }
  const el = await resolveElementWithRetry(elementId);
  if (!el) return;
  el.classList.add(HIGHLIGHT_CLASS);
  lastHighlighted = el;
}

export function clearHighlight(): void {
  if (lastHighlighted) {
    lastHighlighted.classList.remove(HIGHLIGHT_CLASS);
    lastHighlighted = null;
  }
}
