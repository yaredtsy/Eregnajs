import type { AgentContext, ChapterContext, ElementRow } from "./types.js";

// Builds a focused view for one chapter given its target elementId (dom_id).
// Returns the target element, its direct siblings, and all ancestors.
export function focusChapter(ctx: AgentContext, elementDomId: string): ChapterContext {
  const elements = ctx.elements;

  const target = elements.find((e) => e.dom_id === elementDomId) ?? null;

  if (!target) {
    return { targetElement: null, siblingElements: [], parentElements: [] };
  }

  const siblings = elements.filter(
    (e) => e.parent_id === target.parent_id && e.id !== target.id,
  );

  const parents: ElementRow[] = [];
  let currentParentId = target.parent_id;
  while (currentParentId) {
    const parent = elements.find((e) => e.id === currentParentId);
    if (!parent) break;
    parents.unshift(parent);
    currentParentId = parent.parent_id;
  }

  return { targetElement: target, siblingElements: siblings, parentElements: parents };
}
