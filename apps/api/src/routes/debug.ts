import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { agentService } from "../services/agent.service.js";
import { composeContext } from "../services/agent/context/compose.js";
import { inspectPrompt } from "../services/agent/prompts/index.js";
import { pickModel } from "../services/agent/llm/provider.js";
import { TokenLedger } from "../services/agent/telemetry/index.js";
import { runPlannerDetailed } from "../services/agent/subagents/planner/run.js";
import { runStepperDetailed } from "../services/agent/subagents/stepper/run.js";
import { buildNarratorPrompt } from "../services/agent/subagents/narrator/prompt.js";
import { runNarratorFull } from "../services/agent/subagents/narrator/run.js";
import { focusChapter } from "../services/agent/context/focusChapter.js";
import { PlanChapterSchema } from "../services/agent/subagents/planner/schema.js";
import { jsonError } from "../lib/http.js";

const HostToolSchema = z.object({
  name: z.string(),
  description: z.string(),
  parameters: z.record(z.unknown()).optional(),
});

const HostKnowledgeSchema = z.object({
  title: z.string(),
  content: z.string(),
});

const DebugBaseSchema = z.object({
  agentId: z.string().uuid(),
  pageUrl: z.string().url(),
  query: z.string().min(1),
  hostState: z.record(z.unknown()).optional(),
  hostTools: z.array(HostToolSchema).optional(),
  hostKnowledge: z.array(HostKnowledgeSchema).optional(),
});

async function resolveAgentContext(
  userId: string,
  body: z.infer<typeof DebugBaseSchema>,
) {
  const agent = await agentService.getByIdForUser(userId, body.agentId);
  if (!agent) return null;

  const ctx = await composeContext({
    agentPublicId: agent.public_id,
    pageUrl: body.pageUrl,
    hostState: body.hostState ?? {},
    hostTools: body.hostTools ?? [],
    hostKnowledge: body.hostKnowledge,
  });

  return { agent, ctx };
}

export const debugRouter = new Hono();

debugRouter.post(
  "/context",
  zValidator("json", DebugBaseSchema),
  async (c) => {
    const userId = c.get("userId");
    const body = c.req.valid("json");
    const resolved = await resolveAgentContext(userId, body);
    if (!resolved) return jsonError(c, 404, "Not found");

    const { agent, ctx } = resolved;
    const inspected = inspectPrompt(ctx);

    return c.json({
      data: {
        agent: { id: agent.id, name: agent.name, publicId: agent.public_id },
        page: ctx.page ? { id: ctx.page.id, urlPattern: ctx.page.url_pattern } : null,
        counts: {
          elements: ctx.elements.length,
          siteFacts: ctx.siteFacts.length,
          hostKnowledge: ctx.hostKnowledge.length,
          hostTools: ctx.hostTools.length,
        },
        sections: inspected.sections,
        prompt: inspected.prompt,
        charCount: inspected.charCount,
        tokenEstimate: inspected.tokenEstimate,
      },
    });
  },
);

debugRouter.post(
  "/plan",
  zValidator("json", DebugBaseSchema),
  async (c) => {
    const userId = c.get("userId");
    const body = c.req.valid("json");
    const resolved = await resolveAgentContext(userId, body);
    if (!resolved) return jsonError(c, 404, "Not found");

    const { ctx } = resolved;
    const model = pickModel(ctx.agent.model);
    const ledger = new TokenLedger();
    const result = await runPlannerDetailed(model, ctx, body.query, { ledger });

    return c.json({
      data: {
        systemPrompt: result.systemPrompt,
        userPrompt: result.userPrompt,
        plan: result.plan,
        repairAttempted: result.repairAttempted,
        droppedChapterKeys: result.droppedChapterKeys,
        tokenUsage: ledger.report(),
        thoughts: [
          { phase: "system", label: "Reading your question…" },
          { phase: "plan", label: result.plan.thought },
        ],
      },
    });
  },
);

const DebugStepSchema = DebugBaseSchema.extend({
  chapterIndex: z.number().int().min(0).optional(),
  chapter: PlanChapterSchema.optional(),
});

debugRouter.post(
  "/step",
  zValidator("json", DebugStepSchema),
  async (c) => {
    const userId = c.get("userId");
    const body = c.req.valid("json");
    const resolved = await resolveAgentContext(userId, body);
    if (!resolved) return jsonError(c, 404, "Not found");

    const { ctx } = resolved;
    const model = pickModel(ctx.agent.model);
    const ledger = new TokenLedger();

    let chapter = body.chapter;
    if (!chapter) {
      const planResult = await runPlannerDetailed(model, ctx, body.query, { ledger });
      const idx = body.chapterIndex ?? 0;
      chapter = planResult.plan.chapters[idx];
      if (!chapter) {
        return jsonError(c, 400, `No chapter at index ${idx}`);
      }
    }

    const chapterCtx = focusChapter(ctx, chapter.elementId);
    const stepperResult = await runStepperDetailed(model, ctx, chapter, {
      ledger,
      chapterIndex: body.chapterIndex,
    });

    return c.json({
      data: {
        chapter,
        focused: {
          targetKey: chapter.elementId,
          targetElement: chapterCtx.targetElement
            ? { id: chapterCtx.targetElement.id, label: chapterCtx.targetElement.label }
            : null,
          siblingCount: chapterCtx.siblingElements.length,
          parentCount: chapterCtx.parentElements.length,
        },
        prompt: stepperResult.prompt,
        stepList: stepperResult.stepList,
        repairAttempted: stepperResult.repairAttempted,
        tokenUsage: ledger.report(),
        thought: { phase: "chapter", label: stepperResult.stepList.thought },
      },
    });
  },
);

const StepSpecSchema = z.object({
  actions: z.array(z.any()).min(1),
  popoverTitle: z.string().optional(),
  popoverElementId: z.string().optional(),
});

const DebugNarrateSchema = DebugBaseSchema.extend({
  chapter: PlanChapterSchema,
  step: StepSpecSchema,
  stepIndex: z.number().int().min(0).default(0),
});

debugRouter.post(
  "/narrate",
  zValidator("json", DebugNarrateSchema),
  async (c) => {
    const userId = c.get("userId");
    const body = c.req.valid("json");
    const resolved = await resolveAgentContext(userId, body);
    if (!resolved) return jsonError(c, 404, "Not found");

    const { ctx } = resolved;
    const model = pickModel(ctx.agent.model);
    const prompt = buildNarratorPrompt(body.chapter, body.step, body.stepIndex);
    const ledger = new TokenLedger();
    const narrated = await runNarratorFull(model, body.chapter, body.step, body.stepIndex, {
      ledger,
      model: ctx.agent.model,
      chapterIndex: undefined,
      stepIndex: body.stepIndex,
    });

    return c.json({
      data: {
        prompt,
        text: narrated.text,
        model: ctx.agent.model,
        tokenUsage: ledger.report(),
      },
    });
  },
);
