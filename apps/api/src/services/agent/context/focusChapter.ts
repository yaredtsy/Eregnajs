import type { AgentContext, ChapterContext, ElementRow } from "./types.js";
import { elementKey } from "./util/elementKey.js";

// Builds a focused view for one chapter given its target component key.
// Returns the target element, its direct siblings, and all ancestors.
export function focusChapter(ctx: AgentContext, targetKey: string): ChapterContext {
  const elements = ctx.elements;

  const target = elements.find((e) => elementKey(e) === targetKey) ?? null;

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
