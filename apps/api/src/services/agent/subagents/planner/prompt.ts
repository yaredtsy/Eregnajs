import type { AgentContext } from "../../context/types.js";

export function buildPlannerPrompt(ctx: AgentContext, query: string): string {
  const elementIds = ctx.elements
    .filter((e) => e.dom_id)
    .map((e) => `- ${e.dom_id} (${e.label})`)
    .join("\n");

  return `You are a walkthrough planner. Given the user's question and the available elements on the page, produce a structured plan consisting of ordered chapters.

Each chapter must target exactly one element by its dom_id. If the question cannot be answered by any registered element, create one chapter targeting the page root element (use the first available element id) with a polite explanation.

Available element ids:
${elementIds || "(none registered)"}

User question: ${query}

Return a JSON plan with: planGoal, optional planRationale, and chapters (title, description, elementId).`;
}
