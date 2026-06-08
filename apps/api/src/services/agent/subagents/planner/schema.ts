import { z } from "zod";

export const PlanChapterSchema = z.object({
  title: z.string().describe("Short chapter title shown in the walkthrough checklist"),
  description: z.string().describe("One sentence: what this chapter demonstrates"),
  elementId: z.string().describe("dom_id of the primary element this chapter focuses on"),
});

export const PlanSchema = z.object({
  planGoal: z.string().describe("One sentence goal of the entire walkthrough"),
  planRationale: z.string().optional().describe("Why this plan was chosen"),
  chapters: z.array(PlanChapterSchema).min(1).describe("Ordered list of chapters"),
});

export type PlanSchemaType = z.infer<typeof PlanSchema>;
