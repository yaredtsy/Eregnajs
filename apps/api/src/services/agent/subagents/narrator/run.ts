import { HumanMessage } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { textFromChunk } from "@repo/walkthrough-core";
import type { TokenUsageCounts } from "@repo/walkthrough-core";
import type { TokenLedger } from "../../telemetry/index.js";
import {
  extractTokenUsage,
  recordStreamUsage,
  trackStream,
} from "../../telemetry/index.js";
import { emptyUsage, isNonZeroUsage, sumTokenUsage } from "../../telemetry/normalize.js";
import { buildNarratorPrompt } from "./prompt.js";
import type { PlanChapter, StepSpec } from "../types.js";

export interface NarratorRunOpts {
  ledger?: TokenLedger;
  model?: string;
  chapterIndex?: number;
  stepIndex?: number;
}

export interface NarratorRunResult {
  text: string;
  usage: TokenUsageCounts;
}

// Returns an async iterable of text chunks for the popover body.
export async function* runNarrator(
  model: BaseChatModel,
  chapter: PlanChapter,
  step: StepSpec,
  stepIndex: number,
  opts?: NarratorRunOpts,
): AsyncGenerator<string> {
  const messages = [new HumanMessage(buildNarratorPrompt(chapter, step, stepIndex))];

  if (opts?.ledger) {
    const gen = trackStream(model, messages);
    let result = await gen.next();
    while (!result.done) {
      yield result.value;
      result = await gen.next();
    }
    const usage = result.value ?? emptyUsage();
    recordStreamUsage(opts.ledger, "narrator", usage, {
      model: opts.model,
      meta: { chapterIndex: opts.chapterIndex, stepIndex: opts.stepIndex ?? stepIndex },
    });
    return;
  }

  const stream = await model.stream(messages);
  for await (const chunk of stream) {
    const text = textFromChunk(chunk);
    if (text) yield text;
  }
}

export async function runNarratorFull(
  model: BaseChatModel,
  chapter: PlanChapter,
  step: StepSpec,
  stepIndex: number,
  opts?: NarratorRunOpts,
): Promise<NarratorRunResult> {
  let text = "";
  let usage = emptyUsage();

  if (opts?.ledger) {
    const gen = trackStream(model, messagesFor(chapter, step, stepIndex));
    let result = await gen.next();
    while (!result.done) {
      text += result.value;
      result = await gen.next();
    }
    usage = result.value ?? emptyUsage();
    recordStreamUsage(opts.ledger, "narrator", usage, {
      model: opts.model,
      meta: { chapterIndex: opts.chapterIndex, stepIndex: opts.stepIndex ?? stepIndex },
    });
    return { text, usage };
  }

  const stream = await model.stream(messagesFor(chapter, step, stepIndex));
  for await (const chunk of stream) {
    const chunkUsage = extractTokenUsage(chunk);
    if (isNonZeroUsage(chunkUsage)) {
      usage =
        chunkUsage.totalTokens > usage.totalTokens ? chunkUsage : sumTokenUsage(usage, chunkUsage);
    }
    text += textFromChunk(chunk);
  }

  return { text, usage };
}

function messagesFor(chapter: PlanChapter, step: StepSpec, stepIndex: number) {
  return [new HumanMessage(buildNarratorPrompt(chapter, step, stepIndex))];
}
