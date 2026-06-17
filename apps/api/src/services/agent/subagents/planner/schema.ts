import { z } from "zod";

export const PlanChapterSchema = z.object({
  title: z.string().describe("Short chapter title shown in the walkthrough checklist"),
  description: z.string().describe("One sentence: what this chapter demonstrates"),
  elementId: z.string().describe("component key of the primary component this chapter focuses on, copied exactly from the available keys"),
});

export const PlanSchema = z.object({
  planGoal: z.string().describe("One sentence goal of the entire walkthrough"),
  planRationale: z.string().optional().describe("Why this plan was chosen"),
  thought: z
    .string()
    .min(1)
    .max(200)
    .describe("One short line summarizing your planning approach for the live thinking ticker"),
  chapters: z.array(PlanChapterSchema).min(1).max(6).describe("Ordered list of chapters"),
});

export type PlanSchemaType = z.infer<typeof PlanSchema>;
