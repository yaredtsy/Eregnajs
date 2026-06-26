import type { AgentContext } from "../../context/types.js";
import { elementKey } from "../../context/util/elementKey.js";
import type { PlanFrame, PlanReasoning } from "../types.js";

export function buildReasoningPrompt(ctx: AgentContext, goal: string): string {
  const elementKeys = ctx.elements
    .map((e) => `- ${elementKey(e)} (${e.label})`)
    .join("\n");

  return `A visitor has asked for guidance toward this goal:

> ${goal}

Before drafting any plan, think it through.

Write three things for the visitor (they will see your answer in an
expandable reasoning section under the walkthrough card):

1. **understanding** — Restate the goal in your own words. Note what
   the visitor likely already knows vs. what they need to learn.
2. **knowledgeAnchors** — List the titles (exact, from the Knowledge
   section above) of any facts you relied on. Empty array if none.
3. **componentMapping** — Walk through which components on the page
   address this goal and why those over the alternatives. Mention
   components you considered and rejected when the choice is non-
   obvious.

Available component keys:
${elementKeys || "(none registered)"}

Write in plain visitor-facing language. Be as detailed as the goal
warrants — the reasoning section handles long text. Do not draft
chapters or actions in this response.`;
}

export function buildFramePrompt(goal: string): string {
  return `Now state the frame of the plan — one sentence each, no
chapters yet.

- **planGoal** — One outcome-oriented sentence: at the end of this
  tour, the visitor will _____. Visitor-facing.
- **planRationale** — Only if your choice of approach is non-obvious;
  one short sentence on why this approach over alternatives. Omit
  otherwise.
- **thought** — One short ticker line for the live UI: "Mapping the
  account creation flow", "Tracing the checkout funnel", etc. The
  voice is "what I'm about to do".

Reference the goal: "${goal}".`;
}

export function buildChaptersPrompt(ctx: AgentContext, goal: string, repairHint?: string): string {
  const elementKeys = ctx.elements
    .map((e) => `- ${elementKey(e)} (${e.label})`)
    .join("\n");

  const repair = repairHint
    ? `\n\nPrevious attempt failed validation:\n${repairHint}\nPlease fix and try again.`
    : "";

  return `Given the goal, your reasoning, and the plan frame above,
emit the ordered chapters that fulfill the plan.

Each chapter:
- targets exactly one component, by key from the list — copied
  exactly, never invented;
- declares an **intent**: "show" (spotlight only), "click" (teach a
  click), "fill" (teach an input), or "compare" (juxtapose siblings);
- carries an **expectedSteps** hint (1..5). 1 if the chapter is just
  a spotlight, 2-3 for a typical click, up to 5 for multi-field forms.
  The stepper may emit fewer or more — this is guidance.

Rules:
- 1..6 chapters total. Shortest plan that answers the goal wins.
- Order matters: each chapter should make sense to a visitor who just
  finished the previous one.
- No "scroll to" step — highlight handles scrolling.
- If the goal cannot be answered with the registered components,
  return a single chapter targeting the most relevant key; the
  rationale you already wrote covers the gap.

Available component keys:
${elementKeys || "(none registered)"}

Goal: ${goal}${repair}`;
}

export function formatReasoningAsPrior(r: PlanReasoning): string {
  return `Reasoning I just wrote:
- Understanding: ${r.understanding}
- Knowledge anchors: ${
    r.knowledgeAnchors.length
      ? r.knowledgeAnchors.map((t) => `"${t}"`).join(", ")
      : "(none)"
  }
- Component mapping: ${r.componentMapping}`;
}

export function formatFrameAsPrior(f: PlanFrame): string {
  const rationale = f.planRationale ? `\n- Rationale: ${f.planRationale}` : "";
  return `Plan frame I just wrote:
- Goal: ${f.planGoal}${rationale}
- Live thought: ${f.thought}`;
}

/** @deprecated Use buildReasoningPrompt for stage 1 */
export function buildPlannerPrompt(ctx: AgentContext, query: string, repairHint?: string): string {
  return buildChaptersPrompt(ctx, query, repairHint);
}
