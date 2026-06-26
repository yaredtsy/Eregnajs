import { z } from "zod";

export const PlanReasoningSchema = z.object({
  understanding: z.string().min(20).describe(
    "Restate the visitor's goal in your own words, then briefly note " +
      "what they likely already know vs. what they'll need to learn. " +
      "Visible to the visitor in the reasoning disclosure — write it " +
      "for them, not for yourself. As detailed as the goal warrants.",
  ),
  knowledgeAnchors: z.array(z.string()).max(8).describe(
    "Titles of knowledge entries or hostKnowledge facts you relied on. " +
      "Use the exact titles from the Knowledge section. Empty array if " +
      "no facts applied.",
  ),
  componentMapping: z.string().min(20).describe(
    "Walk through which components on the page address this goal and " +
      "why those over the alternatives. Mention components you considered " +
      "and rejected if the choice was non-obvious. Visible to the visitor.",
  ),
});

export type PlanReasoningType = z.infer<typeof PlanReasoningSchema>;

export const PlanFrameSchema = z.object({
  planGoal: z.string().min(1).max(120).describe(
    "One sentence goal of the entire walkthrough. Shown above the " +
      "checklist. Visitor-facing — concrete and outcome-oriented.",
  ),
  planRationale: z.string().max(280).optional().describe(
    "Optional: why this plan over alternatives. Omit when obvious.",
  ),
  thought: z.string().min(1).max(200).describe(
    "Short ticker line for the live UI — the 'what I'm about to do' " +
      "voice. Distinct from componentMapping (decision) and " +
      "understanding (restatement).",
  ),
});

export type PlanFrameType = z.infer<typeof PlanFrameSchema>;

const ChapterIntent = z.enum(["show", "click", "fill", "compare"]).describe(
  "What the chapter accomplishes for the visitor. " +
    "'show' = spotlight only. 'click' = teach a click target. " +
    "'fill' = teach an input. 'compare' = juxtapose siblings.",
);

export const PlanChapterSchema = z.object({
  title: z.string().min(1).max(60).describe(
    "Short chapter title shown in the checklist. Visible label, " +
      "not a key. Sentence case.",
  ),
  description: z.string().min(1).max(140).describe(
    "One sentence: what the visitor learns or does in this chapter.",
  ),
  elementId: z.string().describe(
    "Component key for the primary target — copied EXACTLY from the " +
      "component index above. Never invent.",
  ),
  intent: ChapterIntent,
  expectedSteps: z.number().int().min(1).max(5).describe(
    "Soft hint to the stepper: how many interactions this chapter " +
      "needs. 1 for spotlight-only, 2-3 for typical clicks, up to 5 " +
      "for multi-field forms.",
  ),
});

export const ChaptersSchema = z.object({
  chapters: z.array(PlanChapterSchema).min(1).max(6).describe(
    "Ordered chapters that fulfill planGoal. Shortest plan that " +
      "answers the goal wins.",
  ),
});

export type ChaptersType = z.infer<typeof ChaptersSchema>;
