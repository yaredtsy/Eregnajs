import { elementKey } from "../context/util/elementKey.js";
import type { AgentContext } from "../context/types.js";
import type { Plan, PlanChapter, StepList, ActionSpec } from "./types.js";

export function validElementKeys(ctx: AgentContext): Set<string> {
  return new Set(ctx.elements.map(elementKey));
}

export function validatePlanKeys(plan: Plan, keys: Set<string>): string | null {
  const bad = plan.chapters.filter((c) => !keys.has(c.elementId));
  if (bad.length === 0) return null;
  return `Unknown component keys: ${bad.map((c) => c.elementId).join(", ")}. Use only keys from the registered element list.`;
}

export function filterInvalidChapters(
  plan: Plan,
  keys: Set<string>,
): { plan: Plan; dropped: string[] } {
  const dropped: string[] = [];
  const chapters = plan.chapters.filter((c) => {
    if (keys.has(c.elementId)) return true;
    dropped.push(c.elementId);
    return false;
  });
  return { plan: { ...plan, chapters }, dropped };
}

const MAX_WAIT_MS = 10_000;

function remapElementId(
  id: string | undefined,
  keys: Set<string>,
  fallback: string,
): string | undefined {
  if (!id) return id;
  return keys.has(id) ? id : fallback;
}

function sanitizeAction(
  action: ActionSpec,
  keys: Set<string>,
  toolNames: Set<string>,
  chapterKey: string,
): ActionSpec | null {
  switch (action.type) {
    case "wait":
      return { ...action, ms: Math.min(Math.max(action.ms, 1), MAX_WAIT_MS) };
    case "call-tool":
      return toolNames.has(action.toolName) ? action : null;
    case "scroll-to":
    case "highlight":
    case "wait-for-click":
      return {
        ...action,
        elementId: remapElementId(action.elementId, keys, chapterKey) ?? chapterKey,
      };
    default:
      return action;
  }
}

export function sanitizeStepList(
  stepList: StepList,
  ctx: AgentContext,
  chapter: PlanChapter,
): StepList {
  const keys = validElementKeys(ctx);
  const toolNames = new Set(ctx.hostTools.map((t) => t.name));
  const chapterKey = chapter.elementId;

  const steps = stepList.steps.map((step) => {
    const actions = step.actions
      .map((a) => sanitizeAction(a, keys, toolNames, chapterKey))
      .filter((a): a is ActionSpec => a !== null);

    if (actions.length === 0) {
      actions.push({ type: "highlight", elementId: chapterKey });
    }

    return {
      ...step,
      actions,
      popoverElementId: remapElementId(step.popoverElementId, keys, chapterKey),
    };
  });

  return { ...stepList, steps };
}
