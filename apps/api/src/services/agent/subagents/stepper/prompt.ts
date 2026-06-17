import type { AgentContext, ChapterContext } from "../../context/types.js";
import type { PlanChapter } from "../types.js";
import { elementKey } from "../../context/util/elementKey.js";

export function buildStepperPrompt(
  ctx: AgentContext,
  chapter: PlanChapter,
  chapterCtx: ChapterContext,
): string {
  const target = chapterCtx.targetElement;
  const siblings = chapterCtx.siblingElements.map((e) => `  - ${elementKey(e)} (${e.label})`).join("\n");
  const parents = chapterCtx.parentElements.map((e) => `  - ${elementKey(e)} (${e.label})`).join("\n");

  const toolList = ctx.hostTools.map((t) => `  - ${t.name}: ${t.description}`).join("\n");

  const targetLine = target
    ? `${elementKey(target)} (${target.label}${target.description ? " — " + target.description : ""})`
    : "none";
  const targetNotes = target?.notes ? `Target notes: ${target.notes}` : "";

  return `You are a step planner for one chapter of a walkthrough.

Chapter: "${chapter.title}"
Goal: ${chapter.description}
Target component: ${targetLine}
${targetNotes}
${parents ? `Parent components:\n${parents}` : ""}
${siblings ? `Sibling components:\n${siblings}` : ""}
${toolList ? `Available tools:\n${toolList}` : ""}

Produce an ordered list of steps. Each step should:
1. Have actions: start with scroll-to, then highlight the key component (reference components by their key, exactly as shown — never invent one).
2. Optionally wait-for-click or call-tool. If the target notes describe a precondition (e.g. "disabled until a row is selected"), add the guiding steps for it FIRST: highlight the prerequisite, wait-for-click on it, then continue.
3. Reference a popoverElementId (the component key the popover anchors to).
4. Optionally have a popoverTitle.

Assume all tool calls succeed. Keep steps focused — one interaction per step.`;
}
