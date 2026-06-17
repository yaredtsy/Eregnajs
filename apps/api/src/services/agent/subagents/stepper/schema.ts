import { z } from "zod";

const ActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("scroll-to"), elementId: z.string() }),
  z.object({ type: z.literal("highlight"), elementId: z.string() }),
  z.object({ type: z.literal("wait"), ms: z.number().int().positive() }),
  z.object({
    type: z.literal("wait-for-click"),
    elementId: z.string(),
    timeoutMs: z.number().int().positive().optional(),
  }),
  z.object({
    type: z.literal("call-tool"),
    toolName: z.string(),
    args: z.record(z.unknown()),
  }),
]);

const StepSpecSchema = z.object({
  actions: z.array(ActionSchema).min(1),
  popoverTitle: z.string().optional(),
  popoverElementId: z.string().optional(),
});

export const StepListSchema = z.object({
  thought: z
    .string()
    .min(1)
    .max(200)
    .describe("One short line summarizing this chapter's step plan for the live thinking ticker"),
  steps: z.array(StepSpecSchema).min(1).max(8),
});

export type StepListSchemaType = z.infer<typeof StepListSchema>;
