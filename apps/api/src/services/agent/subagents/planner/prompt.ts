import type { AgentContext } from "../../context/types.js";
import { elementKey } from "../../context/util/elementKey.js";

export function buildPlannerPrompt(ctx: AgentContext, query: string, repairHint?: string): string {
  const elementKeys = ctx.elements
    .map((e) => `- ${elementKey(e)} (${e.label})`)
    .join("\n");

  const repair = repairHint
    ? `\n\nPrevious attempt failed validation:\n${repairHint}\nPlease fix and try again.`
    : "";

  return `You are a walkthrough planner. Given the user's question and the available components on the page, produce a structured plan consisting of ordered chapters.

Each chapter must target exactly one component by its key, copied exactly from the list below — never invent a key. If the question cannot be answered by any registered component, create one chapter targeting the first available key with a polite explanation.

Available component keys:
${elementKeys || "(none registered)"}

User question: ${query}

Return a JSON plan with: planGoal, optional planRationale, thought (one short ticker line summarizing your approach), and chapters (title, description, elementId — set elementId to the component key).${repair}`;
}
