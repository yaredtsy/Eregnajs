import type { BaseMessage } from "@langchain/core/messages";
import { INTERRUPT, isInterrupted, type Command } from "@langchain/langgraph";
import { textFromChunk } from "@repo/walkthrough-core";
import type { ChatAgent } from "../workflow/chatAgent.js";
import type { RunnableConfig } from "@langchain/core/runnables";
import type { ChatEvent, ClientToolInterruptPayload } from "./events.js";
import { toPendingToolCallEvent } from "./events.js";
import type { Patcher } from "../patcher/createPatcher.js";
import * as h from "../patcher/helpers.js";

export interface StreamAgentResult {
  paused: boolean;
  interrupt?: ClientToolInterruptPayload;
}

export interface StreamAgentOpts {
  agent: ChatAgent;
  input: { messages: unknown[] } | Command;
  config: RunnableConfig;
  emit: (event: ChatEvent) => Promise<void>;
  patcher: Patcher;
  assistantMsgIndex: number;
  textPartIndex: number;
  signal?: AbortSignal;
}

function extractInterruptPayload(data: unknown): ClientToolInterruptPayload | null {
  if (!isInterrupted<ClientToolInterruptPayload>(data)) return null;
  const intr = data[INTERRUPT]?.[0];
  const value = intr?.value;
  if (value?.kind === "client-tool-call" && value.toolCallId) return value;
  return null;
}

/** Only AI message chunks carry assistant prose (not ToolMessage resume payloads). */
export function isAssistantStreamChunk(msg: unknown): boolean {
  if (typeof msg !== "object" || msg === null) return false;
  return (msg as { _getType?: () => string })._getType?.() === "ai";
}

/** Drop planner-internal structured-output tokens from the visitor wire stream. */
export function isPlannerInternalChunk(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object") return false;
  const tags = (metadata as { tags?: unknown }).tags;
  if (!Array.isArray(tags)) return false;
  return tags.includes("planner-internal");
}

function assertTextPart(
  patcher: Patcher,
  assistantMsgIndex: number,
  textPartIndex: number,
): void {
  const part = patcher.conversation.messages[assistantMsgIndex]?.parts[textPartIndex];
  if (!part || part.type !== "text") {
    throw new Error(
      `streamAgent: stale indices — msgCount=${patcher.conversation.messages.length}` +
        ` assistantMsgIndex=${assistantMsgIndex}` +
        ` partType=${part?.type ?? "missing"}`,
    );
  }
}

/** Stream createAgent output; emits chat events and patches conversation text. */
export async function streamAgent(opts: StreamAgentOpts): Promise<StreamAgentResult> {
  const {
    agent,
    input,
    config,
    emit,
    patcher,
    assistantMsgIndex,
    textPartIndex,
    signal,
  } = opts;

  const stream = await agent.stream(input, {
    ...config,
    streamMode: ["messages", "updates"],
    signal,
  });

  for await (const chunk of stream) {
    if (!Array.isArray(chunk)) continue;
    const [mode, payload] = chunk as [string, unknown];

    if (mode === "messages") {
      const tuple = payload as [unknown, unknown];
      const msg = tuple[0];
      const metadata = tuple[1];
      if (!isAssistantStreamChunk(msg)) continue;
      if (isPlannerInternalChunk(metadata)) continue;

      const text = textFromChunk(msg as BaseMessage);
      if (!text) continue;

      assertTextPart(patcher, assistantMsgIndex, textPartIndex);
      const logLen = patcher.getLog().length;
      h.appendTextChunk(patcher.conversation, assistantMsgIndex, textPartIndex, text);
      await patcher.emit();
      if (patcher.getLog().length === logLen) {
        throw new Error(
          `streamAgent: append produced no patch ops — assistantMsgIndex=${assistantMsgIndex}` +
            ` textPartIndex=${textPartIndex}`,
        );
      }
      await emit({ kind: "text-delta", text });
      continue;
    }

    if (mode === "updates") {
      const interruptPayload = extractInterruptPayload(payload);
      if (interruptPayload) {
        await emit(toPendingToolCallEvent(interruptPayload));
        return { paused: true, interrupt: interruptPayload };
      }
    }
  }

  return { paused: false };
}
