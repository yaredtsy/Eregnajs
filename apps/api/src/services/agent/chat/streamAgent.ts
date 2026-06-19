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
      const text = textFromChunk(msg);
      if (text) {
        h.appendTextChunk(patcher.conversation, assistantMsgIndex, textPartIndex, text);
        await patcher.emit();
        await emit({ kind: "text-delta", text });
      }
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
