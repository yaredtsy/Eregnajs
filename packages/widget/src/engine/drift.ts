import type { WalkthroughPart } from "../types/conversation";
import { resolveKey } from "./selectors.js";

function keysForChapter(wt: WalkthroughPart, chapterIndex: number): string[] {
  const keys = new Set<string>();
  const chapter = wt.chapters[chapterIndex];
  if (!chapter) return [];

  if (chapter.elementId) keys.add(chapter.elementId);

  const start = chapter.stepIndex >= 0 ? chapter.stepIndex : 0;
  const next = wt.chapters[chapterIndex + 1];
  const end = next && next.stepIndex >= 0 ? next.stepIndex : wt.steps.length;

  for (const step of wt.steps.slice(start, end)) {
    for (const action of step.actions) {
      if ("elementId" in action && action.elementId) keys.add(action.elementId);
    }
  }
  return [...keys];
}

/** Chapter-1 pre-flight: every key the first chapter references must resolve (flow 04 §1). */
export function preflightChapter1(wt: WalkthroughPart): { ok: boolean; missing: string[] } {
  if (!wt.manifest || wt.chapters.length === 0) return { ok: true, missing: [] };
  const missing = keysForChapter(wt, 0).filter((k) => resolveKey(k) === null);
  return { ok: missing.length === 0, missing };
}

export function chapterIndexForStep(wt: WalkthroughPart, stepIndex: number): number {
  let current = 0;
  wt.chapters.forEach((c, i) => {
    if (c.stepIndex >= 0 && c.stepIndex <= stepIndex) current = i;
  });
  return current;
}

export function highlightKeyOfStep(
  step: WalkthroughPart["steps"][number] | undefined,
): string | null {
  if (!step) return null;
  const highlight = step.actions.find((a) => a.type === "highlight");
  return highlight?.elementId ?? null;
}

export function stepNeedsHighlight(step: WalkthroughPart["steps"][number]): boolean {
  return step.actions.some(
    (a) => a.type === "highlight" || a.type === "scroll-to" || a.type === "wait-for-click",
  );
}
