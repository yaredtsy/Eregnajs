import type { AgentContext, ChapterContext } from "../../context/types.js";
import type { PlanChapter } from "../types.js";

export function buildStepperPrompt(
  ctx: AgentContext,
  chapter: PlanChapter,
  chapterCtx: ChapterContext,
): string {
  const target = chapterCtx.targetElement;
  const siblings = chapterCtx.siblingElements.map((e) => `  - ${e.dom_id} (${e.label})`).join("\n");
  const parents = chapterCtx.parentElements.map((e) => `  - ${e.dom_id} (${e.label})`).join("\n");

  const toolList = ctx.hostTools.map((t) => `  - ${t.name}: ${t.description}`).join("\n");

  return `You are a step planner for one chapter of a walkthrough.

Chapter: "${chapter.title}"
Goal: ${chapter.description}
Target element: ${target ? `${target.dom_id} (${target.label}${target.description ? " — " + target.description : ""})` : "none"}
${parents ? `Parent elements:\n${parents}` : ""}
${siblings ? `Sibling elements:\n${siblings}` : ""}
${toolList ? `Available tools:\n${toolList}` : ""}

Produce an ordered list of steps. Each step should:
1. Have actions: start with scroll-to, then highlight the key element.
2. Optionally wait-for-click or call-tool.
3. Reference a popoverElementId (the element the popover anchors to).
4. Optionally have a popoverTitle.

Assume all tool calls succeed. Keep steps focused — one interaction per step.`;
}
