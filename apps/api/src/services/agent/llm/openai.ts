import { ChatOpenAI } from "@langchain/openai";

export function createOpenAIModel(modelName: string): ChatOpenAI {
  return new ChatOpenAI({
    model: modelName,
    temperature: 0.2,
    apiKey: process.env.OPENAI_API_KEY,
    // parallel_tool_calls deliberately NOT set at the model level —
    // it must only apply when tools are bound (orchestrator calls);
    // setting it here also poisons the planner's withStructuredOutput
    // calls, which use response_format and have no tools.
    // See docs/v2/11-walkthrough/fixes/03.
  });
}

/** Orchestrator-only: one tool call per assistant turn when tools are bound. */
export function bindOrchestratorOptions(model: ChatOpenAI) {
  return model.withConfig({ parallel_tool_calls: false });
}
