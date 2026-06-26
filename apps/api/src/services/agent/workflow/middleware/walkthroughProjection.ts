import type { WalkthroughPart } from "@repo/walkthrough-core";

export function renderActiveWalkthroughMarkdown(part: WalkthroughPart): string {
  const reasoning = part.reasoning
    ? `\n### Reasoning the planner shared with the visitor\n` +
      `- Understanding: ${part.reasoning.understanding}\n` +
      `- Component mapping: ${part.reasoning.componentMapping}\n`
    : "";

  const chapters = part.chapters.length
    ? "\n### Chapters\n" +
      part.chapters
        .map(
          (c, i) =>
            `${i + 1}. **${c.title}** — ${c.description} ` +
            `(intent: ${c.intent ?? "show"}, ~${c.expectedSteps ?? 1} step(s))`,
        )
        .join("\n")
    : "\n_Chapters are still being drafted._";

  return `## Active walkthrough (${part.status})
Goal: ${part.planGoal}${part.planRationale ? `\nRationale: ${part.planRationale}` : ""}
${reasoning}${chapters}

The visitor sees this checklist in the widget right now. Reference it
by chapter titles when relevant. Do not quote the reasoning verbatim
— the visitor already sees it. If the visitor asks to change the plan,
call \`start_walkthrough\` again with a refined goal.`.trim();
}
