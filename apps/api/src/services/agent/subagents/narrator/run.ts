import { HumanMessage } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { textFromChunk } from "@repo/walkthrough-core";
import { buildNarratorPrompt } from "./prompt.js";
import type { PlanChapter, StepSpec } from "../types.js";

// Returns an async iterable of text chunks for the popover body.
export async function* runNarrator(
  model: BaseChatModel,
  chapter: PlanChapter,
  step: StepSpec,
  stepIndex: number,
): AsyncGenerator<string> {
  const stream = await model.stream([
    new HumanMessage(buildNarratorPrompt(chapter, step, stepIndex)),
  ]);

  for await (const chunk of stream) {
    const text = textFromChunk(chunk);
    if (text) yield text;
  }
}
