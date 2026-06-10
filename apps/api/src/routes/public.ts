import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import { getConnInfo } from "hono/bun";
import { z } from "zod";
import { createServerClient } from "@repo/db/client";
import { createNdjsonStream } from "../services/agent/transport/ndjson.js";
import { runAgent } from "../services/agent/run.js";
import { matchOrigin } from "../lib/matchOrigin.js";
import { createRateLimiter } from "../lib/rateLimit.js";

// The visitor-facing surface (docs/v2/3-server/06 §2). No JWT — admission is
// public_id + per-agent origin allowlist + rate limits, all checked before
// any LLM spend.

const agentLimiter = createRateLimiter({ capacity: 30, refillPerMinute: 30 });
const ipLimiter = createRateLimiter({ capacity: 6, refillPerMinute: 6 });

const HOST_STATE_MAX_BYTES = 16 * 1024;
const MAX_TOOLS = 20;

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
        name: z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/),
        description: z.string().max(500),
        parameters: z.record(z.unknown()).optional(),
      }),
    )
    .max(MAX_TOOLS)
    .optional(),
  visitorId: z.string().max(64).optional(),
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
  zValidator("json", RunBodySchema),
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
    const stream = createNdjsonStream(c);
    const controller = new AbortController();
    c.req.raw.signal?.addEventListener("abort", () => controller.abort());

    void runAgent({
      agentPublicId: body.agentPublicId,
      pageUrl: body.pageUrl,
      query: body.query,
      hostState: body.hostState,
      hostTools: body.hostTools,
      visitorId: body.visitorId,
      signal: controller.signal,
      onFrame: (frame) => stream.writeFrame(frame),
    })
      .catch((err) => {
        if (!controller.signal.aborted) {
          console.error("[public agent] run error", err);
        }
      })
      .finally(() => stream.close());

    return stream.response;
  },
);
