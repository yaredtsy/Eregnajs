import { z } from "zod";

export const CONVERSATION_MAX_BYTES = 256 * 1024;

const MessageSchema = z.object({
  id: z.string().max(80),
  role: z.enum(["user", "assistant"]),
  parts: z.array(z.unknown()),
  status: z.enum(["streaming", "complete", "error"]),
  createdAt: z.number(),
  metadata: z.record(z.unknown()).optional(),
});

export const ConversationSchema = z
  .object({
    sessionId: z.string().max(80),
    agentName: z.string().max(120),
    messages: z.array(MessageSchema).max(100),
  })
  .refine((c) => JSON.stringify(c).length <= CONVERSATION_MAX_BYTES, {
    message: `conversation exceeds ${CONVERSATION_MAX_BYTES} bytes`,
  });

export type ConversationInput = z.infer<typeof ConversationSchema>;
