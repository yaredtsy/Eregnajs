import { createMiddleware } from "langchain";
import { interrupt } from "@langchain/langgraph";
import { ToolMessage } from "@langchain/core/messages";
import type { ToolDescriptor } from "../../tools/types.js";
import type { ClientToolInterruptPayload } from "../../chat/events.js";

export function createClientToolInterruptMiddleware(specs: ToolDescriptor[]) {
  const specByName = new Map(specs.map((s) => [s.name, s]));

  return createMiddleware({
    name: "client-tool-interrupt",
    wrapToolCall: async (request, handler) => {
      const call = request.toolCall;
      const spec = specByName.get(call.name);
      if (spec?.runsIn !== "client") return await handler(request);

      const resumed = interrupt<Record<string, unknown>>({
        kind: "client-tool-call",
        toolCallId: call.id ?? "",
        name: call.name,
        args: (call.args ?? {}) as Record<string, unknown>,
      } satisfies ClientToolInterruptPayload);

      return new ToolMessage({
        tool_call_id: call.id ?? "",
        content: JSON.stringify(resumed),
      });
    },
  });
}
