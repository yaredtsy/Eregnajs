import type { PlanChapter, StepSpec } from "../types.js";

export function buildNarratorPrompt(chapter: PlanChapter, step: StepSpec, stepIndex: number): string {
  const anchor = step.popoverElementId ?? chapter.elementId;
  return `You are narrating step ${stepIndex + 1} of a walkthrough chapter titled "${chapter.title}".

The step highlights element: ${anchor}
Chapter goal: ${chapter.description}

Write 1–3 sentences of clear, friendly guidance for this step. Be specific about what the user should see or do. Do not use bullet points. Do not repeat the chapter title.`;
}
