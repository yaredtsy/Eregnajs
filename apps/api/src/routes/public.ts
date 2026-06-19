import { Hono, type Context } from "hono";
import { describeRoute, validator } from "hono-openapi";
import { getConnInfo } from "hono/bun";
import { z } from "zod";
import { createServerClient } from "@repo/db/client";
import { createNdjsonStream } from "../services/agent/transport/ndjson.js";
import { runAgent } from "../services/agent/run.js";
import { matchOrigin } from "../lib/matchOrigin.js";
import { createRateLimiter } from "../lib/rateLimit.js";
import { jsonError, ndjsonOk } from "../lib/openapi.js";
import { ConversationSchema } from "../lib/conversationSchema.js";
import type { Conversation } from "@repo/walkthrough-core";
import { isAbortError } from "../lib/abort.js";
import { ToolValidationError } from "../services/agent/tools/validate.js";
import { parseHostTools } from "../services/agent/tools/parseHostTools.js";

// The visitor-facing surface (docs/v2/3-server/06 §2). No JWT — admission is
// public_id + per-agent origin allowlist + rate limits, all checked before
// any LLM spend.

const agentLimiter = createRateLimiter({ capacity: 30, refillPerMinute: 30 });
const ipLimiter = createRateLimiter({ capacity: 6, refillPerMinute: 6 });

const HOST_STATE_MAX_BYTES = 16 * 1024;
const HOST_KNOWLEDGE_MAX_BYTES = 32 * 1024;
const MAX_TOOLS = 20;
const MAX_KNOWLEDGE_ENTRIES = 20;

const RunBodySchema = z.object({
  agentPublicId: z.string().min(1).max(80),
  pageUrl: z.string().url().max(2048),
  query: z.string().min(1).max(2000),
  hostState: z
    .record(z.unknown())
    .optional()
    .refine((s) => s === undefined || JSON.stringify(s).length <= HOST_STATE_MAX_BYTES, {
      message: `hostState exceeds ${HOST_STATE_MAX_BYTES} bytes`,
    }),
  hostTools: z
    .array(
      z.object({
        name: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/).max(40),
        description: z.string().max(500),
        parameters: z.record(z.unknown()).optional(),
        runsIn: z.enum(["client", "server"]).optional(),
        display: z
          .object({
            icon: z.string().optional(),
            label: z.string().optional(),
            showArgs: z.boolean().optional(),
            showResult: z.boolean().optional(),
          })
          .optional(),
      }),
    )
    .max(MAX_TOOLS)
    .optional(),
  hostKnowledge: z
    .array(
      z.object({
        title: z.string().min(1).max(120),
        content: z.string().min(1).max(4000),
      }),
    )
    .max(MAX_KNOWLEDGE_ENTRIES)
    .optional()
    .refine(
      (k) => k === undefined || JSON.stringify(k).length <= HOST_KNOWLEDGE_MAX_BYTES,
      { message: `hostKnowledge exceeds ${HOST_KNOWLEDGE_MAX_BYTES} bytes` },
    ),
  visitorId: z.string().max(64).optional(),
  conversation: ConversationSchema.optional(),
});

function clientIp(c: Context): string {
  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  try {
    return getConnInfo(c).remote.address ?? "unknown";
  } catch {
    return "unknown";
  }
}

export const publicRouter = new Hono();

publicRouter.post(
  "/agent/run",
  describeRoute({
    tags: ["Public"],
    responses: {
      ...ndjsonOk,
      ...jsonError(403, "Origin not allowed"),
      ...jsonError(404, "Agent not found"),
      ...jsonError(429, "Rate limit exceeded"),
    },
  }),
  validator("json", RunBodySchema),
  async (c) => {
    const body = c.req.valid("json");
    const db = createServerClient();

    // 1. Resolve the agent. Missing and inactive are indistinguishable on purpose.
    // select("*") so a database that predates the allowed_origins migration
    // degrades to "no origins configured" instead of 404ing every agent.
    const { data: agent } = await db
      .from("agents")
      .select("*")
      .eq("public_id", body.agentPublicId)
      .single();
    if (!agent || !agent.is_active) {
      return c.json({ error: "agent not found" }, 404);
    }

    // 2. Origin allowlist. Empty list = open in development, locked in production.
    const origin = c.req.header("origin");
    const patterns = agent.allowed_origins ?? [];
    const isProd = process.env.NODE_ENV === "production";
    if (patterns.length > 0) {
      if (!origin || !matchOrigin(patterns, origin)) {
        return c.json({ error: "origin not allowed for this agent" }, 403);
      }
    } else if (isProd) {
      return c.json({ error: "agent has no allowed origins configured" }, 403);
    }

    // 3. Rate limits: per agent, then per client IP.
    for (const [limiter, key] of [
      [agentLimiter, `agent:${agent.public_id}`],
      [ipLimiter, `ip:${clientIp(c)}`],
    ] as const) {
      const result = limiter.check(key);
      if (!result.allowed) {
        c.header("X-RateLimit-Limit", String(result.limit));
        c.header("X-RateLimit-Remaining", "0");
        c.header("Retry-After", String(result.retryAfterSec));
        return c.json({ error: "rate limit exceeded" }, 429);
      }
    }

    // 4. Stream the run.
    let hostTools = body.hostTools;
    try {
      hostTools = parseHostTools(body.hostTools);
    } catch (err) {
      if (err instanceof ToolValidationError) {
        return c.json({ error: err.message, path: err.path }, 400);
      }
      throw err;
    }

    const stream = createNdjsonStream(c);
    const controller = new AbortController();
    c.req.raw.signal?.addEventListener("abort", () => controller.abort());

    void runAgent({
      agentPublicId: body.agentPublicId,
      pageUrl: body.pageUrl,
      query: body.query,
      hostState: body.hostState,
      hostTools: body.hostTools,
      hostKnowledge: body.hostKnowledge,
      visitorId: body.visitorId,
      conversation: body.conversation as Conversation | undefined,
      signal: controller.signal,
      onFrame: (frame) => stream.writeFrame(frame),
    })
      .catch((err) => {
        if (!controller.signal.aborted && !isAbortError(err)) {
          console.error("[public agent] run error", err);
        }
      })
      .finally(() => stream.close());

    return stream.response;
  },
);
