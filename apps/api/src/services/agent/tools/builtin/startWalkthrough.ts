import { tool } from "langchain";
import { z } from "zod";
import { nanoid } from "nanoid";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { Patcher } from "../../patcher/createPatcher.js";
import type { AgentContext } from "../../context/types.js";
import { runPlanner } from "../../subagents/planner/run.js";
import * as h from "../../patcher/helpers.js";

export function startWalkthroughTool(
  model: BaseChatModel,
  ctx: AgentContext,
  patcher: Patcher,
  getAssistantMsgIndex: () => number,
) {
  return tool(
    async ({ goal }: { goal: string }) => {
      const msgIndex = getAssistantMsgIndex();
      const partIndex = h.replaceOrAddWalkthroughPart(patcher.conversation, msgIndex, {
        walkthroughId: `wt_${nanoid(10)}`,
        planGoal: "",
        status: "planning",
        chapters: [],
        steps: [],
        parentContext: null,
        thoughts: [],
      });
      await patcher.emit();

      try {
        const plan = await runPlanner(model, ctx, goal, {
          patcher,
          msgIndex,
          partIndex,
        });

        const part = patcher.conversation.messages[msgIndex]?.parts[partIndex];
        const walkthroughId =
          part?.type === "walkthrough" ? part.walkthroughId : `wt_${nanoid(10)}`;

        return JSON.stringify({
          walkthroughId,
          chapterCount: plan.chapters.length,
          status: "planned",
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        h.setWalkthroughStatus(patcher.conversation, msgIndex, partIndex, "error");
        await patcher.emit();
        return JSON.stringify({
          status: "error",
          message: `Could not plan the walkthrough: ${message}`,
        });
      }
    },
    {
      name: "start_walkthrough",
      description:
        "Plan a guided tour of the host page that answers a specific " +
        "visitor goal. Use when the visitor explicitly asks to be shown, " +
        "walked through, or guided. Pass a one-sentence goal derived " +
        "from the visitor's request. Do not call this unprompted.",
      schema: z.object({
        goal: z.string().min(8).max(280).describe(
          "One sentence describing what the tour should accomplish, " +
            "phrased as an outcome the visitor will reach.",
        ),
      }),
    },
  );
}
