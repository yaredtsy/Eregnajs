import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { createOpenAIModel } from "./openai.js";

// Maps an agent's model string to the appropriate LangChain chat model.
// Adding a new provider = one new branch here + one new file.
export function pickModel(modelName: string): BaseChatModel {
  if (modelName.startsWith("gpt-")) {
    return createOpenAIModel(modelName);
  }
  // Default: latest GPT-4o
  return createOpenAIModel("gpt-4o");
}
