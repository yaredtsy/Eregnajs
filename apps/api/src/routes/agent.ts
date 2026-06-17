import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { createNdjsonStream } from "../services/agent/transport/ndjson.js";
import { runAgent } from "../services/agent/run.js";
import * as runs from "../services/agent/runs/index.js";
import { debugRouter } from "./debug.js";

const RunBodySchema = z.object({
  agentPublicId: z.string(),
  pageUrl: z.string().url(),
  query: z.string().min(1),
  hostState: z.record(z.unknown()).optional(),
  hostTools: z
    .array(
      z.object({
        name: z.string(),
        description: z.string(),
        parameters: z.record(z.unknown()).optional(),
      }),
    )
    .optional(),
  visitorId: z.string().optional(),
});

export const agentRouter = new Hono();

agentRouter.route("/debug", debugRouter);

agentRouter.post(
  "/run",
  zValidator("json", RunBodySchema),
  async (c) => {
    const body = c.req.valid("json");
    const stream = createNdjsonStream(c);
    const controller = new AbortController();

    // Detect client disconnect and abort the run.
    c.req.raw.signal?.addEventListener("abort", () => controller.abort());

    // Run is fire-and-stream: hold the connection open while the graph runs.
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
        if (!(err as Error)?.message?.includes("AbortError")) {
          console.error("[agent] run error", err);
        }
      })
      .finally(() => stream.close());

    return stream.response;
  },
);

agentRouter.get("/runs/:id", async (c) => {
  const id = c.req.param("id");
  const row = runs.load(id, c.get("userId"));
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json({ data: row });
});

agentRouter.get("/runs", async (c) => {
  const agentId = c.req.query("agentId");
  if (!agentId) return c.json({ error: "agentId required" }, 400);
  const limit = Number(c.req.query("limit") ?? 50);
  const offset = Number(c.req.query("offset") ?? 0);
  return c.json({ data: runs.listByAgent(agentId, c.get("userId"), limit, offset) });
});
